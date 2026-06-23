import { Metadata } from "next";
import AboutPageClient from "./AboutPageClient";
import { cmsQuery } from "@/lib/cms";
import { isAuthed } from "@/lib/auth";

export const metadata: Metadata = {
  title: "About"
};

export const dynamic = "force-dynamic";

// The about page is a singleton stored on the one SiteData entry: its block
// layout lives in the `about` JSON field, edited with the same block editor the
// project and atelier pages use.
const ABOUT_QUERY = `
  query About {
    siteDatas {
      id
      about
    }
  }
`;

async function getAbout(): Promise<{ id: string; about: unknown } | null> {
  const data = await cmsQuery(ABOUT_QUERY);
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
