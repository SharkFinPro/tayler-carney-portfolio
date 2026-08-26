// Maps a model-produced `GeneratedPage` onto real content blocks.
//
// This is the trust boundary. Model output is treated exactly like any other
// untrusted input — no more privileged than a form post — and three things
// enforce that:
//
//   1. Only the six section kinds below can become blocks at all. There is no
//      path from model output to an arbitrary block type.
//   2. Every image URL is checked against the set the admin actually supplied.
//      A model that invents, guesses, or hallucinates a URL gets it dropped,
//      so generated content can never point at an asset that doesn't exist or
//      at an off-site host.
//   3. The result is passed through `sanitizeBlocks` — the same validator that
//      guards the CMS — so anything that slips through the first two still has
//      to survive the ordinary rules.
//
// Pure module: no SDK, no network, no server-only import.

import {
  newId,
  sanitizeBlocks,
  type Block,
  type ImageRef,
  type RichTextAST,
} from "@/components/blocks/blocks";
import type { GeneratedPage, GeneratedSection, SourceImage } from "./types";

/** Plain text to the rich-text AST the renderer expects, one node per line. */
function toRichText(text: string): RichTextAST {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return { children: [{ type: "paragraph", children: [{ text: "" }] }] };
  }

  return {
    children: paragraphs.map((p) => ({
      type: "paragraph",
      children: [{ text: p }],
    })),
  };
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Convert one section, or null when it carries nothing usable.
 *
 * `allowed` maps a permitted URL to its source image, so alt text comes from
 * what the admin authored rather than from anything the model wrote.
 */
function toBlock(section: GeneratedSection, allowed: Map<string, SourceImage>): Block | null {
  const id = newId();
  const heading = clean(section.heading);

  // Resolve a model-supplied URL against the allowlist. Anything not supplied
  // by the admin is dropped rather than trusted.
  const image = (url: unknown): ImageRef | null => {
    const source = allowed.get(clean(url));
    return source ? { url: source.url, altText: source.altText } : null;
  };

  switch (section.kind) {
    case "intro": {
      const body = clean(section.body);
      if (!heading && !body) return null;
      return { id, type: "pageIntro", heading, eyebrow: clean(section.eyebrow), body: toRichText(body) };
    }

    case "prose": {
      const body = clean(section.body);
      if (!body) return null;
      return { id, type: "richText", heading, content: toRichText(body) };
    }

    case "gallery": {
      const images = (Array.isArray(section.imageUrls) ? section.imageUrls : [])
        .map(image)
        .filter((r): r is ImageRef => r !== null);
      if (!images.length) return null;
      return {
        id,
        type: "gallery",
        heading,
        images,
        layout: section.layout === "feature" ? "feature" : "grid",
      };
    }

    case "captioned": {
      const items = (Array.isArray(section.items) ? section.items : [])
        .map((item) => {
          const ref = image(item?.imageUrl);
          if (!ref) return null;
          return { title: clean(item?.title), description: clean(item?.description), image: ref };
        })
        .filter((v): v is { title: string; description: string; image: ImageRef } => v !== null);
      if (!items.length) return null;
      return { id, type: "mediaShowcase", heading, items, layout: "cards" };
    }

    case "specs": {
      const rows = (Array.isArray(section.rows) ? section.rows : [])
        .map((r) => ({ label: clean(r?.label), value: clean(r?.value) }))
        .filter((r) => r.label || r.value);
      if (!rows.length) return null;
      return { id, type: "specs", heading, rows };
    }

    case "timeline": {
      const stages = (Array.isArray(section.stages) ? section.stages : [])
        .map((s) => ({
          marker: clean(s?.marker),
          title: clean(s?.title),
          description: clean(s?.description),
        }))
        .filter((s) => s.marker || s.title || s.description);
      if (!stages.length) return null;
      return { id, type: "timeline", heading, stages };
    }

    default:
      // An unrecognized kind — a model inventing a section type, or a schema
      // that drifted ahead of this mapping. Dropped, never guessed at.
      return null;
  }
}

/**
 * Convert a generated page into blocks ready for the editor.
 *
 * Always returns a valid `Block[]`, possibly empty. Never throws: this runs on
 * model output, and a malformed draft should surface as "nothing usable came
 * back" rather than as a crashed Server Action.
 */
export function toBlocks(page: GeneratedPage | null | undefined, images: SourceImage[]): Block[] {
  const allowed = new Map(images.map((img) => [img.url, img]));
  const sections = Array.isArray(page?.sections) ? page.sections : [];

  const blocks: Block[] = [];
  for (const section of sections) {
    if (!section || typeof section !== "object") continue;
    try {
      const block = toBlock(section, allowed);
      if (block) blocks.push(block);
    } catch {
      // One malformed section must not lose the rest of the draft.
    }
  }

  // The same validator the CMS uses. Belt and braces: nothing reaches storage
  // on a path the ordinary rules haven't also approved.
  return sanitizeBlocks(blocks);
}
