import { cache } from "react";
import { notFound } from "next/navigation";
import ProjectPageClient from "./ProjectPageClient";
import { Metadata } from "next";
import { CACHE_TAGS, cmsRead } from "@/lib/cachedReads";
import { isAuthed } from "@/lib/auth";
import { orderProjects, sanitizePortfolio } from "@/lib/portfolio";
import type { LegacyProject } from "@/components/blocks/blocks";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

// The shape the detail query returns. `LegacyProject` carries the old fixed
// fields (sketches, techPacks, …) that `projectToBlocks` falls back to when a
// project has no stored block layout.
type ProjectRecord = LegacyProject & {
  id: string;
  title: string;
  slug: string;
  description: string;
  projectPage?: unknown;
};

// Metadata needs only two fields. Previously `generateMetadata` ran the full
// ~20-relation project query, and the page component ran it again — two
// executions of a large query to render one page.
const getProjectMeta = cache(async (slug: string) => {
  const data = (await cmsRead(
    `query ProjectMeta($slug: String!, $stage: Stage!) {
       projects(stage: $stage, where: { slug: $slug }) { title description }
     }`,
    { slug: slug.toLowerCase() },
    { tags: [CACHE_TAGS.projects, CACHE_TAGS.project(slug.toLowerCase())] }
  )) as { projects?: { title: string; description: string }[] } | null;

  return data?.projects?.[0] ?? null;
});

const getProject = cache(async function getProject(slug: string) {
  try {
    const data = await cmsRead(
      `
          query Projects($slug: String!, $stage: Stage!) {
            projects(stage: $stage, where: {slug: $slug}) {
              id
              title
              slug
              description
              projectPage
              sketches {
                url
                altText
              }
              digitalRendering {
                url
                altText
              }
              frontFlat {
                url
                altText
              }
              backFlat {
                url
                altText
              }
              sideFlat {
                url
                altText
              }
              coloredFlats {
                title
                description
                image {
                  url
                  altText
                }
              }
              details {
                title
                description
                image {
                  url
                  altText
                }
              }
              patterns {
                url
                altText
              }
              materials {
                title
                description
                image {
                  url
                  altText
                }
              }
              techPackHeader
              techPacks {
                title
                description
                image {
                  url
                  altText
                }
              }
              looks {
                title
                description
                image {
                  url
                  altText
                }
              }
              finalProduct {
                url
                altText
              }
            }
          }
        `,
      { slug: slug.toLowerCase() },
      { tags: [CACHE_TAGS.projects, CACHE_TAGS.project(slug.toLowerCase())] }
    ) as { projects?: ProjectRecord[] } | null;

    return data?.projects?.[0] ?? null;
  } catch (error) {
    // A genuine "no such project" returns null above. Anything that throws here
    // is a CMS/network failure — let it propagate to the error boundary rather
    // than masking a real outage as a 404 for work that actually exists.
    console.error("Error fetching project: ", error);
    throw error;
  }
});

// Sibling projects for prev/next navigation, in the same order the portfolio
// index uses. Archived projects are kept here (including the archived flag) and
// filtered per-viewer at the call site, so the fetch doesn't depend on admin
// state and can run concurrently with it.
const getAllProjects = cache(async function getAllProjects() {
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

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  // The two-field query, not the full ~20-relation one the page uses.
  const project = await getProjectMeta(slug);

  if (!project) {
    return {
      title: "Project Not Found",
    };
  }

  return {
    title: project.title,
    description: project.description,
  };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;

  // The project, the session, and the sibling list are independent reads — fire
  // them concurrently instead of paying three serial CMS round-trips.
  const [project, isAdmin, orderedProjects] = await Promise.all([
    getProject(slug),
    isAuthed(),
    getAllProjects(),
  ]);

  if (!project) {
    notFound();
  }

  // Archived projects are hidden from non-admins in the sibling list; filter
  // per-viewer here rather than baking admin state into the fetch above.
  const allProjects = isAdmin
    ? orderedProjects
    : orderedProjects.filter((p) => !p.archived);
  // An archived project is filtered out of the list for non-admins, so its
  // absence here means it must not be reachable directly either.
  const currentIndex = allProjects.findIndex((p) => p.slug === slug);
  if (!isAdmin && currentIndex === -1) {
    notFound();
  }
  const prevProject = currentIndex > 0 ? allProjects[currentIndex - 1] : null;
  const nextProject =
    currentIndex !== -1 && currentIndex < allProjects.length - 1
      ? allProjects[currentIndex + 1]
      : null;

  return (
    <ProjectPageClient
      project={project}
      prevProject={prevProject}
      nextProject={nextProject}
      isAdmin={isAdmin}
    />
  );
}