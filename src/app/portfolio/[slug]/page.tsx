import { notFound } from "next/navigation";
import ProjectPageClient from "./ProjectPageClient";

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
              frontFlat {
                url
              }
              backFlat {
                url
              }
              sideFlat {
                url
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

    return json.data.projects[0];
  } catch (error) {
    console.log("Error fetching project: ", error);
    notFound();
  }
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;

  const project = await getProject(slug);

  if (!project) {
    notFound();
  }

  return <ProjectPageClient project={project} />;
}