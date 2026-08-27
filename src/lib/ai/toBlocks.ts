// Maps a model-produced `GeneratedPage` onto real content blocks.
//
// This is the trust boundary. Model output is treated exactly like any other
// untrusted input — no more privileged than a form post — and three things
// enforce that:
//
//   1. Only the six section kinds below can become blocks at all. There is no
//      path from model output to an arbitrary block type.
//   2. Every image reference is resolved against the set the admin actually
//      supplied — by `img-N` token, or by exact URL for a model that ignored
//      the tokens. Anything else is dropped, so generated content can never
//      point at an asset that doesn't exist or at an off-site host.
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
import { imageToken, type GeneratedPage, type GeneratedSection, type SourceImage } from "./types";

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
 * `allowed` maps every accepted reference — `img-N` token and exact URL alike
 * — to its source image, so alt text comes from what the admin authored rather
 * than from anything the model wrote. `used` records which images the page has
 * actually placed, so the ones the model left out can be added afterwards.
 */
function toBlock(
  section: GeneratedSection,
  allowed: Map<string, SourceImage>,
  used: Set<string>
): Block | null {
  const id = newId();
  const heading = clean(section.heading);

  // Resolve a model-supplied reference against the allowlist. Anything not
  // supplied by the admin is dropped rather than trusted.
  const image = (ref: unknown): ImageRef | null => {
    const source = allowed.get(clean(ref));
    if (!source) return null;
    used.add(source.url);
    return { url: source.url, altText: source.altText };
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
      const images = (Array.isArray(section.imageRefs) ? section.imageRefs : [])
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
          const ref = image(item?.imageRef);
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

/** Heading for the block that catches images the draft did not place itself. */
export const LEFTOVER_HEADING = "Additional images";

/**
 * Convert a generated page into blocks ready for the editor.
 *
 * Always returns a valid `Block[]`, possibly empty. Never throws: this runs on
 * model output, and a malformed draft should surface as "nothing usable came
 * back" rather than as a crashed Server Action.
 */
export function toBlocks(page: GeneratedPage | null | undefined, images: SourceImage[]): Block[] {
  // Both keys resolve to the same image: the token the brief gave the model,
  // and the URL, for a model that quoted the URL back anyway.
  const allowed = new Map<string, SourceImage>();
  images.forEach((img, i) => {
    allowed.set(img.url, img);
    allowed.set(imageToken(i), img);
  });

  const sections = Array.isArray(page?.sections) ? page.sections : [];
  const used = new Set<string>();

  const blocks: Block[] = [];
  for (const section of sections) {
    if (!section || typeof section !== "object") continue;
    try {
      const block = toBlock(section, allowed, used);
      if (block) blocks.push(block);
    } catch {
      // One malformed section must not lose the rest of the draft.
    }
  }

  // Every selected image ends up on the page, whatever the model did.
  //
  // The prompt asks for all of them, but asking is not a guarantee: a model
  // that picks its eight favourites out of forty is not misbehaving in a way
  // the schema can catch, and an image that was selected and then silently
  // vanished is the worst outcome — the admin has no way to tell it apart from
  // one the draft simply chose not to caption. So the remainder is appended as
  // an ordinary gallery, in the order they were selected, for the admin to
  // move, split, or delete like any other block.
  //
  // Only when the draft produced something. A page with no sections at all is
  // a failed generation, and reporting it as "here is a gallery" would hide
  // that from the admin — the caller checks for an empty result and says so.
  const leftovers = blocks.length ? images.filter((img) => !used.has(img.url)) : [];
  if (leftovers.length) {
    blocks.push({
      id: newId(),
      type: "gallery",
      heading: LEFTOVER_HEADING,
      images: leftovers.map((img) => ({ url: img.url, altText: img.altText })),
      layout: "grid",
    });
  }

  // The same validator the CMS uses. Belt and braces: nothing reaches storage
  // on a path the ordinary rules haven't also approved.
  return sanitizeBlocks(blocks);
}
