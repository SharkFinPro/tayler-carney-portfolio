// Turns the pages that already exist into a structural example for drafting.
//
// A model asked to lay out a case study with no reference invents a house
// style: headings no other page on the site uses, a section rhythm that reads
// like a template, one image per section where this portfolio runs galleries
// of a dozen. The pages in the CMS are the real answer to "what does a page
// here look like", and they cost one query to read.
//
// Structure only, deliberately. The prose on an existing page is the
// designer's, and putting it in the prompt invites a draft that echoes those
// sentences rather than that shape. What crosses over is: how many sections, in
// what order, carrying how many images, under what kind of heading.
//
// Pure module: no SDK, no network, no server-only import.

import { sanitizeBlocks, type Block, type BlockType } from "@/components/blocks/blocks";
import type { GeneratedSection, PageOutline } from "./types";

type Kind = GeneratedSection["kind"];

/**
 * The drafting vocabulary's nearest equivalent for each real block type.
 *
 * The outline is shown to a model that can only emit six kinds, so a page's
 * shape has to be described in those six — listing `beforeAfter` would invite
 * output the schema cannot express and `toBlocks` would drop. `null` is for
 * blocks with no drafting equivalent, which are left out of the outline rather
 * than misrepresented as something else.
 *
 * A `Record` rather than a switch with a default so that adding a block type
 * is a compile error here, and someone has to decide what it looks like from
 * the drafting side.
 */
const NEAREST_KIND: Record<BlockType, Kind | null> = {
  pageIntro: "intro",
  richText: "prose",
  callout: "prose",
  gallery: "gallery",
  singleImage: "gallery",
  swatches: "gallery",
  comparison: "gallery",
  beforeAfter: "gallery",
  annotatedImage: "gallery",
  mediaShowcase: "captioned",
  documentViewer: "captioned",
  entry: "captioned",
  specs: "specs",
  stats: "specs",
  credentials: "specs",
  timeline: "timeline",
  // Containers describe arrangement rather than content; their children are
  // outlined in their place.
  split: null,
  columns: null,
  // Page furniture that a project case study does not draft.
  profileHero: null,
  tagList: null,
  cta: null,
};

/**
 * Images a block carries.
 *
 * A deep walk for objects with a string `url` rather than a per-type switch:
 * this is a hint in a prompt, not a validator, and a walk stays right when a
 * new block type stores its images somewhere new.
 */
function imageCount(value: unknown): number {
  if (Array.isArray(value)) return value.reduce<number>((n, v) => n + imageCount(v), 0);
  if (!value || typeof value !== "object") return 0;

  const record = value as Record<string, unknown>;
  if (typeof record.url === "string" && record.url) return 1;
  return Object.values(record).reduce<number>((n, v) => n + imageCount(v), 0);
}

/** Flatten containers so a split or a columns row reads as its children. */
function flatten(block: Block): Block[] {
  if (block.type === "split") return [...flatten(block.left), ...flatten(block.right)];
  if (block.type === "columns") return block.items.flatMap(flatten);
  return [block];
}

/** Longest outline shown for one page. Enough to see the rhythm, not the whole page. */
const MAX_SECTIONS = 12;

/**
 * Outline one stored block layout, or null when there is nothing to learn from
 * it — an empty page teaches a model nothing and still costs tokens.
 *
 * `layout` is the raw JSON field, so it goes through the same sanitizer
 * everything else does: this reads content that other code wrote, and a
 * malformed layout should produce a shorter outline, never a throw.
 */
export function outlinePage(title: string, layout: unknown): PageOutline | null {
  const blocks = layout == null ? [] : sanitizeBlocks(layout);

  const sections = blocks
    .flatMap(flatten)
    .flatMap((block) => {
      const kind = NEAREST_KIND[block.type];
      if (!kind) return [];
      return [{ kind, heading: block.heading.trim(), imageCount: imageCount(block) }];
    })
    .slice(0, MAX_SECTIONS);

  if (!sections.length) return null;
  return { title: title.trim(), sections };
}

/** Example pages shown at once. Enough to imply a pattern rather than a template. */
const MAX_EXAMPLES = 4;

/**
 * Outline the existing pages worth showing.
 *
 * `exclude` drops the page being drafted, which would otherwise be offered to
 * the model as an example of itself — a redraft would then be anchored to the
 * layout it is meant to replace. Matched on title because that is what the
 * drafting form knows.
 *
 * Richer pages come first: a page with eight sections says more about the
 * house style than one with two.
 */
export function outlinePages(
  pages: { title: string; layout: unknown }[],
  exclude?: string
): PageOutline[] {
  const skip = exclude?.trim().toLowerCase();

  return pages
    .filter((p) => !skip || p.title.trim().toLowerCase() !== skip)
    .flatMap((p) => {
      const outline = outlinePage(p.title, p.layout);
      return outline ? [outline] : [];
    })
    .sort((a, b) => b.sections.length - a.sections.length)
    .slice(0, MAX_EXAMPLES);
}
