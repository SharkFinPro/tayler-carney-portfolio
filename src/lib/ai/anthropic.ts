// Anthropic implementation of the PageGenerator contract.
//
// Kept behind `types.ts` so the SDK is imported in exactly one place. Nothing
// else in the app references `@anthropic-ai/sdk`, which is what makes swapping
// or adding a provider a matter of writing one more file.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  ALT_TEXT_MAX_TOKENS,
  ALT_TEXT_SYSTEM_PROMPT,
  altTextUserPrompt,
} from "./prompts";
import type {
  GenerationInput,
  GeneratedPage,
  ImageDescriber,
  ImageDescriptionInput,
  PageGenerator,
} from "./types";

/**
 * JSON Schema for the response.
 *
 * Structured outputs constrain the model to this shape, so the Server Action
 * never has to parse loose prose or repair broken JSON. `additionalProperties:
 * false` throughout keeps the output to exactly the vocabulary `toBlocks`
 * understands.
 */
const PAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sections"],
  properties: {
    sections: {
      type: "array",
      minItems: 2,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "heading"],
        properties: {
          kind: {
            type: "string",
            enum: ["intro", "prose", "gallery", "captioned", "specs", "timeline"],
          },
          heading: { type: "string" },
          eyebrow: { type: "string" },
          body: { type: "string" },
          layout: { type: "string", enum: ["grid", "feature"] },
          imageUrls: { type: "array", items: { type: "string" } },
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["imageUrl", "title", "description"],
              properties: {
                imageUrl: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
              },
            },
          },
          rows: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "value"],
              properties: { label: { type: "string" }, value: { type: "string" } },
            },
          },
          stages: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["marker", "title", "description"],
              properties: {
                marker: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You draft case-study pages for a structural fashion design portfolio.

The site's voice is editorial and technical: precise, concrete, unhurried. It
documents garment engineering — pattern-making, material research, construction
— and treats each piece as a structural problem. Write like a design archive,
not like marketing copy.

Rules:
- Write only from what the designer told you and what you can see in the images.
  Never invent techniques, materials, measurements, dates, collaborators, or
  awards. If you don't know something, leave it out.
- Use ONLY the image URLs supplied in the user message, exactly as given. Never
  construct, guess, or modify a URL.
- Prefer specific observation over adjectives. "A bias-cut wool panel seamed off
  the shoulder" beats "a beautiful flowing design".
- No first-person plural, no exclamation marks, no phrases like "stunning",
  "showcase", "elevate", "journey", or "dive into".
- Open with one 'intro' section. Follow it with 2 to 6 more that suit the
  material you actually have. Do not pad the page to fill the schema.
- 'specs' rows should hold real, factual attributes (Material, Construction,
  Year) — only ones the designer stated or that are plainly visible.
- 'timeline' is for process stages, and only when the designer described a
  process. Otherwise omit it.`;

/** Default model. Overridable for cost or capability reasons without a redeploy. */
const DEFAULT_MODEL = "claude-opus-5";

/**
 * Ceiling on one drafting call.
 *
 * Without it the only bound on a hung provider request is whatever the hosting
 * platform eventually kills, and the rate limiter counts requests rather than
 * seconds — so a provider having a bad day holds Server Action slots open
 * instead of failing and letting the admin try again. Generous: a full page
 * with adaptive thinking genuinely takes tens of seconds.
 */
const REQUEST_TIMEOUT_MS = 3 * 60 * 1000;

function buildUserContent(input: GenerationInput): Anthropic.ContentBlockParam[] {
  const answered = input.answers.filter((a) => a.answer.trim());

  const brief = [
    `Project title: ${input.title}`,
    "",
    answered.length
      ? answered.map((a) => `Q: ${a.question}\nA: ${a.answer.trim()}`).join("\n\n")
      : "(The designer did not answer the questions — work from the images alone.)",
    "",
    "Images available for this page, with the exact URLs you must use:",
    ...input.images.map((img, i) => `${i + 1}. ${img.name} — ${img.url}`),
  ].join("\n");

  // Images first, then the brief: the model reads the visual evidence before
  // the instructions about what to do with it.
  return [
    ...input.images.map(
      (img): Anthropic.ContentBlockParam => ({
        type: "image",
        source: { type: "url", url: img.url },
      })
    ),
    { type: "text", text: brief },
  ];
}

export function createAnthropicGenerator(apiKey: string, model = DEFAULT_MODEL): PageGenerator {
  const client = new Anthropic({ apiKey });

  return {
    name: `anthropic:${model}`,

    async generateProjectPage(input: GenerationInput): Promise<GeneratedPage> {
      // Streaming because a full page draft with adaptive thinking can run
      // long enough to bump the non-streaming HTTP timeout.
      const stream = client.messages.stream({
        model,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserContent(input) }],
        output_config: {
          format: {
            type: "json_schema",
            schema: PAGE_SCHEMA,
          },
        },
      }, { timeout: REQUEST_TIMEOUT_MS });

      const message = await stream.finalMessage();

      // A safety decline is a normal outcome, not an exception — check before
      // reading content.
      if (message.stop_reason === "refusal") {
        throw new Error("The model declined to draft this page.");
      }

      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      if (!text.trim()) {
        throw new Error("The model returned an empty draft.");
      }

      // Structured outputs guarantee the shape, but this still parses untrusted
      // text — a throw here is caught by the caller and reported as a failed
      // draft rather than crashing the action.
      return JSON.parse(text) as GeneratedPage;
    },
  };
}

// ── Image description ────────────────────────────────────────────────────────

// The prompt lives in prompts.ts: two providers write alt text for this same
// library now, and a private copy in each would drift.

/** Default model for descriptions — a smaller one is plenty for one sentence. */
const DEFAULT_ALT_MODEL = "claude-sonnet-5";



function altUserContent(input: ImageDescriptionInput): Anthropic.ContentBlockParam[] {
  const image: Anthropic.ContentBlockParam =
    input.source.kind === "url"
      ? { type: "image", source: { type: "url", url: input.source.url } }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: input.source.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: input.source.base64,
          },
        };

  return [image, { type: "text", text: altTextUserPrompt(input.name) }];
}

export function createAnthropicDescriber(apiKey: string, model = DEFAULT_ALT_MODEL): ImageDescriber {
  const client = new Anthropic({ apiKey });

  return {
    name: `anthropic:${model}`,

    async describeImage(input: ImageDescriptionInput): Promise<string> {
      const message = await client.messages.create({
        model,
        max_tokens: ALT_TEXT_MAX_TOKENS,
        system: ALT_TEXT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: altUserContent(input) }],
      });

      // A decline is an ordinary outcome for an image the model won't describe.
      if (message.stop_reason === "refusal") {
        throw new Error("The model declined to describe this image.");
      }

      return message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
    },
  };
}
