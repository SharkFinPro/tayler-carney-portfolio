import { Metadata } from "next";
import PortfolioClient from "./PortfolioClient";
import { CACHE_TAGS, cmsRead } from "@/lib/cachedReads";
import { isAuthed } from "@/lib/auth";
import { orderProjects, sanitizePortfolio } from "@/lib/portfolio";

export const metadata: Metadata = {
  title: "Portfolio",
  description:
    "A working archive of structural fashion projects by Tayler Carney — garment engineering, pattern-making, and material studies documented in full.",
};

export const dynamic = "force-dynamic";

// Projects live in their own model; their order + archived status live in the
// SiteData singleton's `portfolio` JSON field (see lib/portfolio).
const PORTFOLIO_QUERY = `
  query Portfolio {
    projects {
      id
      title
      slug
      description
    }
    siteDatas {
      id
      portfolio
    }
  }
`;

type RawProject = { id: string; title: string; slug: string; description: string };

async function getPortfolio() {
  const data = await cmsRead(PORTFOLIO_QUERY, {}, { tags: [CACHE_TAGS.siteData, CACHE_TAGS.projects] });
  return {
    projects: (data?.projects ?? []) as RawProject[],
    siteId: data?.siteDatas?.[0]?.id ?? "",
    config: sanitizePortfolio(data?.siteDatas?.[0]?.portfolio),
  };
}

export default async function Portfolio() {
  const { projects, siteId, config } = await getPortfolio();
  const isAdmin = await isAuthed();

  // Apply the saved order + archive flags. Archived projects are only sent to
  // the client for admins; the public payload never includes them.
  const ordered = orderProjects(projects, config);
  const visible = isAdmin ? ordered : ordered.filter((p) => !p.archived);

  return (
    <PortfolioClient
      siteId={siteId}
      projects={visible}
      isAdmin={isAdmin}
    />
  );
}
