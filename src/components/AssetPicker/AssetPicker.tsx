"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import styles from "./AssetPicker.module.scss";
import { fetchAssets, uploadAsset } from "@/app/admin/mediaActions";
import type { MediaAsset } from "@/lib/getAssets";

interface Props {
  onClose: () => void;
  onSelect: (asset: { url: string; altText?: string }) => void;
}

export default function AssetPicker({ onClose, onSelect }: Props) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<{ msg: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetchAssets();
    if ("error" in res) {
      setStatus({ msg: res.error, error: true });
      return;
    }
    setAssets(res.assets);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = assets.filter((a) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (a.title ?? "").toLowerCase().includes(q) || a.fileName.toLowerCase().includes(q);
  });

  async function handleUpload(file: File) {
    setBusy(true);
    setStatus({ msg: "Uploading…" });
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name);
      const res = await uploadAsset(form);
      if ("error" in res) throw new Error(res.error);

      setStatus({ msg: "Uploaded." });
      onSelect({ url: res.asset.url, altText: res.asset.altText });
      onClose();
    } catch (e) {
      setStatus({ msg: e instanceof Error ? e.message : "Upload failed.", error: true });
    } finally {
      setBusy(false);
    }
  }

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
          {filtered.length === 0 ? (
            <p className={styles.empty}>No assets found.</p>
          ) : (
            <div className={styles.grid}>
              {filtered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={styles.cell}
                  onClick={() => {
                    onSelect({ url: a.url, altText: a.altText });
                    onClose();
                  }}
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
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
          />
          <button type="button" className={styles.close} onClick={() => fileRef.current?.click()} disabled={busy}>
            Upload new…
          </button>
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
