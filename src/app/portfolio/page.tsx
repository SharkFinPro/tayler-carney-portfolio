import { Metadata } from "next";
import Link from "next/link";
import styles from "./Portfolio.module.scss";

export const metadata: Metadata = {
  title: "Portfolio"
};

export const dynamic = "force-dynamic";

const PROJECTS_QUERY  = `
  query Projects {
    projects {
      title
      slug
      description
    }
  }
`;

async function getProjects() {
  const response = await fetch(process.env.CMS_ENDPOINT as string, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + process.env.CMS_TOKEN,
    },
    body: JSON.stringify({
      query: PROJECTS_QUERY
    })
  });
  const json = await response.json();

  return json.data.projects;
}

export default async function Portfolio() {
  const projects = await getProjects();

  return (
    <div className={styles.wrapper}>
      <main className={styles.container}>
        <h1>Portfolio</h1>

        <div className={styles.projects}>
          {projects.map((project) => (
            <Link
              key={project.slug}
              href={`/portfolio/${project.slug}`}
              className={styles.project}
            >
              <h2>{project.title}</h2>
              <p>{project.description}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}