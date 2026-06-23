import { notFound } from "next/navigation";
import ProjectPageClient from "./ProjectPageClient";
import { Metadata } from "next";
import { cmsQuery } from "@/lib/cms";
import { isAuthed } from "@/lib/auth";
import { orderProjects, sanitizePortfolio } from "@/lib/portfolio";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

async function getProject(slug: string) {
  try {
    const data = await cmsQuery(
      `
          query Projects($slug: String!) {
            projects(where: {slug: $slug}) {
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
      { slug: slug.toLowerCase() }
    );

    return data?.projects?.[0] ?? null;
  } catch (error) {
    console.log("Error fetching project: ", error);
    notFound();
  }
}

// Sibling projects for prev/next navigation, in the same order the portfolio
// index uses and (for non-admins) with archived projects removed.
async function getAllProjects(isAdmin: boolean) {
  const data = await cmsQuery(`
        query {
          projects {
            id
            slug
            title
          }
          siteDatas {
            portfolio
          }
        }
      `);
  const config = sanitizePortfolio(data?.siteDatas?.[0]?.portfolio);
  const projects = (data?.projects ?? []) as { id: string; slug: string; title: string }[];
  const ordered = orderProjects(projects, config);
  return isAdmin ? ordered : ordered.filter((p) => !p.archived);
}

export async function generateMetadata({
  params,
}: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProject(slug);

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

  const project = await getProject(slug);

  if (!project) {
    notFound();
  }

  const isAdmin = await isAuthed();

  const allProjects = await getAllProjects(isAdmin);
  // An archived project is filtered out of the list for non-admins, so its
  // absence here means it must not be reachable directly either.
  const currentIndex = allProjects.findIndex((p: any) => p.slug === slug);
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