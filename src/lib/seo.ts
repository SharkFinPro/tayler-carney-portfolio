// SEO metadata model.
//
// The site's search/social metadata is a singleton stored in the one SiteData
// entry's `seo` JSON field. It drives `generateMetadata()` in the root layout, so
// the site <title>, description, keywords, and OpenGraph/Twitter copy are editable
// from the admin settings page instead of being hardcoded. Pure module (no
// server-only imports) so the validator runs on both render and save.

/**
 * The routes that carry their own search/social copy.
 *
 * Project detail pages are absent on purpose: they already derive their title
 * and description from the project's own editable fields, so giving them a
 * fixed override would be a second source of truth for the same thing.
 */
export const SEO_PAGE_KEYS = ["home", "portfolio", "atelier", "about", "contact"] as const;
export type SeoPageKey = (typeof SEO_PAGE_KEYS)[number];

/** Per-route overrides. `title` feeds the title template; both may be blank. */
export type SeoPage = { title: string; description: string };

export type SeoContent = {
  // Default document title and the template used for child pages ("%s" is the
  // page-level title, e.g. "Contact | Tayler Carney").
  title: string;
  titleTemplate: string;
  description: string;
  keywords: string[];
  ogTitle: string;
  ogDescription: string;
  /**
   * Per-route title and description.
   *
   * These were previously hardcoded in each route's `export const metadata`,
   * so the Settings page could rename the site everywhere except in the search
   * results for four of its five pages.
   */
  pages: Record<SeoPageKey, SeoPage>;
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
  // Verbatim from the `export const metadata` each route used to declare, so
  // search results are unchanged until an admin edits them.
  pages: {
    home: { title: "Home", description: "" },
    portfolio: {
      title: "Portfolio",
      description:
        "A working archive of structural fashion projects by Tayler Carney — garment engineering, pattern-making, and material studies documented in full.",
    },
    atelier: {
      title: "Atelier",
      description:
        "Inside the studio — the process, tooling, and material research behind Tayler Carney's structural garments.",
    },
    about: {
      title: "About",
      description:
        "The designer behind the archive — Tayler Carney's background, practice, and approach to structural fashion design.",
    },
    contact: {
      title: "Contact",
      description:
        "Get in touch with Tayler Carney for collaborations, commissions, and studio inquiries.",
    },
  },
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
    // Legacy shape only. The Settings form sends an array, because a comma is
    // a legitimate character inside a keyword phrase and splitting on it tears
    // such a keyword in two. A string that predates that still has to load.
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
    pages: sanitizePages(data.pages),
  };
}

/**
 * Coerce the per-route overrides, always returning an entry for every key so
 * callers never have to guard. An unrecognized key in stored JSON is ignored
 * rather than carried forward, which keeps a renamed route from leaving debris
 * behind forever.
 */
function sanitizePages(raw: unknown): Record<SeoPageKey, SeoPage> {
  const data = (raw ?? {}) as Record<string, unknown>;
  const out = {} as Record<SeoPageKey, SeoPage>;

  for (const key of SEO_PAGE_KEYS) {
    const entry = (data[key] ?? {}) as Record<string, unknown>;
    const fallback = DEFAULT_SEO.pages[key];
    out[key] = {
      title: str(entry.title, fallback.title).trim(),
      description: str(entry.description, fallback.description).trim(),
    };
  }
  return out;
}

/**
 * Metadata for one route, resolved against the site-wide values.
 *
 * A blank per-page description falls through to the site description rather
 * than emitting an empty tag — an empty `<meta name="description">` is worse
 * for search than a generic one.
 */
export function pageMetadata(seo: SeoContent, key: SeoPageKey): {
  title: string;
  description: string;
} {
  const page = seo.pages[key] ?? DEFAULT_SEO.pages[key];
  return {
    title: page.title || DEFAULT_SEO.pages[key].title,
    description: page.description || seo.description,
  };
}
