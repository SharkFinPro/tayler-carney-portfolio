"use client";

import { useState } from "react";
import styles from "./Editor.module.scss";
import AssetPicker from "@/components/AssetPicker";
import type { Block, ImageItem, ImageRef, TechPackInfo } from "@/components/ProjectBlocks/blocks";

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
// library / uploader — so this just shows the chosen image and a picker button.
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
          <ImageRefFields
            value={item.image}
            onChange={(r) => update(i, { image: r ?? { url: "" } })}
          />
        </div>
      ))}
      <div className={styles.addRow}>
        <button type="button" className={styles.iconBtn} onClick={() => onChange([...value, { image: { url: "" } }])}>+ Add item</button>
      </div>
    </div>
  );
}

function InfoEditor({ value, onChange }: { value: TechPackInfo | null; onChange: (v: TechPackInfo | null) => void }) {
  const entries = Object.entries(value ?? {});
  const commit = (rows: [string, string | number][]) => {
    const obj: TechPackInfo = {};
    for (const [k, v] of rows) if (k.trim()) obj[k.trim()] = v;
    onChange(Object.keys(obj).length ? obj : null);
  };
  const update = (i: number, key: string, val: string) => {
    const rows = entries.map(([k, v]) => [k, v] as [string, string | number]);
    rows[i] = [key, val];
    commit(rows);
  };
  const remove = (i: number) => commit(entries.filter((_, j) => j !== i));
  return (
    <div className={styles.subGroup}>
      {entries.map(([k, v], i) => (
        <div key={i} className={styles.row}>
          <Field label="Label" value={k} onChange={(nk) => update(i, nk, String(v))} />
          <Field label="Value" value={String(v)} onChange={(nv) => update(i, k, nv)} />
          <button type="button" className={styles.iconBtn} onClick={() => remove(i)} aria-label="Remove field">Remove</button>
        </div>
      ))}
      <div className={styles.addRow}>
        <button type="button" className={styles.iconBtn} onClick={() => commit([...entries.map(([k, v]) => [k, v] as [string, string | number]), ["", ""]])}>+ Add field</button>
      </div>
    </div>
  );
}

// ── Per-block form ────────────────────────────────────────────────────────

export default function BlockForm({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const heading = (
    <Field label="Heading" value={block.heading} onChange={(v) => onChange({ ...block, heading: v })} />
  );

  switch (block.type) {
    case "sketches":
    case "patterns":
    case "finalProduct":
      return (
        <>
          {heading}
          <ImageRefList value={block.images} onChange={(images) => onChange({ ...block, images })} />
        </>
      );

    case "digitalRendering":
      return (
        <>
          {heading}
          <ImageRefFields value={block.image} onChange={(image) => onChange({ ...block, image })} />
        </>
      );

    case "looks":
    case "details":
    case "materials":
      return (
        <>
          {heading}
          <ImageItemList value={block.items} onChange={(items) => onChange({ ...block, items })} />
        </>
      );

    case "flats":
      return (
        <>
          {heading}
          <span className={styles.fieldLabel}>Front</span>
          <ImageRefFields value={block.front} onChange={(front) => onChange({ ...block, front })} />
          <span className={styles.fieldLabel}>Back</span>
          <ImageRefFields value={block.back} onChange={(back) => onChange({ ...block, back })} />
          <span className={styles.fieldLabel}>Side</span>
          <ImageRefFields value={block.side} onChange={(side) => onChange({ ...block, side })} />
          <Field label="Colored flats heading" value={block.coloredFlatsHeading} onChange={(v) => onChange({ ...block, coloredFlatsHeading: v })} />
          <span className={styles.fieldLabel}>Colored flats</span>
          <ImageItemList value={block.coloredFlats} onChange={(coloredFlats) => onChange({ ...block, coloredFlats })} />
        </>
      );

    case "techPack":
      return (
        <>
          {heading}
          <span className={styles.fieldLabel}>Info table</span>
          <InfoEditor value={block.info} onChange={(info) => onChange({ ...block, info })} />
          <span className={styles.fieldLabel}>Sheets</span>
          <ImageItemList value={block.sheets} onChange={(sheets) => onChange({ ...block, sheets })} />
        </>
      );
  }
}
