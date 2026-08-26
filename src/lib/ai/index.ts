// Selects the configured AI providers, or none.
//
// Every AI feature is optional. With no API key configured the getters return
// null, the Server Actions report the feature as unavailable, and the admin UI
// hides its entry points — no broken button, no runtime error, and no
// requirement that anyone hold a key just to run the site.

import "server-only";
import { createAnthropicDescriber, createAnthropicGenerator } from "./anthropic";
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
 * The configured image describer, or null when AI is not set up.
 *
 * Defaults to a smaller model than page drafting, overridable the same way:
 * one sentence about one image is not the same job as writing a case study,
 * and this one is called far more often.
 */
export function getImageDescriber(): ImageDescriber | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.AI_ALT_TEXT_MODEL?.trim() || undefined;
  return createAnthropicDescriber(apiKey, model);
}

/** Whether alt-text suggestions are available, without constructing a client. */
export function isImageDescriptionConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
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
