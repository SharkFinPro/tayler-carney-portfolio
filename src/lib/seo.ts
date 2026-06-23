// SEO metadata model.
//
// The site's search/social metadata is a singleton stored in the one SiteData
// entry's `seo` JSON field. It drives `generateMetadata()` in the root layout, so
// the site <title>, description, keywords, and OpenGraph/Twitter copy are editable
// from the admin settings page instead of being hardcoded. Pure module (no
// server-only imports) so the validator runs on both render and save.

export type SeoContent = {
  // Default document title and the template used for child pages ("%s" is the
  // page-level title, e.g. "Contact | Tayler Carney").
  title: string;
  titleTemplate: string;
  description: string;
  keywords: string[];
  ogTitle: string;
  ogDescription: string;
};

// Seed metadata — mirrors the original hardcoded layout metadata exactly, so SEO
// is unchanged until an admin edits it (and is the fallback when `seo` is null).
export const DEFAULT_SEO: SeoContent = {
  title: "Tayler Carney's Portfolio",
  titleTemplate: "%s | Tayler Carney",
  description:
    "A professional portfolio of structural fashion design by Tayler Carney, showcasing the intersection of garment engineering and architectural precision through pattern-making and material research.",
  keywords: [
    "tayler carney",
    "fashion design portfolio",
    "structural design",
    "pattern making",
    "apparel production",
    "fashion architecture",
  ],
  ogTitle: "Tayler Carney | Structural Fashion Design",
  ogDescription: "Explore a portfolio of garments engineered with the precision of architecture.",
};

const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

/**
 * Coerce arbitrary JSON (from the CMS or the admin settings form) into a complete,
 * well-typed SeoContent. Missing keys fall back to DEFAULT_SEO; unexpected types
 * are dropped. Keywords accept either an array or a comma-separated string (the
 * settings form edits them as one line) and bad entries are dropped.
 */
export function sanitizeSeo(raw: unknown): SeoContent {
  const d = DEFAULT_SEO;
  const data = (raw ?? {}) as Record<string, unknown>;

  let keywords: string[];
  if (Array.isArray(data.keywords)) {
    keywords = data.keywords.map((k) => str(k).trim()).filter(Boolean);
  } else if (typeof data.keywords === "string") {
    keywords = data.keywords.split(",").map((k) => k.trim()).filter(Boolean);
  } else {
    keywords = d.keywords;
  }

  return {
    title: str(data.title, d.title).trim(),
    titleTemplate: str(data.titleTemplate, d.titleTemplate).trim(),
    description: str(data.description, d.description).trim(),
    keywords,
    ogTitle: str(data.ogTitle, d.ogTitle).trim(),
    ogDescription: str(data.ogDescription, d.ogDescription).trim(),
  };
}
