import { cmsQuery } from "@/lib/cms";
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
 */
export default async function getSiteData(): Promise<SiteData> {
  let entry: Record<string, unknown> = {};

  try {
    const data = await cmsQuery(SITEDATA_QUERY);
    entry = data?.siteDatas?.[0] ?? {};
  } catch (error) {
    // Logged rather than swallowed silently: the page still renders, so this
    // is the only signal that the CMS is unreachable.
    console.error("[SiteData] falling back to defaults — CMS read failed:", error);
  }

  return {
    id: typeof entry.id === "string" ? entry.id : "",
    global: sanitizeGlobal(entry.global),
    seo: sanitizeSeo(entry.seo),
  };
}
