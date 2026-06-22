"use client";

import { useState } from "react";
import styles from "./Editor.module.scss";
import projectStyles from "./Project.module.scss";
import BlockForm from "./BlockForms";
import ProjectBlockSection from "./ProjectBlockSection";
import {
  type Block,
  type BlockType,
  BLOCK_TYPES,
  SECTION_META,
  createEmptyBlock,
  blockHasData,
} from "@/components/ProjectBlocks/blocks";
import { useDragReorder } from "@/components/ProjectBlocks/useDragReorder";
import { updateBlockLayout } from "@/app/admin/contentActions";
import { CSSProperties } from "react";

interface Props {
  projectId: string;
  initialBlocks: Block[];
  onExit: (blocks: Block[]) => void;
}

export default function ProjectPageEditor({ projectId, initialBlocks, onExit }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ msg: string; error?: boolean } | null>(null);
  const [paletteType, setPaletteType] = useState<BlockType>(BLOCK_TYPES[0]);

  const reorder = (from: number, to: number) =>
    setBlocks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });

  const { announcement, listRef, dragIndex, handleProps } = useDragReorder(blocks.length, reorder);

  const updateBlock = (i: number, b: Block) => setBlocks((prev) => prev.map((x, j) => (j === i ? b : x)));
  const removeBlock = (i: number) => setBlocks((prev) => prev.filter((_, j) => j !== i));
  const addBlock = () => setBlocks((prev) => [...prev, createEmptyBlock(paletteType)]);

  async function save() {
    setSaving(true);
    setStatus(null);
    const res = await updateBlockLayout("Project", projectId, "projectPage", blocks);
    setSaving(false);
    if ("error" in res) {
      setStatus({ msg: res.error, error: true });
      return;
    }
    setBlocks(res.blocks);
    setStatus({ msg: "Saved & published." });
  }

  if (preview) {
    const sectionBlocks = blocks.filter(blockHasData);
    return (
      <div className={styles.editor}>
        <div className={styles.toolbar}>
          <span className={styles.toolbarTitle}>Preview</span>
          <button type="button" className={styles.btn} onClick={() => setPreview(false)}>Back to editing</button>
        </div>
        <div
          className={projectStyles.pageContainer}
          style={{ "--section-total": `"${String(sectionBlocks.length).padStart(2, "0")}"` } as CSSProperties}
        >
          {sectionBlocks.map((block) => (
            <ProjectBlockSection key={block.id} block={block} onOpen={() => {}} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarTitle}>Editing page layout</span>
        {status && (
          <span className={`${styles.status} ${status.error ? styles.statusError : ""}`} role="status">
            {status.msg}
          </span>
        )}
        <button type="button" className={styles.btn} onClick={() => setPreview(true)}>Preview</button>
        <button type="button" className={styles.btn} onClick={() => onExit(blocks)}>Done</button>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save & publish"}
        </button>
      </div>

      <div className="srOnly" role="status" aria-live="polite">{announcement}</div>

      <div ref={listRef}>
        {blocks.map((block, i) => (
          <div
            key={block.id}
            data-block-item
            className={`${styles.card} ${dragIndex === i ? styles.dragging : ""}`}
          >
            <div className={styles.cardHead}>
              <span className={styles.handle} {...handleProps(i, block.heading || block.type)}>⠿</span>
              <span className={styles.type}>{SECTION_META[block.type].label}</span>
              <button type="button" className={styles.iconBtn} onClick={() => reorder(i, i - 1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button type="button" className={styles.iconBtn} onClick={() => reorder(i, i + 1)} disabled={i === blocks.length - 1} aria-label="Move down">↓</button>
              <button type="button" className={styles.iconBtn} onClick={() => removeBlock(i)} aria-label="Delete block">Delete</button>
            </div>
            <div className={styles.cardBody}>
              <BlockForm block={block} onChange={(b) => updateBlock(i, b)} />
            </div>
          </div>
        ))}
      </div>

      <div className={styles.addRow}>
        <select className={styles.select} value={paletteType} onChange={(e) => setPaletteType(e.target.value as BlockType)} aria-label="Block type to add">
          {BLOCK_TYPES.map((t) => (
            <option key={t} value={t}>{SECTION_META[t].label}</option>
          ))}
        </select>
        <button type="button" className={styles.btn} onClick={addBlock}>+ Add block</button>
      </div>
    </div>
  );
}
