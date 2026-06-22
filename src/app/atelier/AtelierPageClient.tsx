"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, type Variants } from "framer-motion";
import styles from "./Atelier.module.scss";
import { ImageGridItem } from "@/components/blocks/ImageGrid";
import BlockSection from "@/components/blocks/BlockSection";
import BlockEditor from "@/components/blocks/BlockEditor";
import ProjectModal from "@/app/portfolio/[slug]/ProjectModal";
import { sanitizeBlocks, blockHasData, type Block } from "@/components/blocks/blocks";

interface AtelierPageClientProps {
  siteId: string;
  atelier: unknown;
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

export default function AtelierPageClient({ siteId, atelier, isAdmin = false }: AtelierPageClientProps) {
  const initialBlocks = useMemo(() => sanitizeBlocks(atelier), [atelier]);
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  // Admins land in edit mode; the read view below is the "preview".
  const [editing, setEditing] = useState(isAdmin);
  useEffect(() => {
    setBlocks(initialBlocks);
    setEditing(isAdmin);
  }, [initialBlocks, isAdmin]);

  const sectionBlocks = useMemo(() => blocks.filter(blockHasData), [blocks]);

  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const openModal = useCallback((_src: string, _title: string, items: ImageGridItem[], index: number) => {
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
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev]);

  useEffect(() => {
    document.body.style.overflow = modal ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [modal]);

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
        <div className={styles.pageContainer}>
          <motion.div initial="hidden" animate="visible" variants={fadeInVariant} className={styles.header}>
            <span className={styles.headerEyebrow}>Studio Process</span>
            <h1 className={styles.headerTitle}>Atelier</h1>
          </motion.div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              className={styles.editToggle}
            >
              {editing ? "Preview" : "Exit preview"}
            </button>
          )}

          {editing ? (
            <BlockEditor
              model="SiteData"
              field="atelier"
              id={siteId}
              initialBlocks={blocks}
              onBlocksChange={setBlocks}
            />
          ) : sectionBlocks.length === 0 ? (
            <p className={styles.empty}>No entries found</p>
          ) : (
            <div className={styles.entries}>
              {sectionBlocks.map((block) => (
                <BlockSection key={block.id} block={block} onOpen={openModal} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
