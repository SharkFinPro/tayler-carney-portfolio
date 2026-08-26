"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./BlockEditor.module.scss";
import AssetPicker from "@/components/AssetPicker";
import RichTextEditor from "./richText/RichTextEditor";
import {
  BLOCK_LABELS,
  CHILD_BLOCK_TYPES,
  COLUMN_CHILD_TYPES,
  blockSummary,
  createEmptyBlock,
  type Block,
  type BlockType,
  type ImageItem,
  type ImageRef,
  type ComparisonView,
  type SpecRow,
  type SwatchItem,
  type TimelineStage,
  type CalloutVariant,
  type CredentialEntry,
} from "./blocks";

// ── Small field primitives ────────────────────────────────────────────────

// Move the item at `from` to `to`, returning a new array (or the same one if the
// target is out of bounds). Shared by every reorderable list below.
function move<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  // Splicing at an out-of-range `from` removes nothing; reinserting the
  // resulting undefined would put a hole in the list, so leave it alone.
  if (item === undefined) return arr;
  next.splice(to, 0, item);
  return next;
}

/**
 * Build the `update(index, patch)` callback the row lists below share: a null
 * patch removes that row, any other patch merges into it. Six lists carried
 * byte-identical copies of this before.
 *
 * A patch aimed at a row that is no longer there is dropped rather than
 * creating a hole -- the index comes from a render that can be one commit
 * behind the array.
 */
function rowUpdater<T extends object>(value: T[], onChange: (v: T[]) => void) {
  return (i: number, patch: Partial<T> | null) => {
    const next = [...value];
    if (patch === null) {
      next.splice(i, 1);
    } else {
      const row = next[i];
      if (!row) return;
      next[i] = { ...row, ...patch };
    }
    onChange(next);
  };
}

// Pointer-based "card in hand" reordering for an index-keyed list, mirroring the
// top-level block reordering: the grabbed row is lifted out of the list (leaving
// no gap) into a floating collapsed bar that follows the cursor, while a dashed
// box marks where it will land. The list only commits the new order on drop — so
// React keys stay stable through the drag and these id-less lists can keep using
// plain array indices as keys. Pairs with the up/down ReorderControls for
// keyboard accessibility.
function useRowDrag(onReorder: (from: number, to: number) => void) {
  // `dragIndex` is the row being dragged; `insertBefore` is the gap (0..length)
  // where it would drop. Both drive only the visuals — the commit happens once
  // on pointer-up.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [insertBefore, setInsertBefore] = useState<number | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const rowRefs = useRef<Map<number, HTMLElement>>(new Map());
  const layerRef = useRef<HTMLDivElement | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const insertBeforeRef = useRef<number | null>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const pointerRef = useRef({ x: 0, y: 0 });
  const autoScrollRef = useRef<number | null>(null);

  const registerRow = (index: number) => (el: HTMLElement | null) => {
    if (el) rowRefs.current.set(index, el);
    else rowRefs.current.delete(index);
  };

  // Recompute the drop gap from the midpoints of every row: the first row whose
  // midpoint sits below the pointer is what we'd insert before (or the end of
  // the list if the pointer is past them all).
  function updateInsert(y: number) {
    const dragging = dragIndexRef.current;
    if (dragging === null) return;
    // The lifted row is hidden (zero-height), so skip it and measure against the
    // rows still occupying space.
    const entries = [...rowRefs.current.entries()].filter(([i]) => i !== dragging).sort((a, b) => a[0] - b[0]);
    let before = rowRefs.current.size;
    for (const [index, el] of entries) {
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        before = index;
        break;
      }
    }
    if (before !== insertBeforeRef.current) {
      insertBeforeRef.current = before;
      setInsertBefore(before);
    }
  }

  function moveLayer() {
    const layer = layerRef.current;
    if (!layer) return;
    layer.style.left = `${pointerRef.current.x - offsetRef.current.x}px`;
    layer.style.top = `${pointerRef.current.y - offsetRef.current.y}px`;
  }

  function handlePointerMove(e: PointerEvent) {
    if (dragIndexRef.current === null) return;
    pointerRef.current = { x: e.clientX, y: e.clientY };
    moveLayer();
    updateInsert(e.clientY);
  }

  function startAutoScroll() {
    const EDGE = 90;
    const MAX_SPEED = 18;
    function step() {
      const { y } = pointerRef.current;
      const h = window.innerHeight;
      let dy = 0;
      if (y < EDGE) dy = -MAX_SPEED * ((EDGE - y) / EDGE);
      else if (y > h - EDGE) dy = MAX_SPEED * ((y - (h - EDGE)) / EDGE);
      if (dy !== 0) {
        window.scrollBy(0, dy);
        updateInsert(y);
      }
      autoScrollRef.current = requestAnimationFrame(step);
    }
    autoScrollRef.current = requestAnimationFrame(step);
  }

  function endDrag() {
    if (autoScrollRef.current !== null) {
      cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
    const from = dragIndexRef.current;
    const before = insertBeforeRef.current;
    dragIndexRef.current = null;
    insertBeforeRef.current = null;
    setDragIndex(null);
    setInsertBefore(null);
    document.body.style.userSelect = "";
    if (from === null || before === null) return;
    // A gap on either side of the dragged row is a no-op; otherwise the target
    // index shifts down by one when the row is lifted out from above it.
    if (before === from || before === from + 1) return;
    onReorder(from, before > from ? before - 1 : before);
  }

  useEffect(() => {
    if (dragIndex === null) return;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragIndex]);

  function startDrag(index: number, e: React.PointerEvent) {
    if (e.button !== 0) return;
    const el = rowRefs.current.get(index);
    if (!el) return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    // Keep the bar aligned with the row horizontally (cursor stays over the grab
    // point), but ride near the top of the collapsed bar vertically.
    offsetRef.current = { x: e.clientX - rect.left, y: 16 };
    pointerRef.current = { x: e.clientX, y: e.clientY };
    setSize({ w: rect.width, h: rect.height });
    dragIndexRef.current = index;
    insertBeforeRef.current = null;
    setDragIndex(index);
    setInsertBefore(null);
    document.body.style.userSelect = "none";
    moveLayer();
    startAutoScroll();
  }

  // Show the drop box at whichever gap the pointer is over — including the
  // dragged row's original spot, so there's always feedback (the commit itself
  // no-ops when the position is unchanged).
  const showBoxBefore = (index: number) => dragIndex !== null && insertBefore === index;

  return {
    dragIndex,
    size,
    registerRow,
    layerRef,
    showBoxBefore,
    handleProps: (index: number) => ({ onPointerDown: (e: React.PointerEvent) => startDrag(index, e) }),
  };
}

// Grab handle that initiates a drag. Spread the per-row handleProps onto it.
function DragHandle({ onPointerDown }: { onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <span className={styles.listDragHandle} title="Drag to reorder" aria-hidden="true" onPointerDown={onPointerDown}>
      ⠿
    </span>
  );
}

// The floating clone lives in a fixed layer portaled to <body>, so its position
// is anchored to the viewport rather than to a transformed editor ancestor. The
// drag image is the full-width row collapsed to a thin bar (no text) — crisp,
// and it reads as the row itself lifted out of the list.
function RowDragLayer({ drag }: { drag: ReturnType<typeof useRowDrag> }) {
  const [mounted, setMounted] = useState(false);
  // SSR gate, same as Modal: the drag layer is a portal and needs a document
  // to exist before it can render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div ref={drag.layerRef} className={styles.rowFloatingLayer} aria-hidden="true">
      {drag.dragIndex !== null && (
        <div className={styles.rowFloatingBar} style={{ width: drag.size.w }}>
          <span className={styles.listDragHandle}>⠿</span>
        </div>
      )}
    </div>,
    document.body,
  );
}

// Up/down buttons for reordering an entry within a list. Disabled at the ends.
function ReorderControls({ index, count, onMove }: {
  index: number;
  count: number;
  onMove: (to: number) => void;
}) {
  return (
    <div className={styles.reorder}>
      <button
        type="button"
        className={styles.iconBtn}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
        aria-label="Move up"
        title="Move up"
      >
        ↑
      </button>
      <button
        type="button"
        className={styles.iconBtn}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
        aria-label="Move down"
        title="Move down"
      >
        ↓
      </button>
    </div>
  );
}

function Field({ label, value, onChange, multiline }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {multiline ? (
        <textarea className={styles.textarea} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className={styles.input} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

// The image URL and alt text are metadata on the asset itself, set in the media
// library — so this just shows the chosen image and a picker button.
function ImageRefFields({ value, onChange }: { value: ImageRef | null; onChange: (v: ImageRef | null) => void }) {
  const [picking, setPicking] = useState(false);
  const url = value?.url ?? "";
  return (
    <div className={styles.row}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={value?.altText ?? ""} className={styles.thumb} />
      ) : (
        <span className={styles.thumbEmpty} aria-hidden="true" />
      )}
      <button type="button" className={styles.iconBtn} onClick={() => setPicking(true)}>
        {url ? "Replace…" : "Choose image…"}
      </button>
      {picking && (
        <AssetPicker
          onClose={() => setPicking(false)}
          onSelect={(asset) => onChange({ url: asset.url, altText: asset.altText || undefined })}
        />
      )}
    </div>
  );
}

function ImageRefList({ value, onChange }: { value: ImageRef[]; onChange: (v: ImageRef[]) => void }) {
  const drag = useRowDrag((from, to) => onChange(move(value, from, to)));
  const update = (i: number, ref: ImageRef | null) => {
    const next = [...value];
    if (ref === null) next.splice(i, 1);
    else next[i] = ref;
    onChange(next);
  };
  return (
    <div className={styles.subGroup}>
      {value.map((ref, i) => (
        <Fragment key={i}>
          {drag.showBoxBefore(i) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
          <div
            ref={drag.registerRow(i)}
            className={`${styles.row} ${drag.dragIndex === i ? styles.rowDragging : ""}`}
          >
            <DragHandle {...drag.handleProps(i)} />
            <ImageRefFields value={ref} onChange={(r) => update(i, r)} />
            <ReorderControls index={i} count={value.length} onMove={(to) => onChange(move(value, i, to))} />
            <button type="button" className={styles.iconBtn} onClick={() => update(i, null)} aria-label="Remove image">Remove</button>
          </div>
        </Fragment>
      ))}
      {drag.showBoxBefore(value.length) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
      <RowDragLayer drag={drag} />
      <div className={styles.addRow}>
        <button type="button" className={styles.iconBtn} onClick={() => onChange([...value, { url: "" }])}>+ Add image</button>
      </div>
    </div>
  );
}

function ImageItemList({ value, onChange }: { value: ImageItem[]; onChange: (v: ImageItem[]) => void }) {
  const drag = useRowDrag((from, to) => onChange(move(value, from, to)));
  const update = rowUpdater(value, onChange);
  return (
    <div className={styles.subGroup}>
      {value.map((item, i) => (
        <Fragment key={i}>
          {drag.showBoxBefore(i) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
          <div
            ref={drag.registerRow(i)}
            className={`${styles.subGroup} ${drag.dragIndex === i ? styles.rowDragging : ""}`}
          >
            <div className={styles.row}>
              <DragHandle {...drag.handleProps(i)} />
              <Field label="Title" value={item.title ?? ""} onChange={(v) => update(i, { title: v || undefined })} />
              <ReorderControls index={i} count={value.length} onMove={(to) => onChange(move(value, i, to))} />
              <button type="button" className={styles.iconBtn} onClick={() => update(i, null)} aria-label="Remove item">Remove</button>
            </div>
            <Field label="Description" value={item.description ?? ""} onChange={(v) => update(i, { description: v || undefined })} multiline />
            <ImageRefFields value={item.image} onChange={(r) => update(i, { image: r ?? { url: "" } })} />
          </div>
        </Fragment>
      ))}
      {drag.showBoxBefore(value.length) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
      <RowDragLayer drag={drag} />
      <div className={styles.addRow}>
        <button type="button" className={styles.iconBtn} onClick={() => onChange([...value, { image: { url: "" } }])}>+ Add item</button>
      </div>
    </div>
  );
}

function ViewList({ value, onChange }: { value: ComparisonView[]; onChange: (v: ComparisonView[]) => void }) {
  const drag = useRowDrag((from, to) => onChange(move(value, from, to)));
  const update = rowUpdater(value, onChange);
  return (
    <div className={styles.subGroup}>
      {value.map((view, i) => (
        <Fragment key={i}>
          {drag.showBoxBefore(i) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
          <div
            ref={drag.registerRow(i)}
            className={`${styles.subGroup} ${drag.dragIndex === i ? styles.rowDragging : ""}`}
          >
            <div className={styles.row}>
              <DragHandle {...drag.handleProps(i)} />
              <Field label="Label" value={view.label} onChange={(v) => update(i, { label: v })} />
              <ReorderControls index={i} count={value.length} onMove={(to) => onChange(move(value, i, to))} />
              <button type="button" className={styles.iconBtn} onClick={() => update(i, null)} aria-label="Remove view">Remove</button>
            </div>
            <ImageRefFields value={view.image} onChange={(r) => update(i, { image: r ?? { url: "" } })} />
          </div>
        </Fragment>
      ))}
      {drag.showBoxBefore(value.length) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
      <RowDragLayer drag={drag} />
      <div className={styles.addRow}>
        <button type="button" className={styles.iconBtn} onClick={() => onChange([...value, { label: "View", image: { url: "" } }])}>+ Add view</button>
      </div>
    </div>
  );
}

function StageList({ value, onChange }: { value: TimelineStage[]; onChange: (v: TimelineStage[]) => void }) {
  const drag = useRowDrag((from, to) => onChange(move(value, from, to)));
  const update = rowUpdater(value, onChange);
  return (
    <div className={styles.subGroup}>
      {value.map((stage, i) => (
        <Fragment key={i}>
          {drag.showBoxBefore(i) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
          <div
            ref={drag.registerRow(i)}
            className={`${styles.subGroup} ${drag.dragIndex === i ? styles.rowDragging : ""}`}
          >
            <div className={styles.row}>
              <DragHandle {...drag.handleProps(i)} />
              <Field label="Marker" value={stage.marker} onChange={(v) => update(i, { marker: v })} />
              <Field label="Title" value={stage.title} onChange={(v) => update(i, { title: v })} />
              <ReorderControls index={i} count={value.length} onMove={(to) => onChange(move(value, i, to))} />
              <button type="button" className={styles.iconBtn} onClick={() => update(i, null)} aria-label="Remove stage">Remove</button>
            </div>
            <Field
              label="Description"
              value={stage.description}
              onChange={(v) => update(i, { description: v })}
              multiline
            />
          </div>
        </Fragment>
      ))}
      {drag.showBoxBefore(value.length) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
      <RowDragLayer drag={drag} />
      <div className={styles.addRow}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => onChange([...value, { marker: "", title: "", description: "" }])}
        >
          + Add stage
        </button>
      </div>
    </div>
  );
}

function SwatchList({ value, onChange }: { value: SwatchItem[]; onChange: (v: SwatchItem[]) => void }) {
  const drag = useRowDrag((from, to) => onChange(move(value, from, to)));
  const update = rowUpdater(value, onChange);
  return (
    <div className={styles.subGroup}>
      {value.map((item, i) => (
        <Fragment key={i}>
          {drag.showBoxBefore(i) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
          <div
            ref={drag.registerRow(i)}
            className={`${styles.subGroup} ${drag.dragIndex === i ? styles.rowDragging : ""}`}
          >
            <div className={styles.row}>
              <DragHandle {...drag.handleProps(i)} />
              <Field label="Name" value={item.name} onChange={(v) => update(i, { name: v })} />
              <Field label="Detail" value={item.detail} onChange={(v) => update(i, { detail: v })} />
              <ReorderControls index={i} count={value.length} onMove={(to) => onChange(move(value, i, to))} />
              <button type="button" className={styles.iconBtn} onClick={() => update(i, null)} aria-label="Remove swatch">Remove</button>
            </div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Colour</span>
              {/* A native colour input plus the hex, since a colour picker
                  alone cannot express "unset" and an admin may want to clear
                  it back to using the photo. */}
              <span className={styles.row}>
                <input
                  type="color"
                  value={item.color || "#cccccc"}
                  onChange={(e) => update(i, { color: e.target.value })}
                  aria-label={`Colour for swatch ${i + 1}`}
                />
                <input
                  type="text"
                  className={styles.input}
                  placeholder="#a0522d"
                  value={item.color}
                  onChange={(e) => update(i, { color: e.target.value })}
                  aria-label={`Hex colour for swatch ${i + 1}`}
                />
                {item.color && (
                  <button type="button" className={styles.iconBtn} onClick={() => update(i, { color: "" })}>
                    Clear
                  </button>
                )}
              </span>
            </label>
            <span className={styles.fieldLabel}>Photo (used instead of the colour)</span>
            <ImageRefFields value={item.image ?? { url: "" }} onChange={(r) => update(i, { image: r })} />
          </div>
        </Fragment>
      ))}
      {drag.showBoxBefore(value.length) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
      <RowDragLayer drag={drag} />
      <div className={styles.addRow}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => onChange([...value, { name: "", detail: "", color: "", image: null }])}
        >
          + Add swatch
        </button>
      </div>
    </div>
  );
}

function RowList({ value, onChange }: { value: SpecRow[]; onChange: (v: SpecRow[]) => void }) {
  const drag = useRowDrag((from, to) => onChange(move(value, from, to)));
  const update = rowUpdater(value, onChange);
  return (
    <div className={styles.subGroup}>
      {value.map((row, i) => (
        <Fragment key={i}>
          {drag.showBoxBefore(i) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
          <div
            ref={drag.registerRow(i)}
            className={`${styles.row} ${drag.dragIndex === i ? styles.rowDragging : ""}`}
          >
            <DragHandle {...drag.handleProps(i)} />
            <Field label="Label" value={row.label} onChange={(v) => update(i, { label: v })} />
            <Field label="Value" value={row.value} onChange={(v) => update(i, { value: v })} />
            <ReorderControls index={i} count={value.length} onMove={(to) => onChange(move(value, i, to))} />
            <button type="button" className={styles.iconBtn} onClick={() => update(i, null)} aria-label="Remove row">Remove</button>
          </div>
        </Fragment>
      ))}
      {drag.showBoxBefore(value.length) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
      <RowDragLayer drag={drag} />
      <div className={styles.addRow}>
        <button type="button" className={styles.iconBtn} onClick={() => onChange([...value, { label: "", value: "" }])}>+ Add row</button>
      </div>
    </div>
  );
}

function CredentialEntryList({ value, onChange }: { value: CredentialEntry[]; onChange: (v: CredentialEntry[]) => void }) {
  const drag = useRowDrag((from, to) => onChange(move(value, from, to)));
  const update = rowUpdater(value, onChange);
  return (
    <div className={styles.subGroup}>
      {value.map((entry, i) => (
        <Fragment key={i}>
          {drag.showBoxBefore(i) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
          <div
            ref={drag.registerRow(i)}
            className={`${styles.subGroup} ${drag.dragIndex === i ? styles.rowDragging : ""}`}
          >
            <div className={styles.row}>
              <DragHandle {...drag.handleProps(i)} />
              <Field label="Term (optional)" value={entry.term ?? ""} onChange={(v) => update(i, { term: v || undefined })} />
              <Field label="Title" value={entry.title} onChange={(v) => update(i, { title: v })} />
              <ReorderControls index={i} count={value.length} onMove={(to) => onChange(move(value, i, to))} />
              <button type="button" className={styles.iconBtn} onClick={() => update(i, null)} aria-label="Remove entry">Remove</button>
            </div>
            <Field label="Meta (optional)" value={entry.meta ?? ""} onChange={(v) => update(i, { meta: v || undefined })} />
            <Field label="Description (optional)" value={entry.description ?? ""} onChange={(v) => update(i, { description: v || undefined })} multiline />
          </div>
        </Fragment>
      ))}
      {drag.showBoxBefore(value.length) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
      <RowDragLayer drag={drag} />
      <div className={styles.addRow}>
        <button type="button" className={styles.iconBtn} onClick={() => onChange([...value, { title: "" }])}>+ Add entry</button>
      </div>
    </div>
  );
}

function StringList({ value, onChange, addLabel }: { value: string[]; onChange: (v: string[]) => void; addLabel: string }) {
  const drag = useRowDrag((from, to) => onChange(move(value, from, to)));
  const update = (i: number, v: string | null) => {
    const next = [...value];
    if (v === null) next.splice(i, 1);
    else next[i] = v;
    onChange(next);
  };
  return (
    <div className={styles.subGroup}>
      {value.map((item, i) => (
        <Fragment key={i}>
          {drag.showBoxBefore(i) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
          <div
            ref={drag.registerRow(i)}
            className={`${styles.row} ${drag.dragIndex === i ? styles.rowDragging : ""}`}
          >
            <DragHandle {...drag.handleProps(i)} />
            <input className={styles.input} value={item} onChange={(e) => update(i, e.target.value)} />
            <ReorderControls index={i} count={value.length} onMove={(to) => onChange(move(value, i, to))} />
            <button type="button" className={styles.iconBtn} onClick={() => update(i, null)} aria-label="Remove">Remove</button>
          </div>
        </Fragment>
      ))}
      {drag.showBoxBefore(value.length) && <div className={styles.rowPlaceholder} style={{ height: drag.size.h }} />}
      <RowDragLayer drag={drag} />
      <div className={styles.addRow}>
        <button type="button" className={styles.iconBtn} onClick={() => onChange([...value, ""])}>{addLabel}</button>
      </div>
    </div>
  );
}

// A columns container's children: an add/remove/reorder list, each child edited
// with its own type picker + form (reusing ChildEditor, restricted to the
// non-container column child types).
//
// Columns are collapsible (accordion): each shows a compact header — column
// number, block type, and a one-line content summary — and only the expanded
// one reveals its full form. Without this, every column's nested table (e.g. a
// credentials entry list) is open at once, stacking bordered boxes into an
// unreadable wall. Defaults to the first column open.
function ColumnsList({ value, onChange }: { value: Block[]; onChange: (v: Block[]) => void }) {
  const [openId, setOpenId] = useState<string | null>(value[0]?.id ?? null);
  const update = (i: number, child: Block | null) => {
    const next = [...value];
    if (child === null) next.splice(i, 1);
    else next[i] = child;
    onChange(next);
  };
  const addColumn = () => {
    const child = createEmptyBlock("credentials");
    onChange([...value, child]);
    setOpenId(child.id); // open the new column so it's ready to edit
  };
  return (
    <div className={styles.subGroup}>
      {value.map((child, i) => {
        const open = openId === child.id;
        return (
          <div key={child.id} className={`${styles.columnCard} ${open ? styles.columnCardOpen : ""}`}>
            <div className={styles.columnHead}>
              <button
                type="button"
                className={styles.columnToggle}
                onClick={() => setOpenId(open ? null : child.id)}
                aria-expanded={open}
              >
                <span className={styles.columnChevron} aria-hidden="true">{open ? "▾" : "▸"}</span>
                <span className={styles.fieldLabel}>Column {i + 1}</span>
                <span className={styles.blockTag}>{BLOCK_LABELS[child.type]}</span>
                <span className={styles.blockSummary}>{blockSummary(child)}</span>
              </button>
              <ReorderControls index={i} count={value.length} onMove={(to) => onChange(move(value, i, to))} />
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => update(i, null)}
                disabled={value.length <= 1}
                aria-label={`Remove column ${i + 1}`}
              >
                Remove
              </button>
            </div>
            {open && (
              <div className={styles.columnBody}>
                <ChildEditor block={child} onChange={(b) => update(i, b)} types={COLUMN_CHILD_TYPES} />
              </div>
            )}
          </div>
        );
      })}
      <div className={styles.addRow}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={addColumn}
          disabled={value.length >= 4}
        >
          + Add column
        </button>
      </div>
    </div>
  );
}

const CALLOUT_VARIANTS: CalloutVariant[] = ["info", "quote", "success", "warning"];

// ── Per-block form ────────────────────────────────────────────────────────

export default function BlockForm({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const headingLabel =
    block.type === "richText" || block.type === "callout"
      ? "Heading (optional)"
      : block.type === "entry"
      ? "Title"
      : block.type === "profileHero"
      ? "Section label (optional)"
      : "Heading";
  const heading = (
    <Field label={headingLabel} value={block.heading} onChange={(v) => onChange({ ...block, heading: v })} />
  );

  switch (block.type) {
    case "richText":
      return (
        <>
          {heading}
          <span className={styles.fieldLabel}>Content</span>
          <RichTextEditor value={block.content} onChange={(content) => onChange({ ...block, content })} />
        </>
      );

    case "gallery":
      return (
        <>
          {heading}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Layout</span>
            <select
              className={styles.select}
              value={block.layout}
              onChange={(e) => onChange({ ...block, layout: e.target.value === "feature" ? "feature" : "grid" })}
            >
              <option value="grid">Grid (even masonry)</option>
              <option value="feature">Feature (bold, leads with one large image)</option>
            </select>
          </label>
          <ImageRefList value={block.images} onChange={(images) => onChange({ ...block, images })} />
        </>
      );

    case "singleImage":
      return (
        <>
          {heading}
          <ImageRefFields value={block.image} onChange={(image) => onChange({ ...block, image })} />
        </>
      );

    case "mediaShowcase":
      return (
        <>
          {heading}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Layout</span>
            <select
              className={styles.select}
              value={block.layout}
              onChange={(e) => onChange({ ...block, layout: e.target.value === "grid" ? "grid" : "cards" })}
            >
              <option value="cards">Cards (caption below image)</option>
              <option value="grid">Grid (caption above image)</option>
            </select>
          </label>
          <ImageItemList value={block.items} onChange={(items) => onChange({ ...block, items })} />
        </>
      );

    case "comparison":
      return (
        <>
          {heading}
          <span className={styles.fieldLabel}>Views</span>
          <ViewList value={block.views} onChange={(views) => onChange({ ...block, views })} />
        </>
      );

    case "beforeAfter":
      return (
        <>
          {heading}
          <div className={styles.subGroup}>
            <span className={styles.fieldLabel}>Before</span>
            <Field
              label="Label"
              value={block.before.label}
              onChange={(v) => onChange({ ...block, before: { ...block.before, label: v } })}
            />
            <ImageRefFields
              value={block.before.image}
              onChange={(r) => onChange({ ...block, before: { ...block.before, image: r ?? { url: "" } } })}
            />
          </div>
          <div className={styles.subGroup}>
            <span className={styles.fieldLabel}>After</span>
            <Field
              label="Label"
              value={block.after.label}
              onChange={(v) => onChange({ ...block, after: { ...block.after, label: v } })}
            />
            <ImageRefFields
              value={block.after.image}
              onChange={(r) => onChange({ ...block, after: { ...block.after, image: r ?? { url: "" } } })}
            />
          </div>
        </>
      );

    case "timeline":
      return (
        <>
          {heading}
          <span className={styles.fieldLabel}>Stages</span>
          <StageList value={block.stages} onChange={(stages) => onChange({ ...block, stages })} />
        </>
      );

    case "swatches":
      return (
        <>
          {heading}
          <span className={styles.fieldLabel}>Swatches</span>
          <SwatchList value={block.items} onChange={(items) => onChange({ ...block, items })} />
        </>
      );

    case "specs":
      return (
        <>
          {heading}
          <span className={styles.fieldLabel}>Rows</span>
          <RowList value={block.rows} onChange={(rows) => onChange({ ...block, rows })} />
        </>
      );

    case "documentViewer":
      return (
        <>
          {heading}
          <span className={styles.fieldLabel}>Documents</span>
          <ImageItemList value={block.items} onChange={(items) => onChange({ ...block, items })} />
        </>
      );

    case "split":
      return (
        <>
          {heading}
          <div className={styles.subGroup}>
            <span className={styles.fieldLabel}>Left</span>
            <ChildEditor block={block.left} onChange={(left) => onChange({ ...block, left })} />
          </div>
          <div className={styles.subGroup}>
            <span className={styles.fieldLabel}>Right</span>
            <ChildEditor block={block.right} onChange={(right) => onChange({ ...block, right })} />
          </div>
        </>
      );

    case "callout":
      return (
        <>
          {heading}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Variant</span>
            <select
              className={styles.select}
              value={block.variant}
              onChange={(e) => onChange({ ...block, variant: e.target.value as CalloutVariant })}
            >
              {CALLOUT_VARIANTS.map((v) => (
                <option key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <Field label="Text" value={block.text} onChange={(v) => onChange({ ...block, text: v })} multiline />
          {block.variant === "quote" && (
            <Field
              label="Attribution (optional)"
              value={block.attribution ?? ""}
              onChange={(v) => onChange({ ...block, attribution: v || undefined })}
            />
          )}
        </>
      );

    case "entry":
      return (
        <>
          {heading}
          <span className={styles.fieldLabel}>Description</span>
          <RichTextEditor value={block.content} onChange={(content) => onChange({ ...block, content })} />
          <span className={styles.fieldLabel}>Images</span>
          <ImageItemList value={block.items} onChange={(items) => onChange({ ...block, items })} />
        </>
      );

    case "profileHero":
      return (
        <>
          {heading}
          <Field label="Name" value={block.name} onChange={(v) => onChange({ ...block, name: v })} />
          <Field label="Subtitle" value={block.subtitle} onChange={(v) => onChange({ ...block, subtitle: v })} />
          <span className={styles.fieldLabel}>Portrait</span>
          <ImageRefFields value={block.image} onChange={(image) => onChange({ ...block, image })} />
          <span className={styles.fieldLabel}>Bio</span>
          <RichTextEditor value={block.bio} onChange={(bio) => onChange({ ...block, bio })} />
        </>
      );

    case "credentials":
      return (
        <>
          {heading}
          <span className={styles.fieldLabel}>Entries</span>
          <CredentialEntryList value={block.items} onChange={(items) => onChange({ ...block, items })} />
        </>
      );

    case "tagList":
      return (
        <>
          {heading}
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Tone</span>
            <select
              className={styles.select}
              value={block.tone}
              onChange={(e) => onChange({ ...block, tone: e.target.value === "dark" ? "dark" : "light" })}
            >
              <option value="light">Light</option>
              <option value="dark">Dark (inverted panel)</option>
            </select>
          </label>
          <span className={styles.fieldLabel}>Tags</span>
          <StringList value={block.tags} onChange={(tags) => onChange({ ...block, tags })} addLabel="+ Add tag" />
        </>
      );

    case "cta":
      return (
        <>
          <Field label="Headline" value={block.heading} onChange={(v) => onChange({ ...block, heading: v })} />
          <Field label="Button label" value={block.buttonLabel} onChange={(v) => onChange({ ...block, buttonLabel: v })} />
          <Field label="Button link" value={block.buttonHref} onChange={(v) => onChange({ ...block, buttonHref: v })} />
        </>
      );

    case "pageIntro":
      return (
        <>
          <Field label="Eyebrow" value={block.eyebrow} onChange={(v) => onChange({ ...block, eyebrow: v })} />
          <Field label="Heading" value={block.heading} onChange={(v) => onChange({ ...block, heading: v })} />
          <span className={styles.fieldLabel}>Body</span>
          <RichTextEditor value={block.body} onChange={(body) => onChange({ ...block, body })} />
        </>
      );

    case "columns":
      return (
        <>
          <span className={styles.fieldLabel}>Columns</span>
          <ColumnsList value={block.items} onChange={(items) => onChange({ ...block, items })} />
        </>
      );
  }
}

// One side of a split: a type picker plus the chosen block's own form. Switching
// type swaps in a fresh empty block of that type (keeping the same id). Splits
// can't be nested, so `split` is excluded from the type options.
function ChildEditor({ block, onChange, types = CHILD_BLOCK_TYPES }: { block: Block; onChange: (b: Block) => void; types?: BlockType[] }) {
  function changeType(type: BlockType) {
    if (type === block.type) return;
    const next = createEmptyBlock(type);
    next.id = block.id;
    next.heading = block.heading;
    onChange(next);
  }
  return (
    <>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Block type</span>
        <select className={styles.select} value={block.type} onChange={(e) => changeType(e.target.value as BlockType)}>
          {types.map((t) => (
            <option key={t} value={t}>
              {BLOCK_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <BlockForm block={block} onChange={onChange} />
    </>
  );
}
