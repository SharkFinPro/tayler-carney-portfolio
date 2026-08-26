import { Metadata } from "next";
import HomePageClient from "./HomePageClient";
import { CACHE_TAGS, cmsRead } from "@/lib/cachedReads";
import { isAuthed } from "@/lib/auth";
import getSiteData from "@/components/SiteData";
import { pageMetadata } from "@/lib/seo";
import { sanitizeHome } from "@/lib/home";

// Title and description come from SiteData.seo.pages, editable on the admin
// Settings page. The values there are seeded with exactly what this route used
// to hardcode, so search results are unchanged until someone edits them.
export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getSiteData();
  return pageMetadata(seo, "home");
}

export const dynamic = "force-dynamic";

// The homepage is a singleton stored on the one SiteData entry: its content
// lives in the `home` JSON field, edited inline / via card modals on the page.
const HOME_QUERY = `
  query Home {
    siteDatas {
      id
      home
    }
  }
`;

async function getHome(): Promise<{ id: string; home: unknown } | null> {
  const data = await cmsRead(HOME_QUERY, {}, { tags: [CACHE_TAGS.siteData] });
  return data?.siteDatas?.[0] ?? null;
}

export default async function Home() {
  const siteData = await getHome();
  const isAdmin = await isAuthed();

  return (
    <HomePageClient
      siteId={siteData?.id ?? ""}
      home={sanitizeHome(siteData?.home)}
      isAdmin={isAdmin}
    />
  );
}
