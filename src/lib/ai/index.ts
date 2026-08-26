// Selects the configured page generator, or none.
//
// The whole feature is optional. With no API key configured, `getPageGenerator`
// returns null, the Server Action reports the feature as unavailable, and the
// admin UI hides its entry point — no broken button, no runtime error, and no
// requirement that anyone hold a key just to run the site.

import "server-only";
import { createAnthropicGenerator } from "./anthropic";
import type { PageGenerator } from "./types";

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

export type { GenerationInput, GeneratedPage, PageGenerator, SourceImage } from "./types";
export { DRAFT_QUESTIONS } from "./types";
