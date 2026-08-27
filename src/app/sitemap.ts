import type { MetadataRoute } from "next";
import { CACHE_TAGS, cmsRead } from "@/lib/cachedReads";
import { orderProjects, sanitizePortfolio } from "@/lib/portfolio";
import { siteBaseUrl } from "@/lib/siteUrl";

// Deliberately has no $stage variable: a sitemap must only ever list
// published pages, and cmsRead only substitutes a stage into queries that ask
// for one. An admin browsing does not change what search engines are told.
const SITEMAP_QUERY = `
  query SitemapProjects {
    projects {
      id
      slug
      updatedAt
    }
    siteDatas {
      portfolio
    }
  }
`;

interface SitemapProject {
  id: string;
  slug: string;
  updatedAt?: string;
}

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteBaseUrl();

  const staticRoutes: MetadataRoute.Sitemap = ["", "/portfolio", "/about", "/atelier", "/contact"].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
  }));

  let projectRoutes: MetadataRoute.Sitemap = [];
  try {
    const data = await cmsRead(SITEMAP_QUERY, {}, { tags: [CACHE_TAGS.siteData, CACHE_TAGS.projects] });
    const projects: SitemapProject[] = data?.projects ?? [];
    // Archived projects 404 for the public (see lib/portfolio), so exclude them
    // from the sitemap using the same order + archive merge the site renders with.
    const config = sanitizePortfolio(data?.siteDatas?.[0]?.portfolio);
    projectRoutes = orderProjects(projects, config)
      .filter((p) => !p.archived)
      .map((p) => ({
        url: `${base}/portfolio/${p.slug}`,
        lastModified: p.updatedAt ? new Date(p.updatedAt) : new Date(),
      }));
  } catch {
    // If the CMS is unreachable, still return the static routes: a sitemap
    // that 500s is worse than one listing only the static pages, because the
    // crawler drops what it already knew.
    //
    // A bare catch on a CMS read is exactly what AGENTS.md warns against —
    // Next signals "this route must render dynamically" by throwing, and a
    // catch without `rethrowIfControlFlow` eats it. It is safe here, and only
    // here, because `dynamic = "force-dynamic"` above already settles that
    // question: there is no static-render attempt left to signal about. If
    // that export is ever removed, this catch has to grow the rethrow with it.
  }

  return [...staticRoutes, ...projectRoutes];
}
