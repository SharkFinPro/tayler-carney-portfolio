"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./About.module.scss";
import BlockSection from "@/components/blocks/BlockSection";
import BlockEditor from "@/components/blocks/BlockEditor";
import ProjectModal from "@/app/portfolio/[slug]/ProjectModal";
import { sanitizeBlocks, blockHasData, type Block } from "@/components/blocks/blocks";
import { useLightbox } from "@/components/useLightbox";

interface AboutPageClientProps {
  siteId: string;
  about: unknown;
  isAdmin?: boolean;
}

export default function AboutPageClient({ siteId, about, isAdmin = false }: AboutPageClientProps) {
  const initialBlocks = useMemo(() => sanitizeBlocks(about), [about]);
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  // Admins land in edit mode; the read view below is the "preview".
  const [editing, setEditing] = useState(isAdmin);
  useEffect(() => {
    setBlocks(initialBlocks);
    setEditing(isAdmin);
  }, [initialBlocks, isAdmin]);

  const sectionBlocks = useMemo(() => blocks.filter(blockHasData), [blocks]);

  const lightbox = useLightbox();

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
          {isAdmin && (
            <button type="button" onClick={() => setEditing((e) => !e)} className={styles.editToggle}>
              {editing ? "Preview" : "Exit preview"}
            </button>
          )}

          {editing ? (
            <BlockEditor
              model="SiteData"
              field="about"
              id={siteId}
              initialBlocks={blocks}
              onBlocksChange={setBlocks}
            />
          ) : sectionBlocks.length === 0 ? (
            <p className={styles.empty}>No content yet</p>
          ) : (
            <div className={styles.blocks}>
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
