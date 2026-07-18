"use client";
import styles from "./Project.module.scss";
import Link from "next/link";
import { CSSProperties, useEffect, useState, useCallback, useMemo } from "react";
import { motion, type Variants } from "framer-motion";
import { ImageGridItem } from "@/components/blocks/ImageGrid";
import ProjectModal from "./ProjectModal";
import ProjectSidebar from "./ProjectSidebar";
import BlockSection from "@/components/blocks/BlockSection";
import BlockEditor from "@/components/blocks/BlockEditor";
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

interface ModalState {
  items: ImageGridItem[];
  index: number;
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
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  // Admins land in edit mode by default; the read view below is the "preview".
  const [editing, setEditing] = useState(isAdmin);
  useEffect(() => {
    setBlocks(initialBlocks);
    setEditing(isAdmin);
  }, [initialBlocks, isAdmin]);
  const sectionBlocks = useMemo(() => blocks.filter(blockHasData), [blocks]);
  const activeSections = useMemo(
    () => sectionBlocks.map((b) => ({ id: b.id, label: b.heading || BLOCK_LABELS[b.type] })),
    [sectionBlocks]
  );

  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeSection, setActiveSection] = useState<string>(activeSections[0]?.id ?? "");

  const openModal = useCallback((
    _src: string,
    _title: string,
    items: ImageGridItem[],
    index: number
  ) => {
    setModal({ items, index });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setModalVisible(true));
    });
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setTimeout(() => setModal(null), 300);
  }, []);

  const goNext = useCallback(() => {
    setModal((prev) => (prev ? { ...prev, index: (prev.index + 1) % prev.items.length } : prev));
  }, []);

  const goPrev = useCallback(() => {
    setModal((prev) => (prev ? { ...prev, index: (prev.index - 1 + prev.items.length) % prev.items.length } : prev));
  }, []);

  useEffect(() => {
    // Only steer the lightbox with the arrow keys while it's actually open —
    // otherwise the global listener hijacks arrow keys during normal browsing.
    if (!modal) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight")  goNext();
      if (e.key === "ArrowLeft")   goPrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [modal, goNext, goPrev]);

  useEffect(() => {
    document.body.style.overflow = modal ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [modal]);

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
        modal={modal}
        modalVisible={modalVisible}
        closeModal={closeModal}
        goNext={goNext}
        goPrev={goPrev}
      />
      <div className={styles.pageWrapper}>
        <div className={styles.pageLayout}>
          <ProjectSidebar
            projectTitle={project.title}
            activeSection={activeSection}
            setActiveSection={setActiveSection}
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
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeInVariant}
              className={styles.mainHeader}
            >
              <h1>
                <EditableText model="Project" id={project.id} field="title" value={project.title} editable={isAdmin} floatEdit>
                  {project.title}
                </EditableText>
              </h1>
              <p>
                <EditableText model="Project" id={project.id} field="description" value={project.description} editable={isAdmin} multiline>
                  {project.description}
                </EditableText>
              </p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setEditing((e) => !e)}
                  style={{
                    marginTop: "1rem",
                    fontFamily: "var(--ff-sans)",
                    fontSize: "0.85rem",
                    padding: "0.45rem 0.9rem",
                    border: "1px solid var(--accent)",
                    borderRadius: "3px",
                    background: "var(--accent)",
                    color: "var(--ink-inverse)",
                    cursor: "pointer",
                  }}
                >
                  {editing ? "Preview" : "Exit preview"}
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
              />
            ) : (
              sectionBlocks.map((block) => (
                <BlockSection key={block.id} block={block} onOpen={openModal} />
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
