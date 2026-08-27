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
import { createGeminiDescriber, createGeminiGenerator, type ModelChain } from "./gemini";
import type { ImageDescriber, PageGenerator } from "./types";

const apiKey = () => process.env.GEMINI_API_KEY?.trim();

/**
 * Read a comma-separated model chain from an env var.
 *
 * A list rather than one name because a provider tries them in order until one
 * answers, and the reason to override in the first place is usually that the
 * default leader has stopped answering. A single name is still valid input —
 * it is a chain of one, which pins the model and disables the fallback.
 *
 * Anything unparseable (empty, all whitespace, all commas) yields undefined and
 * the provider keeps its own defaults, rather than throwing: a typo in an
 * optional env var should not take the feature offline.
 */
function modelChain(raw: string | undefined): ModelChain | undefined {
  const [first, ...rest] = (raw ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  return first === undefined ? undefined : [first, ...rest];
}

/**
 * The configured page generator, or null when AI drafting is not set up.
 */
export function getPageGenerator(): PageGenerator | null {
  const key = apiKey();
  if (!key) return null;

  // Optional override, so the models can be changed without a code change.
  return createGeminiGenerator(key, modelChain(process.env.GEMINI_PAGE_MODEL));
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

  return createGeminiDescriber(key, modelChain(process.env.GEMINI_ALT_TEXT_MODEL));
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
