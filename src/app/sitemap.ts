import type { MetadataRoute } from "next";
import { cmsQuery } from "@/lib/cms";

const SITEMAP_QUERY = `
  query SitemapProjects {
    projects {
      slug
      updatedAt
    }
  }
`;

interface SitemapProject {
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
    projectRoutes = projects.map((p) => ({
      url: `${base}/portfolio/${p.slug}`,
      lastModified: p.updatedAt ? new Date(p.updatedAt) : new Date(),
    }));
  } catch {
    // If the CMS is unreachable, still return the static routes.
  }

  return [...staticRoutes, ...projectRoutes];
}
