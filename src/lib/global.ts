import { isSafeUrl } from "@/components/blocks/richText/richTextAst";

// Global site identity model.
//
// The site-wide identity (display name, focus/tagline, contact email, and social
// handles) is a singleton stored in the one SiteData entry's `global` JSON field.
// It replaces the former top-level scalar fields so all of this copy lives in one
// isolated, page-agnostic object. Like `sanitizeHome`, this module is pure (no
// server-only imports) so the same types, defaults, and validator run on both
// render and save.

/** One entry in the site navigation, shown in both the header and the footer. */
export type NavItem = { label: string; href: string };

export type GlobalContent = {
  /**
   * Site navigation. Previously hardcoded as identical literal arrays in
   * Navigation.tsx and Footer.tsx, so renaming a page or reordering the menu
   * meant a developer, a deploy, and remembering the list existed twice.
   */
  navItems: NavItem[];
  displayName: string;
  focus: string;
  email: string;
  linkedInHandle: string;
  instagramHandle: string;
  /**
   * Hygraph Asset id of the resume PDF. Stored as a reference (not a URL) and
   * resolved fresh on every render, so renames/re-uploads of the asset are
   * reflected everywhere. Empty hides the download links.
   */
  resumeAssetId: string;
  /**
   * Hygraph Asset id of the social preview (OpenGraph) image. Same reference
   * pattern as the resume: stored as an id, resolved at render, so replacing
   * the asset updates every share card. Empty falls back to the static
   * opengraph-image.png in src/app/.
   */
  ogImageAssetId: string;
};

// Seed identity — the fallback when `global` is null (e.g. a fresh CMS entry).
// The seed nav is exactly the list both components hardcoded, so the rendered
// menu is unchanged until an admin edits it.
export const DEFAULT_NAV: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Atelier", href: "/atelier" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export const DEFAULT_GLOBAL: GlobalContent = {
  navItems: DEFAULT_NAV,
  displayName: "Tayler Carney",
  focus: "Structural Fashion Design",
  email: "",
  linkedInHandle: "",
  instagramHandle: "",
  resumeAssetId: "",
  ogImageAssetId: "",
};

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

// Hygraph asset ids are opaque alphanumeric tokens; anything else is dropped.
const assetId = (v: unknown): string => {
  const s = str(v).trim();
  return /^[a-z0-9]+$/i.test(s) ? s : "";
};

/**
 * Reduce a social handle to the bare username the URL templates expect.
 *
 * These values are interpolated straight into `https://…/in/${handle}`, so an
 * un-normalized value produces a broken link rather than an obvious error. The
 * two realistic mistakes are both handled: a leading `@`, and pasting the whole
 * profile URL when the field asks for "the part after linkedin.com/in/".
 *
 * Anything still containing a slash, a dot, or whitespace after that is not a
 * username and is dropped — an empty handle hides the link, which is a better
 * outcome than rendering one that 404s.
 */
export function normalizeHandle(v: unknown): string {
  let s = str(v).trim();
  if (!s) return "";

  // Strip a pasted profile URL down to its last meaningful path segment.
  // Covers linkedin.com/in/name, instagram.com/name, with or without scheme,
  // "www.", a trailing slash, or a query string.
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (s.includes("/")) {
    // split() always yields at least one element, but the compiler indexes
    // conservatively; the fallback keeps the intent explicit either way.
    s = (s.split(/[?#]/)[0] ?? s).replace(/\/+$/, "");
    s = s.split("/").pop() ?? "";
  }

  s = s.replace(/^@+/, "").trim();

  // A real handle has no separators left. Reject rather than store something
  // that would build a dead URL.
  return /^[A-Za-z0-9._-]+$/.test(s) ? s : "";
}

/** Upper bound on nav entries — past this the header layout breaks down. */
export const MAX_NAV_ITEMS = 8;

/**
 * Coerce arbitrary JSON into a usable navigation list.
 *
 * A nav entry is only kept when it has both a label and a safe href, because a
 * half-filled row renders as an invisible or dead link rather than as an
 * obvious mistake. An explicitly emptied list is honored (an admin may
 * legitimately want no nav); only a missing or non-array value falls back to
 * the defaults.
 */
export function sanitizeNav(raw: unknown, fallback: NavItem[] = DEFAULT_NAV): NavItem[] {
  if (!Array.isArray(raw)) return fallback;

  const items: NavItem[] = [];
  for (const entry of raw) {
    const o = (entry ?? {}) as Record<string, unknown>;
    const label = str(o.label).trim();
    const href = str(o.href).trim();

    // isSafeUrl also rejects protocol-relative "//host" values, so a nav entry
    // can't quietly point off-site.
    if (!label || !href || !isSafeUrl(href)) continue;

    items.push({ label, href });
    if (items.length >= MAX_NAV_ITEMS) break;
  }
  return items;
}

/**
 * Coerce arbitrary JSON (from the CMS or the admin settings form) into a complete,
 * well-typed GlobalContent. Missing keys fall back to DEFAULT_GLOBAL; unexpected
 * types are dropped. Strings are trimmed so stray whitespace never reaches the UI.
 */
export function sanitizeGlobal(raw: unknown): GlobalContent {
  const d = DEFAULT_GLOBAL;
  const data = (raw ?? {}) as Record<string, unknown>;
  return {
    navItems: sanitizeNav(data.navItems, d.navItems),
    displayName: str(data.displayName, d.displayName).trim(),
    focus: str(data.focus, d.focus).trim(),
    email: str(data.email, d.email).trim(),
    linkedInHandle: normalizeHandle(data.linkedInHandle ?? d.linkedInHandle),
    instagramHandle: normalizeHandle(data.instagramHandle ?? d.instagramHandle),
    resumeAssetId: assetId(data.resumeAssetId),
    ogImageAssetId: assetId(data.ogImageAssetId),
  };
}
