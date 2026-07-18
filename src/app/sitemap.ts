import type { MetadataRoute } from "next";
import { cmsQuery } from "@/lib/cms";
import { orderProjects, sanitizePortfolio } from "@/lib/portfolio";

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
  const base = (process.env.WEBSITE_URL ?? "").replace(/\/$/, "");

  const staticRoutes: MetadataRoute.Sitemap = ["", "/portfolio", "/about", "/atelier", "/contact"].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
  }));

  let projectRoutes: MetadataRoute.Sitemap = [];
  try {
    const data = await cmsQuery(SITEMAP_QUERY);
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
    // If the CMS is unreachable, still return the static routes.
  }

  return [...staticRoutes, ...projectRoutes];
}
