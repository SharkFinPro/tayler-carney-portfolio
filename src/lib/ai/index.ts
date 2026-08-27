// Selects the configured AI providers, or none.
//
// Every AI feature is optional. With no API key configured the getters return
// null, the Server Actions report the feature as unavailable, and the admin UI
// hides its entry points — no broken button, no runtime error, and no
// requirement that anyone hold a key just to run the site.
//
// One key, one provider, both features. Adding a second provider means adding
// one implementation file and a branch here; nothing else in the app imports
// an AI SDK, which is the point of the interfaces in types.ts.

import "server-only";
import { createGeminiDescriber, createGeminiGenerator } from "./gemini";
import type { ImageDescriber, PageGenerator } from "./types";

const apiKey = () => process.env.GEMINI_API_KEY?.trim();

/**
 * The configured page generator, or null when AI drafting is not set up.
 */
export function getPageGenerator(): PageGenerator | null {
  const key = apiKey();
  if (!key) return null;

  // Optional override, so the model can be changed without a code change.
  const model = process.env.GEMINI_PAGE_MODEL?.trim() || undefined;
  return createGeminiGenerator(key, model);
}

/** Whether AI drafting is available, without constructing a client. */
export function isPageGenerationConfigured(): boolean {
  return Boolean(apiKey());
}

/**
 * The configured image describer, or null when AI is not set up.
 *
 * Separately overridable from the page model on purpose: alt text is one
 * sentence about one image and is called far more often, so it is the one
 * worth pointing at a smaller or less rate-limited model when a free-tier
 * quota starts biting.
 */
export function getImageDescriber(): ImageDescriber | null {
  const key = apiKey();
  if (!key) return null;

  const model = process.env.GEMINI_ALT_TEXT_MODEL?.trim() || undefined;
  return createGeminiDescriber(key, model);
}

/** Whether alt-text suggestions are available, without constructing a client. */
export function isImageDescriptionConfigured(): boolean {
  return Boolean(apiKey());
}

export type {
  GenerationInput,
  GeneratedPage,
  GenerationResult,
  ImageDescriber,
  ImageDescriptionInput,
  ImageSource,
  PageGenerator,
  SourceImage,
} from "./types";
export { DRAFT_QUESTIONS } from "./types";
