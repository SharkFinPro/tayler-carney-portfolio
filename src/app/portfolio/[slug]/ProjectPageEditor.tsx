"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Editor.module.scss";
import BlockForm from "./BlockForms";
import ProjectBlockSection from "./ProjectBlockSection";
import {
  type Block,
  type BlockType,
  BLOCK_TYPES,
  BLOCK_DESCRIPTIONS,
  SECTION_META,
  createEmptyBlock,
  blockHasData,
} from "@/components/ProjectBlocks/blocks";
import { useDragReorder } from "@/components/ProjectBlocks/useDragReorder";
import { updateBlockLayout } from "@/app/admin/contentActions";

interface Props {
  projectId: string;
  initialBlocks: Block[];
  onExit: (blocks: Block[]) => void;
}

const noop = () => {};

// Short, fixed-content summary for a collapsed block row.
function blockSummary(b: Block): string {
  switch (b.type) {
    case "sketches":
    case "patterns":
    case "finalProduct":
      return `${b.images.length} image${b.images.length === 1 ? "" : "s"}`;
    case "digitalRendering":
      return b.image ? "1 image" : "empty";
    case "flats": {
      const n = (b.front ? 1 : 0) + (b.back ? 1 : 0) + (b.side ? 1 : 0);
      const c = b.coloredFlats.length;
      return `${n} flat${n === 1 ? "" : "s"}${c ? ` · ${c} colored` : ""}`;
    }
    case "looks":
    case "details":
    case "materials":
      return `${b.items.length} item${b.items.length === 1 ? "" : "s"}`;
    case "techPack":
      return `${b.sheets.length} sheet${b.sheets.length === 1 ? "" : "s"}`;
  }
}

// Admin authoring surface for a project's block layout. Blocks are shown as
// compact rows (uniform height → smooth reordering); editing a row expands its
// form inline. Structural changes and commits persist through updateBlockLayout,
// which returns the sanitized list we adopt. The full-page preview is the read
// view (header + sidebar) reached via the Preview button.
export default function ProjectPageEditor({ projectId, initialBlocks, onExit }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Block | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const blocksRef = useRef(blocks);
  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);

  async function persist(next: Block[]): Promise<{ ok: true } | { ok: false; error: string }> {
    setBlocks(next);
    setSaving(true);
    setError("");
    setStatus("");
    const result = await updateBlockLayout("Project", projectId, "projectPage", next);
    setSaving(false);
    if ("error" in result) {
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
      setError("Add at least one image before saving this block.");
      return;
    }
    const next = blocksRef.current.map((b) => (b.id === draft.id ? draft : b));
    const result = await persist(next);
    if (!("error" in result)) collapseEdit();
  }

  async function deleteBlock(id: string) {
    if (!window.confirm("Delete this block? This can't be undone.")) return;
    if (editingId === id) cancelEdit();
    await persist(blocksRef.current.filter((b) => b.id !== id));
  }

  return (
    <div className={styles.editorRoot}>
      <div className={styles.statusBar}>
        {error ? (
          <span className={styles.statusError} role="alert">{error}</span>
        ) : (
          <span className={styles.statusText} role="status" aria-live="polite">{saving ? "Saving…" : status}</span>
        )}
        <button type="button" className={styles.doneBtn} onClick={() => onExit(blocksRef.current)}>
          Preview
        </button>
      </div>

      {/* Live region for keyboard reordering announcements. */}
      <div className="srOnly" role="status" aria-live="polite">{drag.announcement}</div>

      {blocks.length === 0 && (
        <p className={styles.empty}>This project has no content blocks yet. Add your first block to get started.</p>
      )}

      <ul className={styles.blockList}>
        {blocks.map((block, index) => {
          const editing = editingId === block.id;

          // The dragged block is lifted into the floating clone; here it leaves a
          // small dashed placeholder so the other (full-height) previews barely
          // move as the order changes.
          if (drag.draggingKey === block.id) {
            return <li key={block.id} className={styles.placeholder} aria-hidden="true" />;
          }

          return (
            <li key={block.id} ref={drag.registerCard(block.id)} className={styles.blockItem}>
              <div className={styles.blockBar}>
                <button
                  type="button"
                  className={styles.dragHandle}
                  aria-label={`Reorder ${SECTION_META[block.type].label} block. Press arrow keys to move, or drag.`}
                  onPointerDown={(e) => {
                    collapseEdit();
                    drag.startDrag(index, block.id, e);
                  }}
                  onKeyDown={drag.keyboardReorder(block.id)}
                >
                  ⠿
                </button>
                <span className={styles.blockTag}>{SECTION_META[block.type].label}</span>
                <span className={styles.blockSummary}>{blockSummary(block)}</span>
                <div className={styles.blockBarActions}>
                  {!editing && (
                    <button type="button" className={styles.iconBtn} aria-label={`Edit ${SECTION_META[block.type].label} block`} onClick={() => startEdit(block)}>
                      Edit
                    </button>
                  )}
                  <button type="button" className={styles.iconBtn} aria-label={`Delete ${SECTION_META[block.type].label} block`} onClick={() => deleteBlock(block.id)}>
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
                    <ProjectBlockSection block={block} onOpen={noop} />
                  ) : (
                    <p className={styles.empty}>Empty block — click Edit to add content.</p>
                  )}
                </div>
              )}
            </li>
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
                <span className={styles.blockTag}>{SECTION_META[dragged.type].label}</span>
                <span className={styles.blockSummary}>{blockSummary(dragged)}</span>
              </div>
            </div>
          </div>
        );
      })()}

      <div className={styles.addZone}>
        {paletteOpen ? (
          <div className={styles.palette} role="menu" aria-label="Add a content block">
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
                    <span className={styles.paletteItemName}>{SECTION_META[type].label}</span>
                    <span className={styles.paletteItemDesc}>{BLOCK_DESCRIPTIONS[type]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <button type="button" className={styles.addBlockBtn} onClick={() => setPaletteOpen(true)}>
            + Add block
          </button>
        )}
      </div>
    </div>
  );
}
