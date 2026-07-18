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
  /** URL of a resume PDF (Media Library asset). Empty hides the download links. */
  resumeUrl: string;
};

// Seed identity — the fallback when `global` is null (e.g. a fresh CMS entry).
export const DEFAULT_GLOBAL: GlobalContent = {
  displayName: "Tayler Carney",
  focus: "Structural Fashion Design",
  email: "",
  linkedInHandle: "",
  instagramHandle: "",
  resumeUrl: "",
};

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

// Resume links render as public hrefs, so only absolute http(s) URLs pass.
const httpUrl = (v: unknown): string => {
  const s = str(v).trim();
  return /^https?:\/\//i.test(s) ? s : "";
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
    resumeUrl: httpUrl(data.resumeUrl),
  };
}
