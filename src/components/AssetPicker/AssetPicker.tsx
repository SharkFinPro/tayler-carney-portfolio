"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import styles from "./AssetPicker.module.scss";
import { fetchAssets, createUploadTarget, finalizeAsset } from "@/app/admin/mediaActions";
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
      const init = await createUploadTarget(file.name);
      if ("error" in init) throw new Error(init.error);

      const { id, target } = init;
      const form = new FormData();
      form.append("X-Amz-Date", target.date);
      form.append("key", target.key);
      form.append("X-Amz-Signature", target.signature);
      form.append("X-Amz-Algorithm", target.algorithm);
      form.append("policy", target.policy);
      form.append("X-Amz-Credential", target.credential);
      if (target.securityToken) form.append("X-Amz-Security-Token", target.securityToken);
      form.append("file", file);

      const up = await fetch(target.url, { method: "POST", body: form });
      if (!up.ok) throw new Error("S3 upload failed.");

      setStatus({ msg: "Processing…" });
      const fin = await finalizeAsset(id, { title: file.name });
      if ("error" in fin) throw new Error(fin.error);

      setStatus({ msg: "Uploaded." });
      onSelect({ url: fin.url });
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
