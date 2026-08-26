import { cache } from "react";
import { CACHE_TAGS, cmsRead } from "@/lib/cachedReads";
import { rethrowIfControlFlow } from "@/lib/nextErrors";
import { sanitizeGlobal, type GlobalContent } from "@/lib/global";
import { sanitizeSeo, type SeoContent } from "@/lib/seo";

const SITEDATA_QUERY = `
  query SiteData {
    siteDatas {
      id
      global
      seo
    }
  }
`;

export type SiteData = {
  id: string;
  global: GlobalContent;
  seo: SeoContent;
};

/**
 * The site identity singleton, read on every request by the root layout
 * (`generateMetadata`), the nav, and the footer.
 *
 * A CMS failure here must not take the site down. This runs inside the root
 * layout, which sits *outside* `app/error.tsx` — so an uncaught throw skips the
 * designed error page entirely and renders Next's unstyled crash screen on
 * every route at once.
 *
 * `sanitizeGlobal`/`sanitizeSeo` already treat a null field as "use the
 * defaults"; a failed *request* is treated the same way, so a Hygraph outage
 * degrades the nav and metadata to seed copy instead of a 500.
 *
 * Wrapped in React's `cache()` because those three call sites each triggered
 * their own network request: `no-store` opts a fetch out of Next's automatic
 * per-request deduplication, so the identical singleton query ran three times
 * to render one page. `cache()` collapses them to one.
 */
const getSiteData = cache(async function getSiteData(): Promise<SiteData> {
  let entry: Record<string, unknown> = {};

  try {
    const data = (await cmsRead(SITEDATA_QUERY, {}, { tags: [CACHE_TAGS.siteData] })) as
      | { siteDatas?: Record<string, unknown>[] }
      | null;
    entry = data?.siteDatas?.[0] ?? {};
  } catch (error) {
    // Next signals "this route must render dynamically" by throwing out of the
    // render pass. Swallowing that would leave the route marked static, so it
    // has to go back up untouched.
    rethrowIfControlFlow(error);

    // Logged rather than swallowed silently: the page still renders, so this
    // is the only signal that the CMS is unreachable.
    console.error("[SiteData] falling back to defaults — CMS read failed:", error);
  }

  return {
    id: typeof entry.id === "string" ? entry.id : "",
    global: sanitizeGlobal(entry.global),
    seo: sanitizeSeo(entry.seo),
  };
});

export default getSiteData;
