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
import { fetchImageAsInline, GEMINI_IMAGE_TYPES, ImageFetchError } from "./fetchImage";

/**
 * Default models, both overridable without a redeploy.
 *
 * Chosen by measurement, not by reading the model list. On this account's free
 * tier the newest models are the contended ones: `gemini-3.7-flash` and
 * `gemini-3.5-flash` both returned 503 "experiencing high demand" for a page
 * draft, while 3.6-flash answered in 14s and 3.5-flash-lite in 21s. (And
 * `gemini-2.5-flash`, which the model docs still list, is retired — 404.)
 *
 * So: the page draft gets 3.6-flash, which is the fastest thing that reliably
 * answers, and alt text gets flash-lite, which is plenty for one sentence and
 * is the least contended tier — it is also the call made far more often.
 *
 * Both are env-overridable because 503s move around: a model that answers
 * today may be busy tomorrow, and that should be a config change.
 */
const DEFAULT_PAGE_MODEL = "gemini-3.6-flash";
const DEFAULT_ALT_MODEL = "gemini-3.5-flash-lite";

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

export function createGeminiGenerator(apiKey: string, model = DEFAULT_PAGE_MODEL): PageGenerator {
  const client = new GoogleGenAI({ apiKey });

  return {
    name: `gemini:${model}`,

    async generateProjectPage(input: GenerationInput): Promise<GeneratedPage> {
      // Gemini takes image bytes inline rather than fetching a URL, so every
      // image is fetched here. In parallel, because a dozen sequential
      // round-trips to the asset host would dominate the request.
      //
      // A settled result rather than Promise.all: one unreachable asset should
      // cost that image, not the whole draft. `fetchImageAsInline` downscales,
      // which is what keeps twelve of these inside the 20MB request ceiling.
      const fetched = await Promise.allSettled(
        input.images.map((img) => fetchImageAsInline(img.url))
      );

      const parts: { inlineData: { mimeType: string; data: string } }[] = [];
      const usable: SourceImage[] = [];
      fetched.forEach((result, i) => {
        const image = input.images[i];
        if (result.status !== "fulfilled" || !image) return;
        parts.push({
          inlineData: { mimeType: result.value.mediaType, data: result.value.base64 },
        });
        usable.push(image);
      });

      // The brief lists only the images actually attached. Listing a URL whose
      // bytes never arrived would invite the model to reference an image it
      // cannot see, and `toBlocks` would then drop the section for having an
      // image the admin "did not supply" — a confusing way to fail.
      const brief = pageBrief({ ...input, images: usable });

      const { signal, done } = withTimeout();
      try {
        const response = await withRetry(() =>
          client.models.generateContent({
            model,
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
        return JSON.parse(text) as GeneratedPage;
      } finally {
        done();
      }
    },
  };
}

export function createGeminiDescriber(apiKey: string, model = DEFAULT_ALT_MODEL): ImageDescriber {
  const client = new GoogleGenAI({ apiKey });

  return {
    name: `gemini:${model}`,

    async describeImage(input: ImageDescriptionInput): Promise<string> {
      const image = await toInline(input.source);
      const { signal, done } = withTimeout();

      try {
        const response = await withRetry(() =>
          client.models.generateContent({
            model,
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
