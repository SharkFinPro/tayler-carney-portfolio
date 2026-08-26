import { Metadata } from "next";
import AboutPageClient from "./AboutPageClient";
import { CACHE_TAGS, cmsRead } from "@/lib/cachedReads";
import { isAuthed } from "@/lib/auth";
import getSiteData from "@/components/SiteData";
import { pageMetadata } from "@/lib/seo";

// Title and description come from SiteData.seo.pages, editable on the admin
// Settings page. The values there are seeded with exactly what this route used
// to hardcode, so search results are unchanged until someone edits them.
export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getSiteData();
  return pageMetadata(seo, "about");
}

export const dynamic = "force-dynamic";

// The about page is a singleton stored on the one SiteData entry: its block
// layout lives in the `about` JSON field, edited with the same block editor the
// project and atelier pages use.
const ABOUT_QUERY = `
  query About($stage: Stage!) {
    siteDatas(stage: $stage) {
      id
      about
    }
  }
`;

async function getAbout(): Promise<{ id: string; about: unknown } | null> {
  const data = await cmsRead(ABOUT_QUERY, {}, { tags: [CACHE_TAGS.siteData] });
  return data?.siteDatas?.[0] ?? null;
}

export default async function About() {
  const siteData = await getAbout();
  const isAdmin = await isAuthed();

  return (
    <AboutPageClient
      siteId={siteData?.id ?? ""}
      about={siteData?.about ?? null}
      isAdmin={isAdmin}
    />
  );
}
