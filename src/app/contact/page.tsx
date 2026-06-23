import { Metadata } from "next";
import ContactPageClient from "./ContactPageClient";
import { cmsQuery } from "@/lib/cms";
import { isAuthed } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Contact"
};

export const dynamic = "force-dynamic";

// The contact page intro is a singleton stored on the one SiteData entry's
// `contact` JSON field (block layout). The email + social handles are SiteData
// scalars, surfaced here for the channels panel.
const CONTACT_QUERY = `
  query Contact {
    siteDatas {
      id
      contact
      email
      linkedInHandle
      instagramHandle
    }
  }
`;

async function getContact() {
  const data = await cmsQuery(CONTACT_QUERY);
  return data?.siteDatas?.[0] ?? null;
}

export default async function ContactPage() {
  const siteData = await getContact();
  const isAdmin = await isAuthed();

  return (
    <ContactPageClient
      siteId={siteData?.id ?? ""}
      contact={siteData?.contact ?? null}
      email={siteData?.email ?? ""}
      linkedInHandle={siteData?.linkedInHandle ?? ""}
      instagramHandle={siteData?.instagramHandle ?? ""}
      isAdmin={isAdmin}
    />
  );
}
