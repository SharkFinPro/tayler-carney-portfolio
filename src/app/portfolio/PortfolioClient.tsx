"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGripVertical,
  faPlus,
  faBoxArchive,
  faRotateLeft,
  faChevronRight,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import styles from "./Portfolio.module.scss";
import { useDragReorder } from "@/components/blocks/useDragReorder";
import ConfirmDialog from "@/components/ConfirmDialog";
import CreateProjectModal from "./CreateProjectModal";
import { deleteProject, updatePortfolio } from "@/app/admin/portfolioActions";
import type { OrderedProject, PortfolioConfig } from "@/lib/portfolio";

export type ProjectRow = OrderedProject<{
  id: string;
  title: string;
  slug: string;
  description: string;
}>;

interface PortfolioClientProps {
  siteId: string;
  projects: ProjectRow[];
  isAdmin?: boolean;
}

const toConfig = (rows: ProjectRow[]): PortfolioConfig => ({
  entries: rows.map((r) => ({ id: r.id, archived: r.archived })),
});

export default function PortfolioClient({ siteId, projects: initial, isAdmin = false }: PortfolioClientProps) {
  const router = useRouter();

  const [projects, setProjects] = useState<ProjectRow[]>(initial);
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  useEffect(() => {
    setProjects(initial);
  }, [initial]);

  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectRow | null>(null);

  // Active and archived are two views of the one ordered list. Reordering and
  // archiving only ever rearrange this single source of truth, so the persisted
  // config stays consistent.
  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  // Persist the whole config: optimistic, with a rollback-via-refresh on
  // failure (matching the site's no-revalidate write semantics). Returns an
  // error string on failure, or null on success.
  async function persist(rows: ProjectRow[]): Promise<string | null> {
    setProjects(rows);
    const res = await updatePortfolio(siteId, toConfig(rows));
    if ("error" in res) {
      router.refresh();
      return res.error;
    }
    return null;
  }

  // Drag-reorder only the active list; archived projects keep their order and
  // are re-appended after the active ones on every commit.
  const drag = useDragReorder<ProjectRow>({
    items: active,
    setItems: (nextActive) =>
      setProjects([...nextActive, ...projectsRef.current.filter((p) => p.archived)]),
    getKey: (p) => p.id,
    onCommit: (orderedKeys) => {
      const byId = new Map(projectsRef.current.map((p) => [p.id, p]));
      const orderedActive = orderedKeys
        .map((k) => byId.get(k))
        .filter((p): p is ProjectRow => Boolean(p));
      void persist([...orderedActive, ...projectsRef.current.filter((p) => p.archived)]);
    },
  });

  function toggleArchived(id: string) {
    const next = projectsRef.current.map((p) =>
      p.id === id ? { ...p, archived: !p.archived } : p
    );
    void persist(next);
  }

  // Permanently delete an archived project: remove it server-side, then drop it
  // from local state and persist the config so its stale entry is cleared too.
  // Returns an error string on failure so the confirm dialog can surface it.
  async function removeProject(id: string): Promise<string | null> {
    const res = await deleteProject(id);
    if ("error" in res) return res.error;
    const err = await persist(projectsRef.current.filter((p) => p.id !== id));
    return err;
  }

  // Append the just-created project and persist the order. We don't re-fetch:
  // the content read endpoint lags a fresh publish, so a refresh would briefly
  // drop the new project back out of the list.
  function addProject(project: ProjectRow) {
    setCreating(false);
    void persist([...projectsRef.current, project]);
  }

  function renderPublicRow(project: ProjectRow) {
    return (
      <Link
        key={project.id}
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
    );
  }

  // Active admin row: draggable, with an Archive action.
  function renderActiveRow(project: ProjectRow, index: number, floating = false) {
    return (
      <div
        key={project.id}
        ref={floating ? undefined : drag.registerCard(project.id)}
        className={`${styles.project} ${styles.projectAdmin} ${floating ? styles.projectFloating : ""}`}
      >
        <button
          type="button"
          className={styles.dragBtn}
          aria-label="Reorder project. Press arrow keys to move, or drag."
          onPointerDown={(e) => drag.startDrag(index, project.id, e)}
          onKeyDown={drag.keyboardReorder(project.id)}
        >
          <FontAwesomeIcon icon={faGripVertical} />
        </button>

        <div className={styles.projectBody}>
          <Link href={`/portfolio/${project.slug}`} className={styles.projectTitleLink}>
            <h2 className={styles.projectTitle}>{project.title || "Untitled project"}</h2>
          </Link>
          <p className={styles.projectDesc}>{project.description}</p>
        </div>

        <div className={styles.projectControls}>
          <button
            type="button"
            className={styles.archiveBtn}
            aria-label={`Archive ${project.title}`}
            onClick={() => toggleArchived(project.id)}
          >
            <FontAwesomeIcon icon={faBoxArchive} />
            <span>Archive</span>
          </button>
        </div>
      </div>
    );
  }

  // Archived admin row: no drag handle (order is irrelevant while archived),
  // with a Restore action.
  function renderArchivedRow(project: ProjectRow) {
    return (
      <div key={project.id} className={`${styles.project} ${styles.projectArchivedRow}`}>
        <div className={styles.projectBody}>
          <Link href={`/portfolio/${project.slug}`} className={styles.projectTitleLink}>
            <h2 className={styles.projectTitle}>{project.title || "Untitled project"}</h2>
          </Link>
          <p className={styles.projectDesc}>{project.description}</p>
        </div>

        <div className={styles.projectControls}>
          <button
            type="button"
            className={styles.archiveBtn}
            aria-label={`Restore ${project.title}`}
            onClick={() => toggleArchived(project.id)}
          >
            <FontAwesomeIcon icon={faRotateLeft} />
            <span>Restore</span>
          </button>
          <button
            type="button"
            className={`${styles.archiveBtn} ${styles.deleteBtn}`}
            aria-label={`Delete ${project.title}`}
            onClick={() => setProjectToDelete(project)}
          >
            <FontAwesomeIcon icon={faTrash} />
            <span>Delete</span>
          </button>
        </div>
      </div>
    );
  }

  const draggingRow = drag.draggingKey ? active.find((p) => p.id === drag.draggingKey) : null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>

        <div className={styles.header}>
          <span className={styles.headerEyebrow}>Design Archive</span>
          <h1 className={styles.headerTitle}>Portfolio</h1>
        </div>

        {!isAdmin ? (
          active.length === 0 ? (
            <p className={styles.empty}>No projects found</p>
          ) : (
            <div className={styles.projects}>
              {active.map((project) => renderPublicRow(project))}
            </div>
          )
        ) : (
          <>
            {active.length === 0 ? (
              <p className={styles.empty}>No active projects</p>
            ) : (
              <div className={styles.projects}>
                {active.map((project, index) =>
                  project.id === drag.draggingKey ? (
                    <div key={project.id} className={`${styles.project} ${styles.projectPlaceholder}`} />
                  ) : (
                    renderActiveRow(project, index)
                  )
                )}
              </div>
            )}

            <div className="srOnly" role="status" aria-live="polite">
              {drag.announcement}
            </div>

            <button
              type="button"
              className={styles.addProjectTile}
              onClick={() => setCreating(true)}
            >
              <FontAwesomeIcon icon={faPlus} />
              <span>New project</span>
            </button>

            {archived.length > 0 && (
              <section className={styles.archivedSection}>
                <button
                  type="button"
                  className={styles.archivedToggle}
                  aria-expanded={showArchived}
                  onClick={() => setShowArchived((v) => !v)}
                >
                  <FontAwesomeIcon
                    icon={faChevronRight}
                    className={`${styles.archivedChevron} ${showArchived ? styles.archivedChevronOpen : ""}`}
                  />
                  <span>Archived</span>
                  <span className={styles.archivedCount}>{archived.length}</span>
                </button>

                {showArchived && (
                  <div className={styles.projects}>
                    {archived.map((project) => renderArchivedRow(project))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {isAdmin && draggingRow && (
        <div className={styles.projectFloatingLayer} style={drag.floatingStyle}>
          {renderActiveRow(draggingRow, active.findIndex((p) => p.id === draggingRow.id), true)}
        </div>
      )}

      {creating && (
        <CreateProjectModal
          onClose={() => setCreating(false)}
          onCreated={addProject}
        />
      )}

      {projectToDelete && (
        <ConfirmDialog
          title={`Delete "${projectToDelete.title || "Untitled project"}"?`}
          message="This permanently removes the project from the CMS. This can't be undone."
          onConfirm={() => removeProject(projectToDelete.id)}
          onClose={() => setProjectToDelete(null)}
        />
      )}
    </div>
  );
}
