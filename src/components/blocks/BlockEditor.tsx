"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import styles from "./BlockEditor.module.scss";
import BlockForm from "./BlockForms";
import BlockSection from "./BlockSection";
import {
  type Block,
  type BlockType,
  BLOCK_TYPES,
  BLOCK_LABELS,
  BLOCK_DESCRIPTIONS,
  createEmptyBlock,
  duplicateBlock,
  blockHasData,
  blockSummary,
} from "./blocks";
import { useDragReorder } from "./useDragReorder";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";
import ConfirmDialog from "@/components/ConfirmDialog";
import { updateBlockLayout } from "@/app/admin/contentActions";

interface Props {
  /** Hygraph model + JSON field that stores this block layout (e.g. "Project" / "projectPage"). */
  model: string;
  field: string;
  id: string;
  initialBlocks: Block[];
  onBlocksChange: (blocks: Block[]) => void;
}

const noop = () => {};

// Admin authoring surface for a page's block layout. Generic across page types:
// the host page supplies the model/field/id that locates the JSON layout in
// Hygraph. Blocks are shown as compact rows (uniform-ish height → smooth
// reordering); editing a row expands its form inline. Structural changes and
// commits persist through updateBlockLayout, which returns the sanitized list we
// adopt; onBlocksChange keeps the host's layout (sidebar, preview) in sync.
export default function BlockEditor({ model, field, id, initialBlocks, onBlocksChange }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Block | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // An open block form means a draft that hasn't been committed yet.
  useUnsavedChanges(draft !== null);

  const blocksRef = useRef(blocks);
  useEffect(() => {
    blocksRef.current = blocks;
    onBlocksChange(blocks);
  }, [blocks, onBlocksChange]);

  async function persist(next: Block[]): Promise<{ ok: true } | { ok: false; error: string }> {
    // Snapshot before the optimistic update. Previously a failed save left the
    // new arrangement on screen while Hygraph still held the old one, so an
    // admin who missed the small status message believed their work was saved
    // — and reloading silently discarded it.
    const previous = blocksRef.current;

    setBlocks(next);
    setSaving(true);
    setError("");
    setStatus("");
    const result = await updateBlockLayout(model, id, field, next);
    setSaving(false);
    if ("error" in result) {
      // Roll back so what is on screen always matches what persisted.
      setBlocks(previous);
      setError(result.error);
      return { ok: false, error: result.error };
    }
    setBlocks(result.blocks);
    setStatus("Saved");
    return { ok: true };
  }

  const drag = useDragReorder<Block>({
    items: blocks,
    setItems: setBlocks,
    getKey: (b) => b.id,
    onCommit: (orderedKeys) => {
      const byId = new Map(blocksRef.current.map((b) => [b.id, b]));
      const ordered = orderedKeys.map((k) => byId.get(k)).filter(Boolean) as Block[];
      void persist(ordered);
    },
  });

  function collapseEdit() {
    setEditingId(null);
    setDraft(null);
    setIsNew(false);
  }

  function addBlock(type: BlockType) {
    setPaletteOpen(false);
    const block = createEmptyBlock(type);
    setBlocks((prev) => [...prev, block]);
    setEditingId(block.id);
    setDraft(structuredClone(block));
    setIsNew(true);
    setError("");
    setStatus("");
  }

  function startEdit(block: Block) {
    setEditingId(block.id);
    setDraft(structuredClone(block));
    setIsNew(false);
    setError("");
    setStatus("");
  }

  function cancelEdit() {
    if (isNew && editingId) {
      setBlocks((prev) => prev.filter((b) => b.id !== editingId));
    }
    collapseEdit();
  }

  async function commitEdit() {
    if (!draft) return;
    if (!blockHasData(draft)) {
      setError("Add some content before saving this block.");
      return;
    }
    const next = blocksRef.current.map((b) => (b.id === draft.id ? draft : b));
    const result = await persist(next);
    if (!("error" in result)) collapseEdit();
  }

  // Inserted directly after its source rather than appended, so the copy shows
  // up where the admin is looking instead of at the bottom of a long page.
  async function duplicate(block: Block) {
    collapseEdit();
    const current = blocksRef.current;
    const index = current.findIndex((b) => b.id === block.id);
    if (index === -1) return;

    const copy = duplicateBlock(block);
    const next = [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
    await persist(next);
  }

  async function deleteBlock(blockId: string): Promise<string | null> {
    if (editingId === blockId) cancelEdit();
    const result = await persist(blocksRef.current.filter((b) => b.id !== blockId));
    return "error" in result ? result.error : null;
  }

  return (
    <div className={styles.editorRoot}>
      <div className={styles.statusBar}>
        {error ? (
          <span className={styles.statusError} role="alert">{error}</span>
        ) : (
          <span className={styles.statusText} role="status" aria-live="polite">{saving ? "Saving…" : status}</span>
        )}
      </div>

      {/* Live region for keyboard reordering announcements. */}
      <div className="srOnly" role="status" aria-live="polite">{drag.announcement}</div>

      {blocks.length === 0 && (
        <p className={styles.empty}>This page has no content blocks yet. Add your first block to get started.</p>
      )}

      <ul className={styles.blockList}>
        {blocks.map((block, index) => {
            const editing = editingId === block.id;

            // The dragged block is lifted into the floating clone; here it leaves a
            // small dashed placeholder so the other previews barely move as the
            // order changes.
            if (drag.draggingKey === block.id) {
              return <li key={block.id} className={styles.placeholder} aria-hidden="true" />;
            }

            return (
              <motion.li
                key={block.id}
                ref={drag.registerCard(block.id)}
                initial={isNew && editing ? { opacity: 0, y: 8 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ opacity: { duration: 0.2 }, y: { duration: 0.2 } }}
                className={`${styles.blockItem} ${editing ? styles.blockItemEditing : ""}`}
              >
                <div className={styles.blockBar}>
                  <button
                    type="button"
                    className={styles.dragHandle}
                    aria-label={`Reorder ${BLOCK_LABELS[block.type]} block. Press arrow keys to move, or drag.`}
                    onPointerDown={(e) => {
                      collapseEdit();
                      drag.startDrag(index, block.id, e);
                    }}
                    onKeyDown={drag.keyboardReorder(block.id)}
                  >
                    ⠿
                  </button>
                  <span className={styles.blockTag}>{BLOCK_LABELS[block.type]}</span>
                  <span className={styles.blockSummary}>{blockSummary(block)}</span>
                  <div className={styles.blockBarActions}>
                    {!editing && (
                      <>
                        <button type="button" className={styles.iconBtn} aria-label={`Edit ${BLOCK_LABELS[block.type]} block`} onClick={() => startEdit(block)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          aria-label={`Duplicate ${BLOCK_LABELS[block.type]} block`}
                          onClick={() => duplicate(block)}
                          disabled={saving}
                        >
                          Duplicate
                        </button>
                      </>
                    )}
                    <button type="button" className={styles.iconBtn} aria-label={`Delete ${BLOCK_LABELS[block.type]} block`} onClick={() => setPendingDeleteId(block.id)}>
                      Delete
                    </button>
                  </div>
                </div>

                {editing ? (
                  <div className={styles.editPanel}>
                    <BlockForm block={draft as Block} onChange={setDraft} />
                    <div className={styles.editActions}>
                      <button type="button" className={styles.cancelBtn} onClick={cancelEdit} disabled={saving}>
                        Cancel
                      </button>
                      <button type="button" className={styles.saveBtn} onClick={commitEdit} disabled={saving || !blockHasData(draft as Block)}>
                        {saving ? "Saving…" : "Save block"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.blockPreview}>
                    {blockHasData(block) ? (
                      <BlockSection block={block} onOpen={noop} />
                    ) : (
                      <p className={styles.empty}>Empty block — click Edit to add content.</p>
                    )}
                  </div>
                )}
              </motion.li>
            );
          })}
      </ul>

      {drag.draggingKey && (() => {
        const dragged = blocks.find((b) => b.id === drag.draggingKey);
        if (!dragged) return null;
        return (
          <div className={styles.floatingLayer} style={drag.floatingStyle}>
            <div className={`${styles.blockItem} ${styles.floating}`}>
              <div className={styles.blockBar}>
                <span className={styles.dragHandle} aria-hidden="true">⠿</span>
                <span className={styles.blockTag}>{BLOCK_LABELS[dragged.type]}</span>
                <span className={styles.blockSummary}>{blockSummary(dragged)}</span>
              </div>
            </div>
          </div>
        );
      })()}

      <div className={styles.addZone}>
        <AnimatePresence mode="wait" initial={false}>
          {paletteOpen ? (
            <motion.div
              key="palette"
              className={styles.palette}
              role="menu"
              aria-label="Add a content block"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
            >
              <div className={styles.paletteHead}>
                <span>Add a block</span>
                <button type="button" className={styles.iconBtn} aria-label="Close block menu" onClick={() => setPaletteOpen(false)}>
                  ✕
                </button>
              </div>
              <ul className={styles.paletteList}>
                {BLOCK_TYPES.map((type) => (
                  <li key={type}>
                    <button type="button" className={styles.paletteItem} onClick={() => addBlock(type)} role="menuitem">
                      <span className={styles.paletteItemName}>{BLOCK_LABELS[type]}</span>
                      <span className={styles.paletteItemDesc}>{BLOCK_DESCRIPTIONS[type]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          ) : (
            <button type="button" className={styles.addBlockBtn} onClick={() => setPaletteOpen(true)}>
              + Add block
            </button>
          )}
        </AnimatePresence>
      </div>

      {pendingDeleteId && (
        <ConfirmDialog
          title="Delete this block?"
          message="This permanently removes the block from the CMS. This can't be undone."
          onConfirm={() => deleteBlock(pendingDeleteId)}
          onClose={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
