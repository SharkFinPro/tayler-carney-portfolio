// Global site identity model.
//
// The site-wide identity (display name, focus/tagline, contact email, and social
// handles) is a singleton stored in the one SiteData entry's `global` JSON field.
// It replaces the former top-level scalar fields so all of this copy lives in one
// isolated, page-agnostic object. Like `sanitizeHome`, this module is pure (no
// server-only imports) so the same types, defaults, and validator run on both
// render and save.

export type GlobalContent = {
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
};

// Seed identity — the fallback when `global` is null (e.g. a fresh CMS entry).
export const DEFAULT_GLOBAL: GlobalContent = {
  displayName: "Tayler Carney",
  focus: "Structural Fashion Design",
  email: "",
  linkedInHandle: "",
  instagramHandle: "",
  resumeAssetId: "",
};

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

// Hygraph asset ids are opaque alphanumeric tokens; anything else is dropped.
const assetId = (v: unknown): string => {
  const s = str(v).trim();
  return /^[a-z0-9]+$/i.test(s) ? s : "";
};

/**
 * Coerce arbitrary JSON (from the CMS or the admin settings form) into a complete,
 * well-typed GlobalContent. Missing keys fall back to DEFAULT_GLOBAL; unexpected
 * types are dropped. Strings are trimmed so stray whitespace never reaches the UI.
 */
export function sanitizeGlobal(raw: unknown): GlobalContent {
  const d = DEFAULT_GLOBAL;
  const data = (raw ?? {}) as Record<string, unknown>;
  return {
    displayName: str(data.displayName, d.displayName).trim(),
    focus: str(data.focus, d.focus).trim(),
    email: str(data.email, d.email).trim(),
    linkedInHandle: str(data.linkedInHandle, d.linkedInHandle).trim(),
    instagramHandle: str(data.instagramHandle, d.instagramHandle).trim(),
    resumeAssetId: assetId(data.resumeAssetId),
  };
}
