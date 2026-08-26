// Caching policy for visitor-facing CMS reads.
//
// Before this, every content route was `force-dynamic` and every fetch was
// `no-store`, so a single project pageview cost six sequential Hygraph
// round-trips — and a Hygraph outage took the whole site down with it.
//
// Two independent problems, fixed separately:
//
//   1. The same query running several times in ONE request (getSiteData was
//      called by generateMetadata, NavBar, and Footer). Fixed with React's
//      `cache()` at the call sites — pure win, no staleness.
//   2. The same query running on EVERY request even though the content changes
//      weekly. Fixed here, with the fetch cache.
//
// The admin bypass is the important part. `AGENTS.md` records a deliberate
// decision not to revalidate on write, because the read CDN lags a write and a
// refetch would clobber the optimistic editor UI. That reasoning still holds,
// so writes still do not call `revalidateTag`. Instead:
//
//   - Visitors read through the cache and see a change within CONTENT_TTL.
//   - Admins always read fresh, so the editor never loads stale content that
//     it might then save back over the top of a newer version.
//
// The tags are attached anyway. They cost nothing and mean a future
// revalidate-on-write is a one-line change if the CDN lag stops mattering.

import "server-only";
import { isAuthed } from "@/lib/auth";
import { cmsQuery, type CacheOptions } from "@/lib/cms";

/**
 * How long a visitor may see stale content. Sixty seconds is far shorter than
 * the real editing cadence of a portfolio, and turns "one CMS round-trip per
 * visitor" into "one per minute per route".
 */
export const CONTENT_TTL = 60;

export const CACHE_TAGS = {
  siteData: "site-data",
  projects: "projects",
  project: (slug: string) => `project:${slug}`,
} as const;

type Vars = Record<string, unknown>;

/**
 * Read published content, cached for visitors and fresh for admins.
 *
 * Note this calls `isAuthed()`, which reads cookies — but every page here
 * already does that to decide whether to render edit affordances, so it adds
 * no constraint that wasn't already present.
 */
// The generic defaults to `any` to match what `cmsQuery` already returns (the
// GraphQL response is untyped JSON), so adopting this helper needed no call-site
// churn. Call sites that care pass a shape — `page.tsx` does.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function cmsRead<T = any>(
  query: string,
  variables: Vars = {},
  options: CacheOptions = {}
): Promise<T> {
  if (await isAuthed()) {
    // No cache options at all → `no-store`, the pre-existing behavior.
    return cmsQuery(query, variables);
  }

  return cmsQuery(query, variables, {
    tags: options.tags,
    revalidate: options.revalidate ?? CONTENT_TTL,
  });
}
