import { Metadata } from "next";
import ContactPageClient from "./ContactPageClient";
import { CACHE_TAGS, cmsRead } from "@/lib/cachedReads";
import { isAuthed } from "@/lib/auth";
import getSiteData from "@/components/SiteData";
import { pageMetadata } from "@/lib/seo";
import { sanitizeGlobal } from "@/lib/global";
import { resolveResumeAsset } from "@/lib/resume";

// Title and description come from SiteData.seo.pages, editable on the admin
// Settings page. The values there are seeded with exactly what this route used
// to hardcode, so search results are unchanged until someone edits them.
export async function generateMetadata(): Promise<Metadata> {
  const { seo } = await getSiteData();
  return pageMetadata(seo, "contact");
}

export const dynamic = "force-dynamic";

// The contact page intro is a singleton stored on the one SiteData entry's
// `contact` JSON field (block layout). The email + social handles come from the
// site-wide `global` JSON field, surfaced here for the channels panel.
const CONTACT_QUERY = `
  query Contact($stage: Stage!) {
    siteDatas(stage: $stage) {
      id
      contact
      global
    }
  }
`;

async function getContact() {
  const data = await cmsRead(CONTACT_QUERY, {}, { tags: [CACHE_TAGS.siteData] });
  return data?.siteDatas?.[0] ?? null;
}

export default async function ContactPage() {
  const siteData = await getContact();
  const isAdmin = await isAuthed();
  const global = sanitizeGlobal(siteData?.global);
  const resume = await resolveResumeAsset(global.resumeAssetId);

  return (
    <ContactPageClient
      siteId={siteData?.id ?? ""}
      contact={siteData?.contact ?? null}
      email={global.email}
      linkedInHandle={global.linkedInHandle}
      instagramHandle={global.instagramHandle}
      resume={resume}
      isAdmin={isAdmin}
    />
  );
}
