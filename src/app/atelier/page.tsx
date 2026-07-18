import { Metadata } from "next";
import AtelierPageClient from "./AtelierPageClient";
import { cmsQuery } from "@/lib/cms";
import { isAuthed } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Atelier",
  description:
    "Inside the studio — the process, tooling, and material research behind Tayler Carney's structural garments.",
};

export const dynamic = "force-dynamic";

// The atelier page is a singleton stored on the one SiteData entry: its block
// layout lives in the `atelier` JSON field, edited with the same block editor
// the project pages use.
const ATELIER_QUERY = `
  query Atelier {
    siteDatas {
      id
      atelier
    }
  }
`;

async function getAtelier(): Promise<{ id: string; atelier: unknown } | null> {
  const data = await cmsQuery(ATELIER_QUERY);
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
