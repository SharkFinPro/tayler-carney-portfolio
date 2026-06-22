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
  | "specs"
  | "documentViewer"
  | "callout"
  | "split";

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
  // A set of large documents/sheets browsed one at a time via a dropdown.
  | (BaseBlock & { type: "documentViewer"; items: ImageItem[] })
  | (BaseBlock & { type: "callout"; variant: CalloutVariant; text: string; attribution?: string })
  // Container: lays two child blocks side-by-side. Children are any non-split
  // block (no nested splits), so the same primitive composes e.g. a specs table
  // beside a document viewer (the old tech-pack layout) or any other pairing.
  | (BaseBlock & { type: "split"; left: Block; right: Block });

// ── Block metadata (palette + chrome) ─────────────────────────────────────

// Ordered list of block types offered in the editor palette.
export const BLOCK_TYPES: BlockType[] = [
  "richText",
  "gallery",
  "singleImage",
  "mediaShowcase",
  "comparison",
  "specs",
  "documentViewer",
  "callout",
  "split",
];

// Block types that may be placed inside a split container. Splits can't nest, so
// the only excluded type is `split` itself.
export const CHILD_BLOCK_TYPES: BlockType[] = BLOCK_TYPES.filter((t) => t !== "split");

// Short label shown on the block row / palette / sidebar fallback.
export const BLOCK_LABELS: Record<BlockType, string> = {
  richText: "Rich text",
  gallery: "Image gallery",
  singleImage: "Single image",
  mediaShowcase: "Media showcase",
  comparison: "Side-by-side",
  specs: "Specs table",
  documentViewer: "Document viewer",
  callout: "Callout",
  split: "Split layout",
};

// One-line descriptions shown in the editor's "add block" palette.
export const BLOCK_DESCRIPTIONS: Record<BlockType, string> = {
  richText: "Formatted prose — headings, lists, links, inline images.",
  gallery: "A gallery of images — even grid or a bold feature layout.",
  singleImage: "A single large image.",
  mediaShowcase: "Captioned media cards with a title and description.",
  comparison: "Labeled views shown one at a time (e.g. front / back / side).",
  specs: "A table of label / value rows.",
  documentViewer: "Large documents/sheets browsed one at a time via a dropdown.",
  callout: "A highlighted note or pull quote.",
  split: "Two blocks side-by-side (e.g. a specs table beside a document viewer).",
};

// Whether the block row / section heading shows a count badge.
export const BLOCK_SHOW_COUNT: Record<BlockType, boolean> = {
  richText: false,
  gallery: true,
  singleImage: false,
  mediaShowcase: true,
  comparison: true,
  specs: false,
  documentViewer: true,
  callout: false,
  split: false,
};

const DEFAULT_HEADINGS: Record<BlockType, string> = {
  richText: "",
  gallery: "Gallery",
  singleImage: "Image",
  mediaShowcase: "Showcase",
  comparison: "Comparison",
  specs: "Specifications",
  documentViewer: "Documents",
  callout: "",
  split: "",
};

export function newId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyRichText(): RichTextAST {
  return { children: [{ type: "paragraph", children: [{ text: "" }] }] };
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
    case "documentViewer":
      return `${b.items.length} document${b.items.length === 1 ? "" : "s"}`;
    case "callout":
      return b.variant;
    case "split":
      return `${BLOCK_LABELS[b.left.type]} + ${BLOCK_LABELS[b.right.type]}`;
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

function cleanRichText(raw: unknown): RichTextAST {
  if (raw && typeof raw === "object" && Array.isArray((raw as { children?: unknown }).children)) {
    return sanitizeRichTextAst(raw as RichTextAST);
  }
  return emptyRichText();
}

function richTextHasContent(content: RichTextAST | undefined): boolean {
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
    default:
      return null;
  }
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
    case "documentViewer":
      return b.items.length > 0;
    case "callout":
      return b.text.trim().length > 0;
    case "split":
      return blockHasData(b.left) || blockHasData(b.right);
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
