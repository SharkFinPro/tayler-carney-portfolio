// Gemini implementation of the ImageDescriber contract.
//
// Exists because Gemini has a free tier that includes vision, and alt text is
// the one AI call in this app cheap enough and frequent enough for that to
// matter. Kept behind `types.ts` exactly like the Anthropic one: nothing else
// in the app imports this SDK.
//
// Note it implements ImageDescriber and NOT PageGenerator. Page drafting uses
// structured outputs against a JSON schema and a much larger prompt; porting
// that is a separate job, and pretending otherwise by half-implementing it
// would leave a provider that works for one feature and silently fails at the
// other.

import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { ImageDescriber, ImageDescriptionInput } from "./types";
import { ALT_TEXT_MAX_TOKENS, ALT_TEXT_SYSTEM_PROMPT, altTextUserPrompt } from "./prompts";
import { fetchImageAsInline, GEMINI_IMAGE_TYPES, ImageFetchError } from "./fetchImage";

/**
 * Default model. Overridable without a redeploy, which matters more here than
 * on the paid path: free-tier rate limits differ per model, so the fix for
 * "we keep getting 429" is a different model rather than a code change.
 */
const DEFAULT_MODEL = "gemini-3.7-flash";

function isSupportedType(value: string): boolean {
  return (GEMINI_IMAGE_TYPES as readonly string[]).includes(value.toLowerCase());
}

/** Resolve either source shape to the inline bytes Gemini needs. */
async function toInline(source: ImageDescriptionInput["source"]) {
  if (source.kind === "url") return fetchImageAsInline(source.url);

  if (!isSupportedType(source.mediaType)) {
    throw new ImageFetchError("That image format isn't supported for suggestions.");
  }
  return { mediaType: source.mediaType, base64: source.base64 };
}

export function createGeminiDescriber(apiKey: string, model = DEFAULT_MODEL): ImageDescriber {
  const client = new GoogleGenAI({ apiKey });

  return {
    name: `gemini:${model}`,

    async describeImage(input: ImageDescriptionInput): Promise<string> {
      const image = await toInline(input.source);

      const response = await client.models.generateContent({
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
        },
      });

      // A safety block is an ordinary outcome for an image the model won't
      // describe, and it arrives as an empty response rather than an error —
      // so it has to be read off the metadata or it looks like a bug.
      const blocked = response.promptFeedback?.blockReason;
      if (blocked) {
        throw new Error(`The model declined to describe this image (${blocked}).`);
      }

      const finish = response.candidates?.[0]?.finishReason;
      if (finish && finish !== "STOP" && finish !== "MAX_TOKENS") {
        throw new Error(`The model declined to describe this image (${finish}).`);
      }

      return response.text ?? "";
    },
  };
}
