// Portfolio ordering + archive model.
//
// The portfolio page lists Project entries that live in their own Hygraph
// model, but their *display order* and *archived* status are an editorial
// concern stored alongside the rest of the site singleton in the one SiteData
// entry's `portfolio` JSON field. Keeping it here (rather than as columns on
// Project) means reordering/archiving is a single cheap write and can never
// corrupt the projects themselves.
//
// This module is intentionally pure (no server-only imports) so the same
// types, `sanitizePortfolio` validator, and `orderProjects` merge can run on
// both render and save, exactly like `sanitizeHome` does for the homepage.

import { isSafeUrl } from "@/components/blocks/richText/richTextAst";

export type PortfolioEntry = {
  // Stable Hygraph id of the Project this entry refers to.
  id: string;
  archived: boolean;
  // Optional cover image for the portfolio index row. The image itself lives in
  // Hygraph's asset store; we only persist its URL + alt here so the index can
  // show imagery without a Project schema change.
  coverUrl?: string;
  coverAlt?: string;
};

export type PortfolioConfig = {
  // Ordered list of known projects. Projects absent from this list (e.g. just
  // created) are treated as un-archived and appended after the known ones.
  entries: PortfolioEntry[];
};

export const EMPTY_PORTFOLIO: PortfolioConfig = { entries: [] };

const str = (v: unknown): string => (typeof v === "string" ? v : "");

// Only accept absolute http(s) URLs for a cover image: they're rendered through
// next/image and must resolve to a real remote host (graphassets), so relative
// or mailto/#-style values `isSafeUrl` also permits are rejected here.
const isSafeHttpUrl = (v: unknown): v is string =>
  typeof v === "string" && isSafeUrl(v) && /^https?:\/\//i.test(v.trim());

/**
 * Coerce arbitrary JSON (from the CMS or the client editor) into a complete,
 * well-typed PortfolioConfig. Bad rows (missing id) are dropped and duplicate
 * ids are collapsed to the first occurrence, so a malformed value can never
 * break the page or produce a project listed twice.
 */
export function sanitizePortfolio(raw: unknown): PortfolioConfig {
  const data = (raw ?? {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const entries: PortfolioEntry[] = Array.isArray(data.entries)
    ? data.entries
        .map((item) => {
          const o = (item ?? {}) as Record<string, unknown>;
          const entry: PortfolioEntry = { id: str(o.id), archived: o.archived === true };
          if (isSafeHttpUrl(o.coverUrl)) {
            entry.coverUrl = o.coverUrl.trim();
            const alt = str(o.coverAlt).trim();
            if (alt) entry.coverAlt = alt;
          }
          return entry;
        })
        .filter((e) => {
          if (!e.id || seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        })
    : [];
  return { entries };
}

export type OrderedProject<T> = T & {
  archived: boolean;
  coverUrl?: string;
  coverAlt?: string;
};

/**
 * Merge the CMS project list with the saved config: apply the saved order and
 * archived flags, and append any projects not yet in the config (in their
 * original CMS order) as un-archived. The merge is stable, so a project the
 * config doesn't know about never disappears — it just lands at the end.
 */
export function orderProjects<T extends { id: string }>(
  projects: T[],
  config: PortfolioConfig
): OrderedProject<T>[] {
  const byId = new Map(config.entries.map((e) => [e.id, e]));
  const orderIndex = new Map(config.entries.map((e, i) => [e.id, i]));

  return projects
    .map((p) => {
      const entry = byId.get(p.id);
      return {
        ...p,
        archived: entry?.archived ?? false,
        ...(entry?.coverUrl ? { coverUrl: entry.coverUrl, coverAlt: entry.coverAlt } : {}),
      };
    })
    .sort((a, b) => {
      const ai = orderIndex.get(a.id);
      const bi = orderIndex.get(b.id);
      if (ai === undefined && bi === undefined) return 0;
      if (ai === undefined) return 1;
      if (bi === undefined) return -1;
      return ai - bi;
    });
}

// Lowercase, trim, collapse whitespace/punctuation to single hyphens. Mirrors
// the slug shape the rest of the site routes on (project lookups lowercase the
// slug before querying), so a generated slug always resolves.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
