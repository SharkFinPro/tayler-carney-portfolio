// Provider-agnostic contracts for the AI-assisted features.
//
// The interface exists so the Anthropic implementation is a detail rather than
// a dependency of the rest of the app: the Server Action, the mapping layer,
// and the tests all speak this contract, and a different provider (or a fake)
// drops in without touching them.
//
// This module is pure — no SDK import, no server-only import — so the mapping
// and validation around it stay testable without any network or key.

/** An image the model may use. URLs are the Media Library's own asset URLs. */
export type SourceImage = {
  url: string;
  /** Media Library title or filename, to help the model caption sensibly. */
  name: string;
  /** Author-supplied alt text, when the asset has any. */
  altText?: string;
};

export type GenerationInput = {
  /** Project title — the model treats this as the subject of the page. */
  title: string;
  /** Short answers to the drafting questions, in order asked. */
  answers: { question: string; answer: string }[];
  /** Images the page may reference. The model must not invent any others. */
  images: SourceImage[];
};

/**
 * The shape the model is asked to produce.
 *
 * Deliberately NOT the full `Block` union. The block model has sixteen types,
 * two of them recursive containers, and asking a model to emit that directly
 * means a large schema, more ways to be subtly wrong, and output that is hard
 * to validate. This is a small, flat vocabulary that maps onto real blocks in
 * `toBlocks`, which is where the safety guarantees live.
 */
export type GeneratedSection =
  | { kind: "intro"; eyebrow: string; heading: string; body: string }
  | { kind: "prose"; heading: string; body: string }
  | { kind: "gallery"; heading: string; imageUrls: string[]; layout: "grid" | "feature" }
  | { kind: "captioned"; heading: string; items: { imageUrl: string; title: string; description: string }[] }
  | { kind: "specs"; heading: string; rows: { label: string; value: string }[] }
  | { kind: "timeline"; heading: string; stages: { marker: string; title: string; description: string }[] };

export type GeneratedPage = { sections: GeneratedSection[] };

export interface PageGenerator {
  /** Identifies the backing provider in logs and in the admin UI. */
  readonly name: string;
  generateProjectPage(input: GenerationInput): Promise<GeneratedPage>;
}

/**
 * Most images one draft may reference.
 *
 * Lives here rather than in the Server Action so both the action and the modal
 * can read it: a `"use server"` module may only export async functions, and the
 * client needs the same number to stop at, or the server silently drops the
 * extras and the admin gets a draft that ignored images they chose.
 */
export const MAX_IMAGES = 12;

/**
 * Where an image to be described lives.
 *
 * Two cases, because alt text is wanted at two different moments: for an asset
 * already in the Media Library (which has a URL the provider can fetch), and
 * for a crop that has not been uploaded yet (which exists only in the browser).
 * Filling it in at upload time is the one that actually keeps the library from
 * accumulating undescribed images.
 */
export type ImageSource =
  | { kind: "url"; url: string }
  | { kind: "inline"; mediaType: string; base64: string };

export type ImageDescriptionInput = {
  source: ImageSource;
  /** File name or Media Library title. Context for the model, never quoted back. */
  name?: string;
};

/**
 * Separate from `PageGenerator` rather than folded into it: the two features
 * are independently useful, and a provider that can do one but not the other is
 * an ordinary thing to want to plug in.
 */
export interface ImageDescriber {
  /** Identifies the backing provider in logs and in the admin UI. */
  readonly name: string;
  /** Returns raw model output — the caller is responsible for cleaning it. */
  describeImage(input: ImageDescriptionInput): Promise<string>;
}

/** The questions the admin is asked. Short, and answerable in a sentence. */
export const DRAFT_QUESTIONS: string[] = [
  "What is this piece, in one sentence?",
  "What problem or idea was it exploring?",
  "What materials and construction techniques did you use?",
  "What was the hardest part to get right?",
  "Anything notable about the process worth documenting?",
];
