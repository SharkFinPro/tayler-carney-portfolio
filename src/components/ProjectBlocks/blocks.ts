// Project page block system.
//
// A project's page is modeled as an ordered array of typed "section" blocks
// stored in the Hygraph `Project.projectPage` JSON field. Blocks carry content
// only — never layout — so the frontend owns all presentation. The same
// `sanitizeProjectPage` validator runs on both render and (future) save, so a
// malformed block can never break a page.
//
// `title`/`description` remain top-level Project fields (inline-editable);
// blocks cover the image-bearing sections below the header.

export type ImageRef = { url: string; altText?: string };
export type ImageItem = { title?: string; description?: string; image: ImageRef };
export type TechPackInfo = Record<string, string | number>;

export type BlockType =
  | "sketches"
  | "digitalRendering"
  | "flats"
  | "looks"
  | "details"
  | "patterns"
  | "materials"
  | "techPack"
  | "finalProduct";

interface BaseBlock {
  id: string;
  heading: string;
}

export type Block =
  | (BaseBlock & { type: "sketches"; images: ImageRef[] })
  | (BaseBlock & { type: "digitalRendering"; image: ImageRef | null })
  | (BaseBlock & {
      type: "flats";
      front: ImageRef | null;
      back: ImageRef | null;
      side: ImageRef | null;
      coloredFlats: ImageItem[];
      coloredFlatsHeading: string;
    })
  | (BaseBlock & { type: "looks"; items: ImageItem[] })
  | (BaseBlock & { type: "details"; items: ImageItem[] })
  | (BaseBlock & { type: "patterns"; images: ImageRef[] })
  | (BaseBlock & { type: "materials"; items: ImageItem[] })
  | (BaseBlock & { type: "techPack"; info: TechPackInfo | null; sheets: ImageItem[] })
  | (BaseBlock & { type: "finalProduct"; images: ImageRef[] });

// DOM id (for scroll-spy / anchors) + short sidebar label + whether the section
// shows a count badge, keyed by block type.
export const SECTION_META: Record<BlockType, { id: string; label: string; showCount: boolean }> = {
  sketches: { id: "sketches", label: "Sketches", showCount: true },
  digitalRendering: { id: "digitalRendering", label: "Digital", showCount: false },
  flats: { id: "flats", label: "Flats", showCount: true },
  looks: { id: "looks", label: "Looks", showCount: true },
  details: { id: "details", label: "Details", showCount: true },
  patterns: { id: "patterns", label: "Patterns", showCount: true },
  materials: { id: "materials", label: "Materials", showCount: true },
  techPack: { id: "techpack", label: "Tech Pack", showCount: true },
  finalProduct: { id: "final", label: "Final", showCount: true },
};

export function newId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}

// Ordered list of block types offered in the editor palette.
export const BLOCK_TYPES: BlockType[] = [
  "sketches",
  "digitalRendering",
  "flats",
  "looks",
  "details",
  "patterns",
  "materials",
  "techPack",
  "finalProduct",
];

// One-line descriptions shown in the editor's "add block" palette.
export const BLOCK_DESCRIPTIONS: Record<BlockType, string> = {
  sketches: "A gallery of concept sketches.",
  digitalRendering: "A single large digital rendering.",
  flats: "Front/back/side technical flats with optional colored flats.",
  looks: "Styled looks with captions.",
  details: "Close-up construction or design details.",
  patterns: "Pattern-drafting images.",
  materials: "Materials and fabrications with notes.",
  techPack: "Tech-pack info table plus sheets.",
  finalProduct: "Final finished-garment photos.",
};

const DEFAULT_HEADINGS: Record<BlockType, string> = {
  sketches: "Initial Sketches",
  digitalRendering: "Digital Rendering",
  flats: "Technical Flats",
  looks: "Looks",
  details: "Details",
  patterns: "Pattern Drafting",
  materials: "Materials List",
  techPack: "Tech Pack",
  finalProduct: "Final Product",
};

// Build an empty block of the given type for the editor palette.
export function createEmptyBlock(type: BlockType): Block {
  const id = newId();
  const heading = DEFAULT_HEADINGS[type];
  switch (type) {
    case "sketches":
    case "patterns":
    case "finalProduct":
      return { id, type, heading, images: [] };
    case "digitalRendering":
      return { id, type, heading, image: null };
    case "looks":
    case "details":
    case "materials":
      return { id, type, heading, items: [] };
    case "flats":
      return { id, type, heading, front: null, back: null, side: null, coloredFlats: [], coloredFlatsHeading: "Colored Flats" };
    case "techPack":
      return { id, type, heading, info: null, sheets: [] };
  }
}

// Blocks unsafe URLs (javascript:/data:/vbscript:); allows http(s), root, hash.
export function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|\/|#)/i.test(url.trim());
}

// ── Sanitizers (used on render and, later, on save) ───────────────────────

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

function cleanInfo(raw: unknown): TechPackInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const out: TechPackInfo = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" || typeof v === "number") out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

function cleanBlock(raw: unknown): Block | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = r.type as BlockType;
  if (!(type in SECTION_META)) return null;
  const id = str(r.id) ?? newId();
  const heading = str(r.heading) ?? "";

  switch (type) {
    case "sketches":
    case "patterns":
    case "finalProduct":
      return { id, type, heading, images: cleanImageRefs(r.images) };
    case "digitalRendering":
      return { id, type, heading, image: cleanImageRef(r.image) };
    case "looks":
    case "details":
    case "materials":
      return { id, type, heading, items: cleanItems(r.items) };
    case "flats":
      return {
        id,
        type,
        heading,
        front: cleanImageRef(r.front),
        back: cleanImageRef(r.back),
        side: cleanImageRef(r.side),
        coloredFlats: cleanItems(r.coloredFlats),
        coloredFlatsHeading: str(r.coloredFlatsHeading) ?? "Colored Flats",
      };
    case "techPack":
      return { id, type, heading, info: cleanInfo(r.info), sheets: cleanItems(r.sheets) };
    default:
      return null;
  }
}

// Validate/clean an arbitrary value into a Block[]. Unknown/invalid blocks are
// silently dropped; never throws.
export function sanitizeProjectPage(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];
  for (const b of raw) {
    const cleaned = cleanBlock(b);
    if (cleaned) out.push(cleaned);
  }
  return out;
}

// Whether a section block carries renderable content (used to hide empty
// sections and build the sidebar / scroll-spy).
export function blockHasData(b: Block): boolean {
  switch (b.type) {
    case "sketches":
    case "patterns":
    case "finalProduct":
      return b.images.length > 0;
    case "digitalRendering":
      return !!b.image;
    case "flats":
      return !!(b.front || b.back || b.side);
    case "looks":
    case "details":
    case "materials":
      return b.items.length > 0;
    case "techPack":
      return b.sheets.length > 0;
  }
}

// ── Derivation from the legacy fixed Project schema ───────────────────────
// This is both the null-fallback (when projectPage is absent) and the exact
// payload written during backfill, so rendering parity is structural.

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
  techPackHeader?: TechPackInfo;
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
    blocks.push({ id: newId(), type: "sketches", heading: "Initial Sketches", images: sketches });
  }

  const digital = refFrom(p.digitalRendering);
  if (digital) {
    blocks.push({ id: newId(), type: "digitalRendering", heading: "Digital Rendering", image: digital });
  }

  const front = refFrom(p.frontFlat);
  const back = refFrom(p.backFlat);
  const side = refFrom(p.sideFlat);
  if (front || back || side) {
    blocks.push({
      id: newId(),
      type: "flats",
      heading: "Technical Flats",
      front,
      back,
      side,
      coloredFlats: itemsFrom(p.coloredFlats),
      coloredFlatsHeading: "Colored Flats",
    });
  }

  const looks = itemsFrom(p.looks);
  if (looks.length) {
    blocks.push({ id: newId(), type: "looks", heading: "Looks", items: looks });
  }

  const details = itemsFrom(p.details);
  if (details.length) {
    blocks.push({ id: newId(), type: "details", heading: "Details", items: details });
  }

  const patterns = refsFrom(p.patterns);
  if (patterns.length) {
    blocks.push({ id: newId(), type: "patterns", heading: "Pattern Drafting", images: patterns });
  }

  const materials = itemsFrom(p.materials);
  if (materials.length) {
    blocks.push({ id: newId(), type: "materials", heading: "Materials List", items: materials });
  }

  const sheets = itemsFrom(p.techPacks);
  if (sheets.length) {
    blocks.push({
      id: newId(),
      type: "techPack",
      heading: "Tech Pack",
      info: cleanInfo(p.techPackHeader),
      sheets,
    });
  }

  const finalProduct = refsFrom(p.finalProduct);
  if (finalProduct.length) {
    blocks.push({ id: newId(), type: "finalProduct", heading: "Final Product", images: finalProduct });
  }

  return blocks;
}
