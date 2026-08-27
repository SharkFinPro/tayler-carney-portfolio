import { cache } from "react";
import { notFound } from "next/navigation";
import ProjectPageClient from "./ProjectPageClient";
import { Metadata } from "next";
import { CACHE_TAGS, cmsRead } from "@/lib/cachedReads";
import { isAuthed } from "@/lib/auth";
import { getAllProjects, getProjectMeta, normalizeSlug } from "./projectAccess";
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

  // Reachability — does this project exist, and may this viewer see it — is
  // decided in `layout.tsx`, which runs first and is the only place that can
  // set a real 404 status. This check is not a second opinion on that: it
  // narrows `project` to non-null for the type system, and by the time it runs
  // the layout has already turned away anything that would fail it.
  if (!project) {
    notFound();
  }

  // Archived projects are hidden from non-admins in the sibling list; filter
  // per-viewer here rather than baking admin state into the fetch above.
  const allProjects = isAdmin
    ? orderedProjects
    : orderedProjects.filter((p) => !p.archived);
  // Stored slugs are lowercase, so the raw URL param has to be normalised
  // before it is compared — otherwise a mixed-case URL finds no match and
  // silently loses its prev/next links.
  const currentIndex = allProjects.findIndex((p) => p.slug === normalizeSlug(slug));
  // `?? null` rather than a cast: an index that is in range by arithmetic can
  // still miss if the list changed, and prev/next are optional anyway.
  const prevProject = (currentIndex > 0 ? allProjects[currentIndex - 1] : null) ?? null;
  const nextProject =
    (currentIndex !== -1 && currentIndex < allProjects.length - 1
      ? allProjects[currentIndex + 1]
      : null) ?? null;

  return (
    <ProjectPageClient
      project={project}
      prevProject={prevProject}
      nextProject={nextProject}
      isAdmin={isAdmin}
    />
  );
}