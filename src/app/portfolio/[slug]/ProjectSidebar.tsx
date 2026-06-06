"use client";
import Link from "next/link";
import styles from "./Project.module.scss";

interface ProjectSidebarProps {
  projectTitle: string;
  activeSection: string;
  setActiveSection: (id: string) => void;
  scrollTo: (id: string) => void;
  sections: { id: string; label: string }[];
}

export default function ProjectSidebar({ projectTitle, activeSection, setActiveSection, scrollTo, sections }: ProjectSidebarProps) {
  return (
    <aside className={styles.sidebarNav}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link href="/portfolio">Portfolio</Link>
        <span aria-hidden="true">{"→"}</span>
        <span className={styles.breadcrumbCurrent}>{projectTitle}</span>
      </nav>

      <div className={styles.sidebarSections}>
        {sections.map(({ id, label }) => (
          <button
            key={id}
            className={`${styles.sidebarItem} ${activeSection === id ? styles.sidebarItemActive : ""}`}
            onClick={() => scrollTo(id)}
          >
            <span className={styles.sidebarDot} />
            <span className={styles.sidebarLabel}>{label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
