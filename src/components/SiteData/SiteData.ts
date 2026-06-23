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

export default async function getSiteData(): Promise<SiteData> {
  const data = await cmsQuery(SITEDATA_QUERY);
  const entry = data?.siteDatas?.[0] ?? {};
  return {
    id: entry.id ?? "",
    global: sanitizeGlobal(entry.global),
    seo: sanitizeSeo(entry.seo),
  };
}
