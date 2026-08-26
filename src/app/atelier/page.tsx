import { Metadata } from "next";
import AtelierPageClient from "./AtelierPageClient";
import { CACHE_TAGS, cmsRead } from "@/lib/cachedReads";
import { isAuthed } from "@/lib/auth";
import getSiteData from "@/components/SiteData";
import { pageMetadata } from "@/lib/seo";

// Title and description come from SiteData.seo.pages, editable on the admin
// Settings page. The values there are seeded with exactly what this route used
// to hardcode, so search results are unchanged until someone edits them.
export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getSiteData();
  return pageMetadata(seo, "atelier");
}

export const dynamic = "force-dynamic";

// The atelier page is a singleton stored on the one SiteData entry: its block
// layout lives in the `atelier` JSON field, edited with the same block editor
// the project pages use.
const ATELIER_QUERY = `
  query Atelier($stage: Stage!) {
    siteDatas(stage: $stage) {
      id
      atelier
    }
  }
`;

async function getAtelier(): Promise<{ id: string; atelier: unknown } | null> {
  const data = await cmsRead(ATELIER_QUERY, {}, { tags: [CACHE_TAGS.siteData] });
  return data?.siteDatas?.[0] ?? null;
}

export default async function Atelier() {
  const siteData = await getAtelier();
  const isAdmin = await isAuthed();

  return (
    <AtelierPageClient
      siteId={siteData?.id ?? ""}
      atelier={siteData?.atelier ?? null}
      isAdmin={isAdmin}
    />
  );
}
