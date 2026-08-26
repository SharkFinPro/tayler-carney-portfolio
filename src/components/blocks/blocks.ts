// Generic content-block system.
//
// A page's body is modeled as an ordered array of typed, content-oriented
// blocks stored in a Hygraph JSON field (e.g. `Project.projectPage`). Blocks are
// named for what they render structurally — never for the domain content they
// happen to carry — so the same editor, renderer, and data model are reusable
// across page types (project pages today, atelier pages later). Blocks hold
// content only, never layout; the frontend owns all presentation. The same
// `sanitizeBlocks` validator runs on both render and save, so a malformed block
// can never break a page.

import { sanitizeRichTextAst, isSafeUrl } from "./richText/richTextAst";

export { isSafeUrl };

export type ImageRef = { url: string; altText?: string };
export type ImageItem = { title?: string; description?: string; image: ImageRef };

// Hygraph rich-text AST ({ children: [...] }) — consumed by RichTextWidget and
// produced by RichTextEditor.
export type RichTextAST = { children: unknown[] };

export type ComparisonView = { label: string; image: ImageRef };
export type SpecRow = { label: string; value: string };

/** One stage in a `timeline` block. `marker` is a date, week, or phase label. */
export type TimelineStage = { marker: string; title: string; description: string };

/**
 * One entry in a `swatches` block. Either a flat colour or a material photo —
 * `image` wins when both are set, since a photograph of a fabric carries more
 * information than its average colour.
 */
export type SwatchItem = { name: string; detail: string; color: string; image: ImageRef | null };
// A single entry in a `credentials` block. Flexible enough to cover both the
// Education list (title = degree, meta = institution · years, description = notes)
// and the Exhibitions list (term = year, title, description).
export type CredentialEntry = { term?: string; title: string; meta?: string; description?: string };
export type TagListTone = "light" | "dark";
export type CalloutVariant = "quote" | "info" | "success" | "warning";
export type ShowcaseLayout = "cards" | "grid";
// "grid" — even masonry of equal images. "feature" — bold editorial layout that
// leads with one large image (used for hero / final-result galleries).
export type GalleryLayout = "grid" | "feature";

export type BlockType =
  | "richText"
  | "gallery"
  | "singleImage"
  | "mediaShowcase"
  | "comparison"
  | "beforeAfter"
  | "timeline"
  | "swatches"
  | "specs"
  | "documentViewer"
  | "callout"
  | "split"
  | "entry"
  | "profileHero"
  | "credentials"
  | "tagList"
  | "cta"
  | "pageIntro"
  | "columns";

interface BaseBlock {
  id: string;
  heading: string;
}

export type Block =
  | (BaseBlock & { type: "richText"; content: RichTextAST })
  | (BaseBlock & { type: "gallery"; images: ImageRef[]; layout: GalleryLayout })
  | (BaseBlock & { type: "singleImage"; image: ImageRef | null })
  | (BaseBlock & { type: "mediaShowcase"; items: ImageItem[]; layout: ShowcaseLayout })
  | (BaseBlock & { type: "comparison"; views: ComparisonView[] })
  | (BaseBlock & { type: "specs"; rows: SpecRow[] })
  // Two images under a draggable divider. The obvious use here is a sketch
  // against the finished garment, which a side-by-side pair reads less clearly
  // than an overlay you can wipe between.
  | (BaseBlock & { type: "beforeAfter"; before: ComparisonView; after: ComparisonView })
  // An ordered process rail — development stages, fittings, production weeks.
  | (BaseBlock & { type: "timeline"; stages: TimelineStage[] })
  // Material or colourway swatches, each a flat colour or a fabric photo.
  | (BaseBlock & { type: "swatches"; items: SwatchItem[] })
  // A set of large documents/sheets browsed one at a time via a dropdown.
  | (BaseBlock & { type: "documentViewer"; items: ImageItem[] })
  | (BaseBlock & { type: "callout"; variant: CalloutVariant; text: string; attribution?: string })
  // Container: lays two child blocks side-by-side. Children are any non-split
  // block (no nested splits), so the same primitive composes e.g. a specs table
  // beside a document viewer (the old tech-pack layout) or any other pairing.
  | (BaseBlock & { type: "split"; left: Block; right: Block })
  // An editorial entry: a narrow text rail (auto-numbered index + heading +
  // prose) beside a captioned image grid. The signature atelier layout.
  | (BaseBlock & { type: "entry"; content: RichTextAST; items: ImageItem[] })
  // A portrait + name/subtitle badge beside a bio. The About-page hero.
  | (BaseBlock & { type: "profileHero"; image: ImageRef | null; name: string; subtitle: string; bio: RichTextAST })
  // A labelled list of credential entries (education, exhibitions, awards…).
  | (BaseBlock & { type: "credentials"; items: CredentialEntry[] })
  // A labelled list of short tags/keywords (e.g. skills). `dark` is the inverted plate.
  | (BaseBlock & { type: "tagList"; tone: TagListTone; tags: string[] })
  // A call-to-action band: a headline (the block heading) and one button.
  | (BaseBlock & { type: "cta"; buttonLabel: string; buttonHref: string })
  // A page intro: a small eyebrow, a large heading, and a body paragraph.
  | (BaseBlock & { type: "pageIntro"; eyebrow: string; body: RichTextAST })
  // Container: lays 2–4 child blocks side-by-side in a responsive grid. Children
  // are any non-container content block (no nested columns/splits/entries).
  | (BaseBlock & { type: "columns"; items: Block[] });

// ── Block metadata (palette + chrome) ─────────────────────────────────────

// Ordered list of block types offered in the editor palette.
export const BLOCK_TYPES: BlockType[] = [
  "richText",
  "gallery",
  "singleImage",
  "mediaShowcase",
  "comparison",
  "beforeAfter",
  "specs",
  "timeline",
  "swatches",
  "documentViewer",
  "callout",
  "split",
  "entry",
  "profileHero",
  "credentials",
  "tagList",
  "cta",
  "pageIntro",
  "columns",
];

// Container block types — these lay out other blocks and so can never be nested
// inside one another.
const CONTAINER_TYPES: BlockType[] = ["split", "entry", "columns"];

// Block types that may be placed inside a split or columns container. Containers
// can't nest, so they're excluded.
export const CHILD_BLOCK_TYPES: BlockType[] = BLOCK_TYPES.filter(
  (t) => !CONTAINER_TYPES.includes(t)
);

// Block types offered inside a `columns` container (same constraint as split).
export const COLUMN_CHILD_TYPES: BlockType[] = CHILD_BLOCK_TYPES;

// Short label shown on the block row / palette / sidebar fallback.
export const BLOCK_LABELS: Record<BlockType, string> = {
  richText: "Rich text",
  gallery: "Image gallery",
  singleImage: "Single image",
  mediaShowcase: "Media showcase",
  comparison: "Side-by-side",
  beforeAfter: "Before / after",
  specs: "Specs table",
  timeline: "Process timeline",
  swatches: "Material swatches",
  documentViewer: "Document viewer",
  callout: "Callout",
  split: "Split layout",
  entry: "Editorial entry",
  profileHero: "Profile hero",
  credentials: "Credentials list",
  tagList: "Tag list",
  cta: "Call to action",
  pageIntro: "Page intro",
  columns: "Columns",
};

// One-line descriptions shown in the editor's "add block" palette.
export const BLOCK_DESCRIPTIONS: Record<BlockType, string> = {
  richText: "Formatted prose — headings, lists, links, inline images.",
  gallery: "A gallery of images — even grid or a bold feature layout.",
  singleImage: "A single large image.",
  mediaShowcase: "Captioned media cards with a title and description.",
  comparison: "Labeled views shown one at a time (e.g. front / back / side).",
  beforeAfter: "Two images under a divider you drag to wipe between them.",
  specs: "A table of label / value rows.",
  timeline: "An ordered process rail — stages, fittings, production weeks.",
  swatches: "Material or colourway swatches, as flat colours or fabric photos.",
  documentViewer: "Large documents/sheets browsed one at a time via a dropdown.",
  callout: "A highlighted note or pull quote.",
  split: "Two blocks side-by-side (e.g. a specs table beside a document viewer).",
  entry: "A numbered text rail (heading + prose) beside a captioned image grid.",
  profileHero: "A portrait with a name/title badge beside a bio.",
  credentials: "A labelled list of entries — education, exhibitions, awards.",
  tagList: "A labelled list of short tags or keywords (e.g. skills).",
  cta: "A highlighted call-to-action band with a headline and a button.",
  pageIntro: "A page intro — small eyebrow, large heading, and a short body.",
  columns: "Two to four blocks laid out side-by-side in a responsive grid.",
};

// Whether the block row / section heading shows a count badge.
export const BLOCK_SHOW_COUNT: Record<BlockType, boolean> = {
  richText: false,
  gallery: true,
  singleImage: false,
  mediaShowcase: true,
  comparison: true,
  beforeAfter: false,
  specs: false,
  timeline: true,
  swatches: true,
  documentViewer: true,
  callout: false,
  split: false,
  entry: true,
  profileHero: false,
  credentials: true,
  tagList: true,
  cta: false,
  pageIntro: false,
  columns: false,
};

const DEFAULT_HEADINGS: Record<BlockType, string> = {
  richText: "",
  gallery: "Gallery",
  singleImage: "Image",
  mediaShowcase: "Showcase",
  comparison: "Comparison",
  beforeAfter: "Before / After",
  specs: "Specifications",
  timeline: "Process",
  swatches: "Materials",
  documentViewer: "Documents",
  callout: "",
  split: "",
  entry: "",
  profileHero: "",
  credentials: "",
  tagList: "",
  cta: "",
  pageIntro: "",
  columns: "",
};

export function newId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyRichText(): RichTextAST {
  return { children: [{ type: "paragraph", children: [{ text: "" }] }] };
}

/**
 * Deep-copy a block, giving it and every nested child a fresh id.
 *
 * Building a second `entry` or `specs` block similar to an existing one meant
 * re-entering every field by hand, and those are the most field-heavy types in
 * the system.
 *
 * Re-issuing ids all the way down matters: `split` and `columns` carry child
 * blocks, and React keys plus the editor's drag reorder both key on `id`, so a
 * duplicate that shared its children's ids would make the two copies behave as
 * one.
 */
export function duplicateBlock(block: Block): Block {
  const copy = structuredClone(block) as Block;
  copy.id = newId();

  if (copy.type === "split") {
    copy.left = duplicateBlock(copy.left);
    copy.right = duplicateBlock(copy.right);
  } else if (copy.type === "columns") {
    copy.items = copy.items.map(duplicateBlock);
  }

  return copy;
}

// Build an empty block of the given type for the editor palette.
export function createEmptyBlock(type: BlockType): Block {
  const id = newId();
  const heading = DEFAULT_HEADINGS[type];
  switch (type) {
    case "richText":
      return { id, type, heading, content: emptyRichText() };
    case "gallery":
      return { id, type, heading, images: [], layout: "grid" };
    case "singleImage":
      return { id, type, heading, image: null };
    case "mediaShowcase":
      return { id, type, heading, items: [], layout: "cards" };
    case "comparison":
      return { id, type, heading, views: [] };
    case "specs":
      return { id, type, heading, rows: [] };
    case "beforeAfter":
      // Both sides start empty; blockHasData requires two real images, so an
      // unfinished comparison never renders a half-empty wipe.
      return {
        id,
        type,
        heading,
        before: { label: "Before", image: { url: "" } },
        after: { label: "After", image: { url: "" } },
      };
    case "timeline":
      return { id, type, heading, stages: [] };
    case "swatches":
      return { id, type, heading, items: [] };
    case "documentViewer":
      return { id, type, heading, items: [] };
    case "callout":
      return { id, type, heading, variant: "info", text: "" };
    case "split":
      // Default to the common pairing: a specs table beside a document viewer.
      return {
        id,
        type,
        heading,
        left: createEmptyBlock("specs"),
        right: createEmptyBlock("documentViewer"),
      };
    case "entry":
      return { id, type, heading, content: emptyRichText(), items: [] };
    case "profileHero":
      return { id, type, heading, image: null, name: "", subtitle: "", bio: emptyRichText() };
    case "credentials":
      return { id, type, heading, items: [] };
    case "tagList":
      return { id, type, heading, tone: "light", tags: [] };
    case "cta":
      return { id, type, heading, buttonLabel: "", buttonHref: "/" };
    case "pageIntro":
      return { id, type, heading, eyebrow: "", body: emptyRichText() };
    case "columns":
      // Default to a two-column layout of empty credential lists.
      return { id, type, heading, items: [createEmptyBlock("credentials"), createEmptyBlock("credentials")] };
  }
}

// Short, human summary for a collapsed block row in the editor.
export function blockSummary(b: Block): string {
  switch (b.type) {
    case "richText":
      return richTextHasContent(b.content) ? "Rich text" : "empty";
    case "gallery":
      return `${b.images.length} image${b.images.length === 1 ? "" : "s"}`;
    case "singleImage":
      return b.image ? "1 image" : "empty";
    case "mediaShowcase":
      return `${b.items.length} item${b.items.length === 1 ? "" : "s"}`;
    case "comparison":
      return `${b.views.length} view${b.views.length === 1 ? "" : "s"}`;
    case "specs":
      return `${b.rows.length} row${b.rows.length === 1 ? "" : "s"}`;
    case "beforeAfter":
      return b.before.image.url && b.after.image.url ? "2 images" : "needs both images";
    case "timeline":
      return `${b.stages.length} stage${b.stages.length === 1 ? "" : "s"}`;
    case "swatches":
      return `${b.items.length} swatch${b.items.length === 1 ? "" : "es"}`;
    case "documentViewer":
      return `${b.items.length} document${b.items.length === 1 ? "" : "s"}`;
    case "callout":
      return b.variant;
    case "split":
      return `${BLOCK_LABELS[b.left.type]} + ${BLOCK_LABELS[b.right.type]}`;
    case "entry":
      return `${b.items.length} image${b.items.length === 1 ? "" : "s"}`;
    case "profileHero":
      return b.name || "Profile";
    case "credentials":
      return `${b.items.length} entr${b.items.length === 1 ? "y" : "ies"}`;
    case "tagList":
      return `${b.tags.length} tag${b.tags.length === 1 ? "" : "s"}`;
    case "cta":
      return b.buttonLabel || b.heading || "Call to action";
    case "pageIntro":
      return b.heading || "Page intro";
    case "columns":
      return `${b.items.length} column${b.items.length === 1 ? "" : "s"}`;
  }
}

// ── Sanitizers (used on render and on save) ────────────────────────────────

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function cleanImageRef(raw: unknown): ImageRef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.url !== "string" || !isSafeUrl(r.url)) return null;
  return { url: r.url, altText: str(r.altText) };
}

function cleanImageRefs(raw: unknown): ImageRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(cleanImageRef).filter((x): x is ImageRef => x !== null);
}

function cleanItem(raw: unknown): ImageItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const image = cleanImageRef(r.image);
  if (!image) return null;
  return { title: str(r.title), description: str(r.description), image };
}

function cleanItems(raw: unknown): ImageItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(cleanItem).filter((x): x is ImageItem => x !== null);
}

/**
 * One side of a before/after. Unlike `cleanViews`, a missing or unsafe image
 * yields an empty url rather than dropping the side — the block always has two
 * sides structurally, and `blockHasData` is what decides whether it renders.
 */
function cleanSide(raw: unknown, fallbackLabel: string): ComparisonView {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    label: str(r.label) ?? fallbackLabel,
    image: cleanImageRef(r.image) ?? { url: "" },
  };
}

/** Timeline stages. A stage needs at least one of its three fields to survive. */
function cleanStages(raw: unknown): TimelineStage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v): TimelineStage => {
      const r = (v ?? {}) as Record<string, unknown>;
      return {
        marker: str(r.marker) ?? "",
        title: str(r.title) ?? "",
        description: str(r.description) ?? "",
      };
    })
    .filter((stage) => stage.marker || stage.title || stage.description);
}

/** CSS hex colours only — a swatch value is interpolated into an inline style. */
const isHexColor = (v: unknown): v is string =>
  typeof v === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());

/**
 * Swatches. An entry survives if it can actually show something — a photo, a
 * colour, or at minimum a name.
 */
function cleanSwatches(raw: unknown): SwatchItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v): SwatchItem => {
      const r = (v ?? {}) as Record<string, unknown>;
      return {
        name: str(r.name) ?? "",
        detail: str(r.detail) ?? "",
        color: isHexColor(r.color) ? r.color.trim().toLowerCase() : "",
        image: cleanImageRef(r.image),
      };
    })
    .filter((item) => item.image || item.color || item.name);
}

function cleanViews(raw: unknown): ComparisonView[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v): ComparisonView | null => {
      if (!v || typeof v !== "object") return null;
      const r = v as Record<string, unknown>;
      const image = cleanImageRef(r.image);
      if (!image) return null;
      return { label: str(r.label) ?? "View", image };
    })
    .filter((x): x is ComparisonView => x !== null);
}

function cleanRows(raw: unknown): SpecRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v): SpecRow | null => {
      if (!v || typeof v !== "object") return null;
      const r = v as Record<string, unknown>;
      const label = str(r.label);
      if (!label) return null;
      return { label, value: typeof r.value === "string" ? r.value : str(r.value) ?? "" };
    })
    .filter((x): x is SpecRow => x !== null);
}

function cleanCredentialEntries(raw: unknown): CredentialEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v): CredentialEntry | null => {
      if (!v || typeof v !== "object") return null;
      const r = v as Record<string, unknown>;
      const term = str(r.term);
      const title = str(r.title);
      const meta = str(r.meta);
      const description = str(r.description);
      if (!term && !title && !meta && !description) return null;
      return { term, title: title ?? "", meta, description };
    })
    .filter((x): x is CredentialEntry => x !== null);
}

function cleanTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => (typeof v === "string" ? v.trim() : "")).filter((s) => s.length > 0);
}

function cleanRichText(raw: unknown): RichTextAST {
  if (raw && typeof raw === "object" && Array.isArray((raw as { children?: unknown }).children)) {
    return sanitizeRichTextAst(raw as RichTextAST);
  }
  return emptyRichText();
}

export function richTextHasContent(content: RichTextAST | undefined): boolean {
  if (!content || !Array.isArray(content.children)) return false;
  const hasText = (nodes: unknown[]): boolean =>
    nodes.some((n) => {
      if (!n || typeof n !== "object") return false;
      const node = n as Record<string, unknown>;
      if (typeof node.text === "string" && node.text.trim()) return true;
      if (node.type === "image") return true;
      return Array.isArray(node.children) && hasText(node.children);
    });
  return hasText(content.children);
}

const CALLOUT_VARIANTS: CalloutVariant[] = ["quote", "info", "success", "warning"];

function cleanBlock(raw: unknown): Block | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = r.type as BlockType;
  if (!(type in BLOCK_LABELS)) return null;
  const id = str(r.id) ?? newId();
  const heading = str(r.heading) ?? "";

  switch (type) {
    case "richText":
      return { id, type, heading, content: cleanRichText(r.content) };
    case "gallery":
      return {
        id,
        type,
        heading,
        images: cleanImageRefs(r.images),
        layout: r.layout === "feature" ? "feature" : "grid",
      };
    case "singleImage":
      return { id, type, heading, image: cleanImageRef(r.image) };
    case "mediaShowcase":
      return {
        id,
        type,
        heading,
        items: cleanItems(r.items),
        layout: r.layout === "grid" ? "grid" : "cards",
      };
    case "comparison":
      return { id, type, heading, views: cleanViews(r.views) };
    case "specs":
      return { id, type, heading, rows: cleanRows(r.rows) };
    case "beforeAfter":
      return {
        id,
        type,
        heading,
        before: cleanSide(r.before, "Before"),
        after: cleanSide(r.after, "After"),
      };
    case "timeline":
      return { id, type, heading, stages: cleanStages(r.stages) };
    case "swatches":
      return { id, type, heading, items: cleanSwatches(r.items) };
    case "documentViewer":
      return { id, type, heading, items: cleanItems(r.items) };
    case "callout": {
      const variant = CALLOUT_VARIANTS.includes(r.variant as CalloutVariant)
        ? (r.variant as CalloutVariant)
        : "info";
      return { id, type, heading, variant, text: str(r.text) ?? "", attribution: str(r.attribution) };
    }
    case "split":
      return { id, type, heading, left: cleanChild(r.left), right: cleanChild(r.right) };
    case "entry":
      return { id, type, heading, content: cleanRichText(r.content), items: cleanItems(r.items) };
    case "profileHero":
      return {
        id,
        type,
        heading,
        image: cleanImageRef(r.image),
        name: str(r.name) ?? "",
        subtitle: str(r.subtitle) ?? "",
        bio: cleanRichText(r.bio),
      };
    case "credentials":
      return { id, type, heading, items: cleanCredentialEntries(r.items) };
    case "tagList":
      return { id, type, heading, tone: r.tone === "dark" ? "dark" : "light", tags: cleanTags(r.tags) };
    case "cta":
      return {
        id,
        type,
        heading,
        buttonLabel: str(r.buttonLabel) ?? "",
        buttonHref: typeof r.buttonHref === "string" && isSafeUrl(r.buttonHref) ? r.buttonHref : "/",
      };
    case "pageIntro":
      return { id, type, heading, eyebrow: str(r.eyebrow) ?? "", body: cleanRichText(r.body) };
    case "columns":
      return { id, type, heading, items: cleanColumnChildren(r.items) };
    default:
      return null;
  }
}

// Clean a columns container's children. Each must be a valid, non-container
// block; containers (columns/split/entry) and invalid entries are dropped, and
// the count is capped so a runaway array can't blow up the layout.
function cleanColumnChildren(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];
  for (const c of raw) {
    const b = cleanBlock(c);
    if (b && !CONTAINER_TYPES.includes(b.type)) out.push(b);
    if (out.length >= 4) break;
  }
  return out;
}

// Clean a split's child. Children must be a valid, non-split block; anything
// invalid (or an attempt to nest a split) collapses to an empty rich-text block
// so the container always has two well-formed sides.
function cleanChild(raw: unknown): Block {
  const b = cleanBlock(raw);
  if (b && b.type !== "split") return b;
  return createEmptyBlock("richText");
}

// Validate/clean an arbitrary value into a Block[]. Unknown/invalid blocks are
// silently dropped; never throws.
export function sanitizeBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];
  for (const b of raw) {
    const cleaned = cleanBlock(b);
    if (cleaned) out.push(cleaned);
  }
  return out;
}

// Whether a block carries renderable content (used to hide empty sections and
// build the sidebar / scroll-spy).
export function blockHasData(b: Block): boolean {
  switch (b.type) {
    case "richText":
      return richTextHasContent(b.content);
    case "gallery":
      return b.images.length > 0;
    case "singleImage":
      return !!b.image;
    case "mediaShowcase":
      return b.items.length > 0;
    case "comparison":
      return b.views.length > 0;
    case "specs":
      return b.rows.length > 0;
    case "beforeAfter":
      // Both sides are required: a wipe with one image is not a comparison.
      return !!b.before.image.url && !!b.after.image.url;
    case "timeline":
      return b.stages.length > 0;
    case "swatches":
      return b.items.length > 0;
    case "documentViewer":
      return b.items.length > 0;
    case "callout":
      return b.text.trim().length > 0;
    case "split":
      return blockHasData(b.left) || blockHasData(b.right);
    case "entry":
      return b.heading.trim().length > 0 || richTextHasContent(b.content) || b.items.length > 0;
    case "profileHero":
      return !!b.image || b.name.trim().length > 0 || b.subtitle.trim().length > 0 || richTextHasContent(b.bio);
    case "credentials":
      return b.items.length > 0;
    case "tagList":
      return b.tags.length > 0;
    case "cta":
      return b.heading.trim().length > 0 || b.buttonLabel.trim().length > 0;
    case "pageIntro":
      return b.heading.trim().length > 0 || b.eyebrow.trim().length > 0 || richTextHasContent(b.body);
    case "columns":
      return b.items.some(blockHasData);
  }
}

// ── Derivation from the legacy fixed Project schema ───────────────────────
// Null-fallback for projects that have no stored block layout yet. Emits the
// new generalized block types so the fallback stays render-correct. (Legacy
// stored `projectPage` arrays are migrated to the new types by a one-off
// script — see the migration tooling, not committed.)

interface LegacyImage {
  url?: string;
  altText?: string;
}
interface LegacyItem {
  title?: string;
  description?: string;
  image?: LegacyImage;
}
export interface LegacyProject {
  sketches?: LegacyImage[];
  digitalRendering?: LegacyImage;
  frontFlat?: LegacyImage;
  backFlat?: LegacyImage;
  sideFlat?: LegacyImage;
  coloredFlats?: LegacyItem[];
  details?: LegacyItem[];
  patterns?: LegacyImage[];
  materials?: LegacyItem[];
  techPackHeader?: Record<string, string | number>;
  techPacks?: LegacyItem[];
  looks?: LegacyItem[];
  finalProduct?: LegacyImage[];
}

function refFrom(img: LegacyImage | undefined | null): ImageRef | null {
  if (!img?.url || !isSafeUrl(img.url)) return null;
  return { url: img.url, altText: str(img.altText) };
}

function refsFrom(imgs: LegacyImage[] | undefined): ImageRef[] {
  return (imgs ?? []).map(refFrom).filter((x): x is ImageRef => x !== null);
}

function itemsFrom(items: LegacyItem[] | undefined): ImageItem[] {
  return (items ?? [])
    .map((it): ImageItem | null => {
      const image = refFrom(it?.image);
      if (!image) return null;
      return { title: str(it.title), description: str(it.description), image };
    })
    .filter((x): x is ImageItem => x !== null);
}

export function projectToBlocks(p: LegacyProject): Block[] {
  const blocks: Block[] = [];

  const sketches = refsFrom(p.sketches);
  if (sketches.length) {
    blocks.push({ id: newId(), type: "gallery", heading: "Initial Sketches", images: sketches, layout: "grid" });
  }

  const digital = refFrom(p.digitalRendering);
  if (digital) {
    blocks.push({ id: newId(), type: "singleImage", heading: "Digital Rendering", image: digital });
  }

  const front = refFrom(p.frontFlat);
  const back = refFrom(p.backFlat);
  const side = refFrom(p.sideFlat);
  const views: ComparisonView[] = [];
  if (front) views.push({ label: "Front", image: front });
  if (back) views.push({ label: "Back", image: back });
  if (side) views.push({ label: "Side", image: side });
  if (views.length) {
    blocks.push({ id: newId(), type: "comparison", heading: "Technical Flats", views });
  }
  const coloredFlats = itemsFrom(p.coloredFlats);
  if (coloredFlats.length) {
    blocks.push({ id: newId(), type: "mediaShowcase", heading: "Colored Flats", items: coloredFlats, layout: "cards" });
  }

  const looks = itemsFrom(p.looks);
  if (looks.length) {
    blocks.push({ id: newId(), type: "mediaShowcase", heading: "Looks", items: looks, layout: "cards" });
  }

  const details = itemsFrom(p.details);
  if (details.length) {
    blocks.push({ id: newId(), type: "mediaShowcase", heading: "Details", items: details, layout: "grid" });
  }

  const patterns = refsFrom(p.patterns);
  if (patterns.length) {
    blocks.push({ id: newId(), type: "gallery", heading: "Pattern Drafting", images: patterns, layout: "grid" });
  }

  const materials = itemsFrom(p.materials);
  if (materials.length) {
    blocks.push({ id: newId(), type: "mediaShowcase", heading: "Materials List", items: materials, layout: "cards" });
  }

  const rows = legacyInfoToRows(p.techPackHeader);
  const sheets = itemsFrom(p.techPacks);
  if (rows.length && sheets.length) {
    // The old tech-pack layout: a specs table beside a paginated sheet viewer.
    blocks.push({
      id: newId(),
      type: "split",
      heading: "Tech Pack",
      left: { id: newId(), type: "specs", heading: "", rows },
      right: { id: newId(), type: "documentViewer", heading: "", items: sheets },
    });
  } else if (rows.length) {
    blocks.push({ id: newId(), type: "specs", heading: "Tech Pack", rows });
  } else if (sheets.length) {
    blocks.push({ id: newId(), type: "documentViewer", heading: "Tech Pack", items: sheets });
  }

  const finalProduct = refsFrom(p.finalProduct);
  if (finalProduct.length) {
    blocks.push({ id: newId(), type: "gallery", heading: "Final Product", images: finalProduct, layout: "feature" });
  }

  return blocks;
}

function legacyInfoToRows(info: Record<string, string | number> | undefined): SpecRow[] {
  if (!info || typeof info !== "object") return [];
  const rows: SpecRow[] = [];
  for (const [label, value] of Object.entries(info)) {
    if (typeof value === "string" || typeof value === "number") {
      // Humanize camelCase keys (e.g. "fabricContent" -> "Fabric Content").
      const pretty = label.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
      rows.push({ label: pretty, value: String(value) });
    }
  }
  return rows;
}
