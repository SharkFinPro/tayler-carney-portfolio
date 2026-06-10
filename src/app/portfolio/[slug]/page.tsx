import { notFound } from "next/navigation";
import ProjectPageClient from "./ProjectPageClient";
import { Metadata } from "next";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

async function getProject(slug: string) {
  try {
    const response = await fetch(process.env.CMS_ENDPOINT as string, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + process.env.CMS_TOKEN,
      },
      body: JSON.stringify({
        query: `
          query Projects($slug: String!) {
            projects(where: {slug: $slug}) {
              title
              slug
              description
              sketches {
                url
              }
              digitalRendering {
                url
              }
              frontFlat {
                url
              }
              backFlat {
                url
              }
              sideFlat {
                url
              }
              coloredFlats {
                title
                description
                image {
                  url
                }
              }
              details {
                title
                description
                image {
                  url
                }
              }
              patterns {
                url
              }
              materials {
                title
                description
                image {
                  url
                }
              }
              techPackHeader
              techPacks {
                title
                description
                image {
                  url
                }
              }
              looks {
                title
                description
                image {
                  url
                }
              }
              finalProduct {
                url
              }
            }
          }
        `,
        variables: {
          slug: slug.toLowerCase(),
        },
      }),
    });

    const json = await response.json();

    return json.data?.projects?.[0] ?? null;
  } catch (error) {
    console.log("Error fetching project: ", error);
    notFound();
  }
}

async function getAllProjects() {
  const response = await fetch(process.env.CMS_ENDPOINT as string, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + process.env.CMS_TOKEN,
    },
    body: JSON.stringify({
      query: `
        query {
          projects {
            slug
            title
          }
        }
      `,
    }),
  });
  const json = await response.json();
  return json.data?.projects ?? [];
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

  const allProjects = await getAllProjects();
  const currentIndex = allProjects.findIndex((p: any) => p.slug === slug);
  const prevProject = currentIndex > 0 ? allProjects[currentIndex - 1] : null;
  const nextProject = currentIndex < allProjects.length - 1 ? allProjects[currentIndex + 1] : null;

  return <ProjectPageClient project={project} prevProject={prevProject} nextProject={nextProject} />;
}