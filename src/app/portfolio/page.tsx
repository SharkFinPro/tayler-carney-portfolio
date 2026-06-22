import { Metadata } from "next";
import Link from "next/link";
import styles from "./Portfolio.module.scss";
import { cmsQuery } from "@/lib/cms";

export const metadata: Metadata = {
  title: "Portfolio"
};

export const dynamic = "force-dynamic";

const PROJECTS_QUERY = `
  query Projects {
    projects {
      title
      slug
      description
    }
  }
`;

async function getProjects() {
  const data = await cmsQuery(PROJECTS_QUERY);
  return data?.projects ?? [];
}

export default async function Portfolio() {
  const projects = await getProjects();

  return (
    <div className={styles.wrapper}>
      <main className={styles.container}>

        <div className={styles.header}>
          <span className={styles.headerEyebrow}>Design Archive</span>
          <h1 className={styles.headerTitle}>Portfolio</h1>
        </div>

        {projects.length === 0 ? (
          <p className={styles.empty}>No projects found</p>
        ) : (
          <div className={styles.projects}>
            {projects.map((project) => (
              <Link
                key={project.slug}
                href={`/portfolio/${project.slug}`}
                className={styles.project}
              >
                <span className={styles.projectIndex} aria-hidden="true" />
                <div className={styles.projectBody}>
                  <h2 className={styles.projectTitle}>{project.title}</h2>
                  <p className={styles.projectDesc}>{project.description}</p>
                </div>
                <span className={styles.projectArrow} aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
        )}

      </main>
    </div>
  );
}