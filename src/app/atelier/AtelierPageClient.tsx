"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, type Variants } from "framer-motion";
import styles from "./Atelier.module.scss";
import BlockSection from "@/components/blocks/BlockSection";
import BlockEditor from "@/components/blocks/BlockEditor";
import PublishBar from "@/components/blocks/PublishBar";
import ProjectModal from "@/app/portfolio/[slug]/ProjectModal";
import { sanitizeBlocks, blockHasData, type Block } from "@/components/blocks/blocks";
import { useLightbox } from "@/components/useLightbox";

interface AtelierPageClientProps {
  siteId: string;
  atelier: unknown;
  isAdmin?: boolean;
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

  const lightbox = useLightbox();
  // Bumped after each save so the publish bar re-checks what is pending.
  const [savedAt, setSavedAt] = useState(0);

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
        <div className={styles.pageContainer}>
          <motion.div initial="hidden" animate="visible" variants={fadeInVariant} className={styles.header}>
            <span className={styles.headerEyebrow}>Studio Process</span>
            <h1 className={styles.headerTitle}>Atelier</h1>
          </motion.div>

          {isAdmin && siteId && (
            <PublishBar model="SiteData" entryId={siteId} refreshKey={savedAt} />
          )}

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
                onSaved={() => setSavedAt((n) => n + 1)}
            />
          ) : sectionBlocks.length === 0 ? (
            <p className={styles.empty}>No entries found</p>
          ) : (
            <div className={styles.entries}>
              {sectionBlocks.map((block, i) => (
                <BlockSection key={block.id} block={block} onOpen={lightbox.open} priority={i === 0} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
