// Selects the configured AI providers, or none.
//
// Every AI feature is optional. With no API key configured the getters return
// null, the Server Actions report the feature as unavailable, and the admin UI
// hides its entry points — no broken button, no runtime error, and no
// requirement that anyone hold a key just to run the site.

import "server-only";
import { createAnthropicDescriber, createAnthropicGenerator } from "./anthropic";
import { createGeminiDescriber } from "./gemini";
import type { ImageDescriber, PageGenerator } from "./types";

/**
 * The configured generator, or null when AI drafting is not set up.
 *
 * Adding a provider means adding a branch here and one implementation file;
 * nothing else in the app imports a provider SDK directly.
 */
export function getPageGenerator(): PageGenerator | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  // Optional override, so the model can be changed without a code change.
  const model = process.env.AI_PAGE_MODEL?.trim() || undefined;
  return createAnthropicGenerator(apiKey, model);
}

/** Whether AI drafting is available, without constructing a client. */
export function isPageGenerationConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/**
 * The configured image describer, or null when neither provider is set up.
 *
 * Gemini wins when both keys are present, and that is deliberate rather than
 * arbitrary: alt text is the one call in this app made often enough for the
 * difference between a free tier and a metered one to matter, and describing
 * one image in one sentence is not a job that needs the larger model. Page
 * drafting is unaffected — it stays on Anthropic, which is the only provider
 * implementing `PageGenerator`.
 *
 * Both are overridable by model without a redeploy. That matters more on the
 * free tier, where rate limits differ per model, so the fix for repeated 429s
 * is a config change rather than a code change.
 */
export function getImageDescriber(): ImageDescriber | null {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    const model = process.env.GEMINI_ALT_TEXT_MODEL?.trim() || undefined;
    return createGeminiDescriber(geminiKey, model);
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!anthropicKey) return null;

  const model = process.env.AI_ALT_TEXT_MODEL?.trim() || undefined;
  return createAnthropicDescriber(anthropicKey, model);
}

/** Whether alt-text suggestions are available, without constructing a client. */
export function isImageDescriptionConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim());
}

export type {
  GenerationInput,
  GeneratedPage,
  ImageDescriber,
  ImageDescriptionInput,
  ImageSource,
  PageGenerator,
  SourceImage,
} from "./types";
export { DRAFT_QUESTIONS } from "./types";
