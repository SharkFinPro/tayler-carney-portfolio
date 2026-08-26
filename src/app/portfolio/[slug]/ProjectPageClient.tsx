"use client";
import styles from "./Project.module.scss";
import Link from "next/link";
import { CSSProperties, useEffect, useState, useMemo } from "react";
import { motion, type Variants } from "framer-motion";
import ProjectModal from "./ProjectModal";
import ProjectSidebar from "./ProjectSidebar";
import { useLightbox } from "@/components/useLightbox";
import { useResetOnChange, useSyncedState } from "@/components/useSyncedState";
import BlockSection from "@/components/blocks/BlockSection";
import BlockEditor from "@/components/blocks/BlockEditor";
import PublishBar from "@/components/blocks/PublishBar";
import EditableText from "@/components/EditableText";
import {
  sanitizeBlocks,
  projectToBlocks,
  blockHasData,
  BLOCK_LABELS,
  type Block,
  type LegacyProject,
} from "@/components/blocks/blocks";

interface Project extends LegacyProject {
  id: string;
  title: string;
  slug: string;
  description: string;
  projectPage?: unknown;
}

interface ProjectNavItem {
  slug: string;
  title: string;
}

interface ProjectPageClientProps {
  project: Project;
  prevProject: ProjectNavItem | null;
  nextProject: ProjectNavItem | null;
  isAdmin?: boolean;
}

const fadeInVariant: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

export default function ProjectPageClient({ project, prevProject, nextProject, isAdmin = false }: ProjectPageClientProps) {
  // Render from the projectPage block layout when present; otherwise derive
  // blocks from the legacy fixed fields (identical output by construction).
  const initialBlocks = useMemo(
    () => (project.projectPage != null ? sanitizeBlocks(project.projectPage) : projectToBlocks(project)),
    [project]
  );
  const [blocks, setBlocks] = useSyncedState<Block[]>(initialBlocks);
  // Admins see the rendered page first, same as visitors, and opt into the
  // block editor via the "Edit page layout" toggle. Navigating to another
  // project closes the editor rather than carrying it across.
  const [editing, setEditing] = useResetOnChange(initialBlocks, false);
  const sectionBlocks = useMemo(() => blocks.filter(blockHasData), [blocks]);
  const activeSections = useMemo(
    () => sectionBlocks.map((b) => ({ id: b.id, label: b.heading || BLOCK_LABELS[b.type] })),
    [sectionBlocks]
  );

  const lightbox = useLightbox();
  const [activeSection, setActiveSection] = useState<string>(activeSections[0]?.id ?? "");
  // Bumped after each save so the publish bar re-checks what is pending. It
  // sits on the page rather than inside the editor because the inline title
  // and description edits happen with the editor closed.
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );

    activeSections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [activeSections]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <ProjectModal
        modal={lightbox.modal}
        modalVisible={lightbox.visible}
        closeModal={lightbox.close}
        goNext={lightbox.next}
        goPrev={lightbox.prev}
      />
      <div className={styles.pageWrapper}>
        <div className={styles.pageLayout}>
          <ProjectSidebar
            projectTitle={project.title}
            activeSection={activeSection}
            scrollTo={scrollTo}
            sections={activeSections}
          />

          <div
            className={styles.pageContainer}
            style={
              {
                "--section-total": `"${String(activeSections.length).padStart(2, "0")}"`
              } as CSSProperties
            }
          >
            {isAdmin && (
              <PublishBar model="Project" entryId={project.id} refreshKey={savedAt} />
            )}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeInVariant}
              className={styles.mainHeader}
            >
              <h1>
                <EditableText model="Project" id={project.id} field="title" value={project.title} editable={isAdmin} label="Project title" onSaved={() => setSavedAt((n) => n + 1)} floatEdit>
                  {project.title}
                </EditableText>
              </h1>
              <p>
                <EditableText model="Project" id={project.id} field="description" value={project.description} editable={isAdmin} label="Project description" onSaved={() => setSavedAt((n) => n + 1)} multiline>
                  {project.description}
                </EditableText>
              </p>
              {isAdmin && (
                <button
                  type="button"
                  className={styles.editToggle}
                  onClick={() => setEditing((e) => !e)}
                >
                  {editing ? "Done editing" : "Edit page layout"}
                </button>
              )}
            </motion.div>

            {editing ? (
              <BlockEditor
                model="Project"
                field="projectPage"
                id={project.id}
                initialBlocks={blocks}
                onBlocksChange={setBlocks}
                onSaved={() => setSavedAt((n) => n + 1)}
                pageTitle={project.title}
              />
            ) : (
              sectionBlocks.map((block, i) => (
                <BlockSection key={block.id} block={block} onOpen={lightbox.open} priority={i === 0} />
              ))
            )}

            {/* Project Footer Navigation */}
            <motion.div
              className={styles.projectFooter}
              variants={fadeInVariant}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {prevProject ? (
                <Link href={`/portfolio/${prevProject.slug}`} className={styles.navButton}>
                  <span className={styles.arrow}>←</span>
                  {prevProject.title}
                </Link>
              ) : <span />}

              <Link href="/portfolio" className={styles.exploreButton}>
                All Projects
              </Link>

              {nextProject ? (
                <Link href={`/portfolio/${nextProject.slug}`} className={styles.navButton}>
                  {nextProject.title}
                  <span className={styles.arrow}>→</span>
                </Link>
              ) : <span />}
            </motion.div>
          </div>
        </div>
      </div>
    </>
  );
}
