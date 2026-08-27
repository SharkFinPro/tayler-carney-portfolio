// Gemini implementation of both AI contracts.
//
// This is the only file in the app that imports an AI SDK. Everything else —
// the Server Actions, the mapping layer, the tests — speaks `PageGenerator`
// and `ImageDescriber` from types.ts, which is what made replacing the
// previous provider a matter of writing this file and deleting that one.
//
// Gemini specifically because it has a free tier that includes image input,
// and both features here are image-driven.

import "server-only";
import { GoogleGenAI } from "@google/genai";
import type {
  GenerationInput,
  GeneratedPage,
  GenerationResult,
  ImageDescriber,
  ImageDescriptionInput,
  PageGenerator,
  SourceImage,
} from "./types";
import {
  ALT_TEXT_MAX_TOKENS,
  ALT_TEXT_SYSTEM_PROMPT,
  altTextUserPrompt,
  PAGE_SCHEMA,
  PAGE_SYSTEM_PROMPT,
  pageBrief,
} from "./prompts";
import {
  fetchImageAsInline,
  fetchImagesWithinBudget,
  GEMINI_IMAGE_TYPES,
  ImageFetchError,
} from "./fetchImage";

/**
 * An ordered list of models to try. Non-empty by construction, so the first
 * entry can be read as the preferred one without a guard at every use.
 */
export type ModelChain = readonly [string, ...string[]];

/**
 * Default model chains, both overridable without a redeploy.
 *
 * Ordered by measurement, not by reading the model list. On this account's
 * free tier the newest models are the contended ones: `gemini-3.7-flash` and
 * `gemini-3.5-flash` both returned 503 "experiencing high demand" for a page
 * draft, while 3.6-flash answered in 14s and 3.5-flash-lite in 21s. (And
 * `gemini-2.5-flash`, which the model docs still list, is retired — 404.)
 *
 * So: the page draft leads with 3.6-flash, the fastest thing that reliably
 * answers, and alt text leads with flash-lite, which is plenty for one
 * sentence and is the least contended tier — it is also the call made far more
 * often.
 *
 * The rest of each chain is what to try when the leader will not serve. This
 * is not a hypothetical: free-tier quota is per-model and per-day, so the
 * model that worked all morning is the one that stops working at teatime,
 * while its neighbours have a full allowance. A retired model in a chain costs
 * nothing either — a 404 is treated as "unavailable" and the next one is
 * tried — so a stale entry degrades to a wasted round-trip rather than to a
 * broken feature.
 *
 * Env-overridable because none of this holds still: a model that answers today
 * may be busy, retired, or superseded tomorrow, and that should be a config
 * change rather than a deploy.
 */
const DEFAULT_PAGE_MODELS: ModelChain = [
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
];

const DEFAULT_ALT_MODELS: ModelChain = [
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
];

/** Room for a full page draft. One sentence of alt text needs far less. */
const PAGE_MAX_TOKENS = 16_000;

/**
 * Ceiling on one call.
 *
 * Without it the only bound on a hung request is whatever the host eventually
 * kills, and the rate limiter counts requests rather than seconds — so a
 * provider having a bad day holds Server Action slots open instead of failing
 * and letting the admin try again.
 */
const REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

type InlineImage = { mediaType: string; base64: string };

function isSupportedType(value: string): boolean {
  return (GEMINI_IMAGE_TYPES as readonly string[]).includes(value.toLowerCase());
}

/** Resolve either source shape to the inline bytes Gemini needs. */
async function toInline(source: ImageDescriptionInput["source"]): Promise<InlineImage> {
  if (source.kind === "url") return fetchImageAsInline(source.url);

  if (!isSupportedType(source.mediaType)) {
    throw new ImageFetchError("That image format isn't supported for suggestions.");
  }
  return { mediaType: source.mediaType, base64: source.base64 };
}

/** An abort signal that fires after `REQUEST_TIMEOUT_MS`, plus its cleanup. */
function withTimeout(): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

/**
 * Backoff between retries of a busy model, in milliseconds.
 *
 * The free tier returns 503 "This model is currently experiencing high demand"
 * often enough to be an ordinary outcome rather than an incident — both of the
 * newest Flash models did it while this was being written. The message says
 * the spike is usually temporary, and it is: a second attempt a moment later
 * generally lands.
 *
 * Deliberately short and finite. Three attempts adds at most ~4s to a call
 * that already takes 15, and never turns a genuine outage into a hang.
 */
const RETRY_BACKOFF_MS = [1_000, 3_000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Whether an error is the provider saying "busy, try again" rather than
 * "you asked for something wrong".
 *
 * Only 503/UNAVAILABLE. Notably NOT 429: that is a quota refusal, and retrying
 * it spends the quota that is already exhausted.
 */
function isTransient(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status === 503) return true;

  const message = error instanceof Error ? error.message : String(error);
  return /"code":\s*503|UNAVAILABLE|experiencing high demand/i.test(message);
}

/**
 * Run `attempt`, retrying only while the provider says it is busy.
 *
 * Exported for its suite: the distinction it draws — retry a 503, never retry
 * a 429 — is the kind that is easy to get backwards and impossible to see
 * from the outside once it is.
 */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  wait: (ms: number) => Promise<unknown> = sleep
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (error) {
      const backoff = RETRY_BACKOFF_MS[i];
      if (backoff === undefined || !isTransient(error)) throw error;
      await wait(backoff);
    }
  }
}

/**
 * Whether an error means "this model will not serve you" rather than "your
 * request is wrong".
 *
 * The distinction is the whole point of trying another model. A spent quota
 * (429) or a model that no longer exists (404) is specific to the model, and
 * the next one in the chain may well answer. A 400 is not: the request is
 * malformed, every model will reject it identically, and walking the chain
 * would turn one fast failure into four slow ones and bury the real cause. A
 * safety refusal is the same — it is about the content, not the model.
 *
 * 503 counts, but only once `withRetry` has already given up on it: a model
 * that is still busy after three attempts is not going to be free a second
 * later, and the point of a chain is having somewhere else to go.
 *
 * Exported for its suite, like `withRetry` — this is another judgement that is
 * easy to get backwards and invisible from the outside once it is.
 */
export function isModelUnavailable(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status === 429 || status === 404) return true;
  if (isTransient(error)) return true;

  const message = error instanceof Error ? error.message : String(error);
  return /"code":\s*(429|404)|RESOURCE_EXHAUSTED|NOT_FOUND|exceeded your current quota/i.test(
    message
  );
}

/**
 * Run `call` against each model in turn until one answers.
 *
 * Reports which model served, because with a chain that is no longer implied
 * by configuration — a log line saying the draft came from the third choice is
 * how anyone finds out the first two are out of quota.
 *
 * Exported for its suite.
 */
export async function acrossModels<T>(
  models: ModelChain,
  call: (model: string) => Promise<T>,
  wait?: (ms: number) => Promise<unknown>
): Promise<{ value: T; model: string }> {
  let lastError: unknown;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    if (model === undefined) continue;

    try {
      return { value: await withRetry(() => call(model), wait), model };
    } catch (error) {
      lastError = error;

      const next = models[i + 1];
      // The last model's failure is the caller's failure, and a request the
      // model was right to reject must not be retried three more times.
      if (next === undefined || !isModelUnavailable(error)) throw error;

      console.info(`[ai] ${model} unavailable, trying ${next}`);
    }
  }

  throw lastError;
}

/**
 * Turn a refusal into a thrown error.
 *
 * A safety block is an ordinary outcome, and it arrives as an *empty response*
 * rather than as an API error — so without this it reads as "the model
 * returned nothing", which is indistinguishable from a bug.
 */
function assertNotBlocked(response: {
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string }[];
}): void {
  const blocked = response.promptFeedback?.blockReason;
  if (blocked) throw new Error(`The model declined this request (${blocked}).`);

  const finish = response.candidates?.[0]?.finishReason;
  if (finish && finish !== "STOP" && finish !== "MAX_TOKENS") {
    throw new Error(`The model declined this request (${finish}).`);
  }
}

export function createGeminiGenerator(
  apiKey: string,
  models: ModelChain = DEFAULT_PAGE_MODELS
): PageGenerator {
  const client = new GoogleGenAI({ apiKey });

  return {
    // The preferred model, which is the honest answer to "what is configured".
    // Which one actually served a given draft comes back on the result.
    name: `gemini:${models[0]}`,

    async generateProjectPage(input: GenerationInput): Promise<GenerationResult> {
      // Gemini takes image bytes inline rather than fetching a URL, so every
      // image is fetched here — in bounded parallel, and only for as many as
      // fit the request. How many that is depends on their size rather than
      // their number, which is why there is no count limit above this.
      const { attached, skipped: unseen } = await fetchImagesWithinBudget(input.images);

      const parts = attached.map(({ inline }) => ({
        inlineData: { mimeType: inline.mediaType, data: inline.base64 },
      }));
      const usable: SourceImage[] = attached.map(({ image }) => image);

      // The brief lists only the images actually attached, and the token for
      // each one is its position in THIS list — a model cannot be asked to
      // reference an image whose bytes never arrived. `toBlocks` places those
      // afterwards, so nothing is lost by leaving them out of the brief.
      const brief = pageBrief({ ...input, images: usable });

      const { signal, done } = withTimeout();
      try {
        const { value: response, model } = await acrossModels(models, (candidate) =>
          client.models.generateContent({
            model: candidate,
            // Images first, then the brief: the model reads the visual
            // evidence before the instructions about what to do with it.
            contents: [{ role: "user", parts: [...parts, { text: brief }] }],
            config: {
              systemInstruction: PAGE_SYSTEM_PROMPT,
              maxOutputTokens: PAGE_MAX_TOKENS,
              responseMimeType: "application/json",
              responseJsonSchema: PAGE_SCHEMA,
              abortSignal: signal,
            },
          })
        );

        assertNotBlocked(response);

        const text = response.text ?? "";
        if (!text.trim()) throw new Error("The model returned an empty draft.");

        // Structured outputs guarantee the shape, but this still parses
        // untrusted text — a throw here is caught by the caller and reported
        // as a failed draft rather than crashing the action.
        return { page: JSON.parse(text) as GeneratedPage, unseen, model };
      } finally {
        done();
      }
    },
  };
}

export function createGeminiDescriber(
  apiKey: string,
  models: ModelChain = DEFAULT_ALT_MODELS
): ImageDescriber {
  const client = new GoogleGenAI({ apiKey });

  return {
    name: `gemini:${models[0]}`,

    async describeImage(input: ImageDescriptionInput): Promise<string> {
      const image = await toInline(input.source);
      const { signal, done } = withTimeout();

      try {
        const { value: response } = await acrossModels(models, (candidate) =>
          client.models.generateContent({
            model: candidate,
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { mimeType: image.mediaType, data: image.base64 } },
                  { text: altTextUserPrompt(input.name) },
                ],
              },
            ],
            config: {
              systemInstruction: ALT_TEXT_SYSTEM_PROMPT,
              maxOutputTokens: ALT_TEXT_MAX_TOKENS,
              abortSignal: signal,
            },
          })
        );

        assertNotBlocked(response);
        return response.text ?? "";
      } finally {
        done();
      }
    },
  };
}
