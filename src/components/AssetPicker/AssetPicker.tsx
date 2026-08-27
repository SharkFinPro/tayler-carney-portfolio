"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import styles from "./AssetPicker.module.scss";
import { fetchAssets, publishAsset } from "@/app/admin/mediaActions";
import MediaUploader from "@/app/admin/media/MediaUploader";
import type { MediaAsset } from "@/lib/getAssets";

/** What a caller gets back — the fields the picker's call sites actually use. */
export type PickedAsset = {
  id: string;
  url: string;
  altText?: string;
  title?: string;
  fileName: string;
};

type BaseProps = {
  onClose: () => void;
  /** Which assets to offer: images (default) or PDF documents. */
  kind?: "image" | "document";
};

/**
 * Single- and multi-select are one component but two contracts, so the props
 * are a union rather than a bag of optionals: a single-select call site can
 * never be handed an array, and `max` / `selectedUrls` exist only where they
 * mean something.
 */
type Props = BaseProps &
  (
    | { multiple?: false; onSelect: (asset: PickedAsset) => void }
    | {
        multiple: true;
        onSelect: (assets: PickedAsset[]) => void;
        /** Most assets one confirmation may return. Omitted means no cap. */
        max?: number;
        /** URLs the caller already holds — shown as added, and not re-pickable. */
        selectedUrls?: string[];
      }
  );

function picked(asset: MediaAsset): PickedAsset {
  return {
    id: asset.id,
    url: asset.url,
    altText: asset.altText,
    title: asset.title,
    fileName: asset.fileName,
  };
}

export default function AssetPicker(props: Props) {
  const { onClose, kind = "image" } = props;
  const multiple = props.multiple === true;
  const max = props.multiple ? props.max : undefined;
  const alreadyAdded = new Set(props.multiple ? (props.selectedUrls ?? []) : []);

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<{ msg: string; error?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);
  // Ids rather than assets, in click order: the record is looked up at confirm
  // time, and the order is what the caller receives.
  const [chosenIds, setChosenIds] = useState<string[]>([]);

  async function load() {
    // `loading` starts true; this only runs once from the mount effect, so the
    // status is cleared after the fetch settles.
    const res = await fetchAssets();
    setLoading(false);
    if ("error" in res) {
      setStatus({ msg: res.error, error: true });
      return;
    }
    setAssets(res.assets);
  }

  useEffect(() => {
    // The state is set after an await inside load(); fetching on mount is what
    // an effect is for, and none of it is derived from a prop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  // Selecting a draft asset would place an unpublished image on a live page,
  // where it wouldn't display for visitors — so publish it as part of selection.
  // Returns false when a publish failed, having already reported it; the ones
  // before it stay published, which is the same end state as picking them one
  // at a time and is harmless.
  async function publishDrafts(list: MediaAsset[]): Promise<boolean> {
    for (const asset of list) {
      if (asset.status !== "draft") continue;
      const res = await publishAsset(asset.id);
      if ("error" in res) {
        setStatus({ msg: res.error, error: true });
        return false;
      }
    }
    return true;
  }

  async function choose(asset: MediaAsset) {
    if (selecting || props.multiple) return;
    setSelecting(true);
    const ok = await publishDrafts([asset]);
    setSelecting(false);
    if (!ok) return;
    props.onSelect(picked(asset));
    onClose();
  }

  const atCap = max !== undefined && chosenIds.length >= max;

  function toggle(asset: MediaAsset) {
    if (selecting) return;
    setChosenIds((prev) =>
      prev.includes(asset.id)
        ? prev.filter((id) => id !== asset.id)
        : max !== undefined && prev.length >= max
          ? prev
          : [...prev, asset.id]
    );
  }

  async function confirm() {
    if (!props.multiple || selecting || chosenIds.length === 0) return;
    const byId = new Map(assets.map((a) => [a.id, a]));
    const chosen = chosenIds.flatMap((id) => {
      const asset = byId.get(id);
      return asset ? [asset] : [];
    });

    setSelecting(true);
    const ok = await publishDrafts(chosen);
    setSelecting(false);
    if (!ok) return;

    props.onSelect(chosen.map(picked));
    onClose();
  }

  const filtered = assets.filter((a) => {
    const mime = a.mimeType ?? "";
    if (kind === "document" ? mime !== "application/pdf" : !mime.startsWith("image/")) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (a.title ?? "").toLowerCase().includes(q) || a.fileName.toLowerCase().includes(q);
  });

  const heading = multiple ? "Select images" : kind === "document" ? "Select PDF" : "Select image";

  return (
    <Modal onClose={onClose} labelledBy="asset-picker-title" overlayClassName={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.head}>
          <span id="asset-picker-title" className={styles.title}>
            {heading}
          </span>
          <input
            className={styles.search}
            placeholder="Search assets…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search assets"
          />
          <button type="button" className={styles.close} onClick={onClose}>Close</button>
        </div>

        <div className={styles.body}>
          {loading ? (
            <p className={styles.empty}>Loading assets…</p>
          ) : filtered.length === 0 ? (
            <p className={styles.empty}>
              {kind === "document"
                ? "No PDFs in the Media Library yet. Upload one below."
                : "No assets found."}
            </p>
          ) : (
            <div className={styles.grid}>
              {filtered.map((a) => {
                const added = alreadyAdded.has(a.url);
                const chosen = chosenIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={`${styles.cell} ${chosen ? styles.cellChosen : ""}`}
                    disabled={selecting || added || (multiple && !chosen && atCap)}
                    aria-pressed={multiple ? chosen : undefined}
                    onClick={() => (multiple ? toggle(a) : choose(a))}
                  >
                    {kind === "document" ? (
                      <span className={styles.docThumb} aria-hidden="true">PDF</span>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className={styles.thumb} src={a.url} alt={a.altText ?? a.title ?? a.fileName} loading="lazy" />
                    )}
                    <span className={styles.name}>{a.title || a.fileName}</span>
                    <span className={styles.badge}>{added ? "added" : a.status}</span>
                    {multiple && chosen && (
                      // The pick order is the order the caller receives, so it
                      // is worth showing rather than a plain checkmark.
                      <span className={styles.tick} aria-hidden="true">
                        {chosenIds.indexOf(a.id) + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className={styles.foot}>
          <MediaUploader
            triggerLabel={kind === "document" ? "Upload PDF…" : "Upload new…"}
            triggerClassName={styles.close}
            accept={kind}
            onUploaded={(asset) => {
              if (props.multiple) {
                // Keep the picker open: an upload here is usually one of
                // several images being gathered, not the end of the task.
                setAssets((prev) => [asset, ...prev]);
                toggle(asset);
                return;
              }
              props.onSelect(picked(asset));
              onClose();
            }}
          />
          {props.multiple && (
            <>
              <span className={styles.count} role="status">
                {chosenIds.length} selected{max !== undefined && ` of ${max}`}
              </span>
              <button
                type="button"
                className={styles.confirm}
                onClick={confirm}
                disabled={selecting || chosenIds.length === 0}
              >
                {selecting
                  ? "Adding…"
                  : `Add ${chosenIds.length} image${chosenIds.length === 1 ? "" : "s"}`}
              </button>
            </>
          )}
          {status && (
            <span className={`${styles.status} ${status.error ? styles.statusError : ""}`} role="status">
              {status.msg}
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
