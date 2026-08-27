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
  /** Existing pages, as structure only, for the model to draft in keeping with. */
  examples: PageOutline[];
};

/**
 * The shape of a page that already exists on the site, with no prose.
 *
 * The model is shown these so a draft comes out looking like the rest of the
 * portfolio — the rhythm of sections and the heading vocabulary are house
 * style, and a model left to invent them writes headings no other page uses.
 * Structure only, on purpose: the copy on existing pages is the designer's,
 * and showing it invites pastiche of the sentences rather than of the shape.
 */
export type PageOutline = {
  title: string;
  sections: { kind: GeneratedSection["kind"]; heading: string; imageCount: number }[];
};

/**
 * How an image is named in the brief and referred to in the output.
 *
 * Tokens rather than URLs because a Media Library URL is an opaque string of
 * random characters, and a model asked to copy forty of them exactly will get
 * some of them wrong — every mistyped character used to be an image silently
 * dropped from the page, which is indistinguishable from the model choosing
 * not to use it. A short token is easy to reproduce and easy to check.
 */
export function imageToken(index: number): string {
  return `img-${index + 1}`;
}

/**
 * The shape the model is asked to produce.
 *
 * Deliberately NOT the full `Block` union. That union keeps growing and
 * includes recursive containers, so asking a model to emit it directly means a
 * large schema, more ways to be subtly wrong, and output that is hard to
 * validate. This is a small, flat vocabulary that maps onto real blocks in
 * `toBlocks`, which is where the safety guarantees live — and it stays this
 * size as new block types are added.
 */
export type GeneratedSection =
  | { kind: "intro"; eyebrow: string; heading: string; body: string }
  | { kind: "prose"; heading: string; body: string }
  | { kind: "gallery"; heading: string; imageRefs: string[]; layout: "grid" | "feature" }
  | { kind: "captioned"; heading: string; items: { imageRef: string; title: string; description: string }[] }
  | { kind: "specs"; heading: string; rows: { label: string; value: string }[] }
  | { kind: "timeline"; heading: string; stages: { marker: string; title: string; description: string }[] };

export type GeneratedPage = { sections: GeneratedSection[] };

/**
 * What one drafting call produced.
 *
 * `unseen` exists because there is no count limit on the images an admin may
 * choose — the real ceiling is how many fit in one request to the provider,
 * which depends on their size, not their number. Past that point the extra
 * images are not sent to the model, but they are still placed on the page by
 * `toBlocks`: every selected image reaches the draft, described or not.
 */
export type GenerationResult = {
  page: GeneratedPage;
  /** Images the request had no room for. Placed, but never looked at. */
  unseen: SourceImage[];
};

export interface PageGenerator {
  /** Identifies the backing provider in logs and in the admin UI. */
  readonly name: string;
  generateProjectPage(input: GenerationInput): Promise<GenerationResult>;
}

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
