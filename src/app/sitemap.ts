import type { MetadataRoute } from "next";
import { CACHE_TAGS, cmsRead } from "@/lib/cachedReads";
import { orderProjects, sanitizePortfolio } from "@/lib/portfolio";
import { siteBaseUrl } from "@/lib/siteUrl";
import { rethrowIfControlFlow } from "@/lib/nextErrors";

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
  } catch (error) {
    // Next signals control flow by throwing, so hand anything of that shape
    // straight back rather than swallowing it.
    //
    // `dynamic = "force-dynamic"` above arguably makes the DYNAMIC_SERVER_USAGE
    // case unreachable here, but that is only one of the five signals
    // `rethrowIfControlFlow` knows about — a `redirect()` or `notFound()`
    // appearing anywhere down this call chain later would be eaten silently.
    // Following the rule costs one line and removes the need to keep checking
    // whether the exception still holds.
    rethrowIfControlFlow(error);

    // Anything else: still return the static routes. A sitemap that 500s is
    // worse than one listing only the static pages, because the crawler drops
    // what it already knew.
  }

  return [...staticRoutes, ...projectRoutes];
}
