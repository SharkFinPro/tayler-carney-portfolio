"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import styles from "./AssetPicker.module.scss";
import { fetchAssets, publishAsset } from "@/app/admin/mediaActions";
import MediaUploader from "@/app/admin/media/MediaUploader";
import type { MediaAsset } from "@/lib/getAssets";

interface Props {
  onClose: () => void;
  onSelect: (asset: { url: string; altText?: string }) => void;
}

export default function AssetPicker({ onClose, onSelect }: Props) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<{ msg: string; error?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);

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
    load();
  }, []);

  // Selecting a draft asset would place an unpublished image on a live page,
  // where it wouldn't display for visitors — so publish it as part of selection.
  async function choose(asset: MediaAsset) {
    if (selecting) return;
    if (asset.status === "draft") {
      setSelecting(true);
      const res = await publishAsset(asset.id);
      setSelecting(false);
      if ("error" in res) {
        setStatus({ msg: res.error, error: true });
        return;
      }
    }
    onSelect({ url: asset.url, altText: asset.altText });
    onClose();
  }

  const filtered = assets.filter((a) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (a.title ?? "").toLowerCase().includes(q) || a.fileName.toLowerCase().includes(q);
  });

  return (
    <Modal onClose={onClose} labelledBy="asset-picker-title" overlayClassName={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.head}>
          <span id="asset-picker-title" className={styles.title}>Select image</span>
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
            <p className={styles.empty}>No assets found.</p>
          ) : (
            <div className={styles.grid}>
              {filtered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={styles.cell}
                  disabled={selecting}
                  onClick={() => choose(a)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={styles.thumb} src={a.url} alt={a.altText ?? a.title ?? a.fileName} loading="lazy" />
                  <span className={styles.name}>{a.title || a.fileName}</span>
                  <span className={styles.badge}>{a.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.foot}>
          <MediaUploader
            triggerLabel="Upload new…"
            triggerClassName={styles.close}
            onUploaded={(asset) => {
              onSelect({ url: asset.url, altText: asset.altText });
              onClose();
            }}
          />
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
