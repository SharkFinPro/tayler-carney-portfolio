import { cache } from "react";
import { CACHE_TAGS, cmsRead } from "@/lib/cachedReads";
import { orderProjects, sanitizePortfolio } from "@/lib/portfolio";

// The two reads that decide whether a slug is *reachable*, shared by the
// layout (which enforces it) and the page (which then renders it).
//
// Both are wrapped in React `cache()`, so the layout asking the same questions
// the page asks costs nothing: within one request the second call is a cache
// hit, not a second CMS round-trip.

/**
 * The two fields metadata needs — deliberately not the page's ~20-relation
 * query, which would be a large read to answer "does this exist".
 */
export const getProjectMeta = cache(async (slug: string) => {
  const data = (await cmsRead(
    `query ProjectMeta($slug: String!, $stage: Stage!) {
       projects(stage: $stage, where: { slug: $slug }) { title description }
     }`,
    { slug: slug.toLowerCase() },
    { tags: [CACHE_TAGS.projects, CACHE_TAGS.project(slug.toLowerCase())] }
  )) as { projects?: { title: string; description: string }[] } | null;

  return data?.projects?.[0] ?? null;
});

/**
 * Sibling projects for prev/next navigation, in the same order the portfolio
 * index uses. Archived projects are kept here (including the archived flag)
 * and filtered per-viewer at the call site, so the fetch doesn't depend on
 * admin state.
 */
export const getAllProjects = cache(async function getAllProjects() {
  const data = (await cmsRead(
    `query SiblingProjects($stage: Stage!) {
       projects(stage: $stage) { id slug title }
       siteDatas(stage: $stage) { portfolio }
     }`,
    {},
    { tags: [CACHE_TAGS.projects, CACHE_TAGS.siteData] }
  )) as {
    projects?: { id: string; slug: string; title: string }[];
    siteDatas?: { portfolio?: unknown }[];
  } | null;

  const config = sanitizePortfolio(data?.siteDatas?.[0]?.portfolio);
  return orderProjects(data?.projects ?? [], config);
});
