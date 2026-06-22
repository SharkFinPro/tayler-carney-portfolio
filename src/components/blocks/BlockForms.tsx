"use client";

import { useState } from "react";
import styles from "./BlockEditor.module.scss";
import AssetPicker from "@/components/AssetPicker";
import RichTextEditor from "./richText/RichTextEditor";
import {
  BLOCK_LABELS,
  CHILD_BLOCK_TYPES,
  createEmptyBlock,
  type Block,
  type BlockType,
  type ImageItem,
  type ImageRef,
  type ComparisonView,
  type SpecRow,
  type CalloutVariant,
} from "./blocks";

// ── Small field primitives ────────────────────────────────────────────────

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
  const update = (i: number, ref: ImageRef | null) => {
    const next = [...value];
    if (ref === null) next.splice(i, 1);
    else next[i] = ref;
    onChange(next);
  };
  return (
    <div className={styles.subGroup}>
      {value.map((ref, i) => (
        <div key={i} className={styles.row}>
          <ImageRefFields value={ref} onChange={(r) => update(i, r)} />
          <button type="button" className={styles.iconBtn} onClick={() => update(i, null)} aria-label="Remove image">Remove</button>
        </div>
      ))}
      <div className={styles.addRow}>
        <button type="button" className={styles.iconBtn} onClick={() => onChange([...value, { url: "" }])}>+ Add image</button>
      </div>
    </div>
  );
}

function ImageItemList({ value, onChange }: { value: ImageItem[]; onChange: (v: ImageItem[]) => void }) {
  const update = (i: number, patch: Partial<ImageItem> | null) => {
    const next = [...value];
    if (patch === null) next.splice(i, 1);
    else next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  return (
    <div className={styles.subGroup}>
      {value.map((item, i) => (
        <div key={i} className={styles.subGroup}>
          <div className={styles.row}>
            <Field label="Title" value={item.title ?? ""} onChange={(v) => update(i, { title: v || undefined })} />
            <button type="button" className={styles.iconBtn} onClick={() => update(i, null)} aria-label="Remove item">Remove</button>
          </div>
          <Field label="Description" value={item.description ?? ""} onChange={(v) => update(i, { description: v || undefined })} multiline />
          <ImageRefFields value={item.image} onChange={(r) => update(i, { image: r ?? { url: "" } })} />
        </div>
      ))}
      <div className={styles.addRow}>
        <button type="button" className={styles.iconBtn} onClick={() => onChange([...value, { image: { url: "" } }])}>+ Add item</button>
      </div>
    </div>
  );
}

function ViewList({ value, onChange }: { value: ComparisonView[]; onChange: (v: ComparisonView[]) => void }) {
  const update = (i: number, patch: Partial<ComparisonView> | null) => {
    const next = [...value];
    if (patch === null) next.splice(i, 1);
    else next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  return (
    <div className={styles.subGroup}>
      {value.map((view, i) => (
        <div key={i} className={styles.subGroup}>
          <div className={styles.row}>
            <Field label="Label" value={view.label} onChange={(v) => update(i, { label: v })} />
            <button type="button" className={styles.iconBtn} onClick={() => update(i, null)} aria-label="Remove view">Remove</button>
          </div>
          <ImageRefFields value={view.image} onChange={(r) => update(i, { image: r ?? { url: "" } })} />
        </div>
      ))}
      <div className={styles.addRow}>
        <button type="button" className={styles.iconBtn} onClick={() => onChange([...value, { label: "View", image: { url: "" } }])}>+ Add view</button>
      </div>
    </div>
  );
}

function RowList({ value, onChange }: { value: SpecRow[]; onChange: (v: SpecRow[]) => void }) {
  const update = (i: number, patch: Partial<SpecRow> | null) => {
    const next = [...value];
    if (patch === null) next.splice(i, 1);
    else next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  return (
    <div className={styles.subGroup}>
      {value.map((row, i) => (
        <div key={i} className={styles.row}>
          <Field label="Label" value={row.label} onChange={(v) => update(i, { label: v })} />
          <Field label="Value" value={row.value} onChange={(v) => update(i, { value: v })} />
          <button type="button" className={styles.iconBtn} onClick={() => update(i, null)} aria-label="Remove row">Remove</button>
        </div>
      ))}
      <div className={styles.addRow}>
        <button type="button" className={styles.iconBtn} onClick={() => onChange([...value, { label: "", value: "" }])}>+ Add row</button>
      </div>
    </div>
  );
}

const CALLOUT_VARIANTS: CalloutVariant[] = ["info", "quote", "success", "warning"];

// ── Per-block form ────────────────────────────────────────────────────────

export default function BlockForm({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const headingLabel = block.type === "richText" || block.type === "callout" ? "Heading (optional)" : "Heading";
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
  }
}

// One side of a split: a type picker plus the chosen block's own form. Switching
// type swaps in a fresh empty block of that type (keeping the same id). Splits
// can't be nested, so `split` is excluded from the type options.
function ChildEditor({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
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
          {CHILD_BLOCK_TYPES.map((t) => (
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
