import { Metadata } from "next";
import ContactPageClient from "./ContactPageClient";
import { cmsQuery } from "@/lib/cms";
import { isAuthed } from "@/lib/auth";
import { sanitizeGlobal } from "@/lib/global";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with Tayler Carney for collaborations, commissions, and studio inquiries.",
};

export const dynamic = "force-dynamic";

// The contact page intro is a singleton stored on the one SiteData entry's
// `contact` JSON field (block layout). The email + social handles come from the
// site-wide `global` JSON field, surfaced here for the channels panel.
const CONTACT_QUERY = `
  query Contact {
    siteDatas {
      id
      contact
      global
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
  const global = sanitizeGlobal(siteData?.global);

  return (
    <ContactPageClient
      siteId={siteData?.id ?? ""}
      contact={siteData?.contact ?? null}
      email={global.email}
      linkedInHandle={global.linkedInHandle}
      instagramHandle={global.instagramHandle}
      isAdmin={isAdmin}
    />
  );
}
