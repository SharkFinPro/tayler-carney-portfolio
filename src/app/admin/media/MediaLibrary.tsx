"use client";

import { useState } from "react";
import styles from "./Media.module.scss";
import type { MediaAsset } from "@/lib/getAssets";
import {
  fetchAssets,
  updateAsset,
  publishAsset,
  unpublishAsset,
  deleteAsset,
} from "@/app/admin/mediaActions";

export default function MediaLibrary({ initialAssets }: { initialAssets: MediaAsset[] }) {
  const [assets, setAssets] = useState<MediaAsset[]>(initialAssets);
  const [edits, setEdits] = useState<Record<string, { title: string; altText: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ msg: string; error?: boolean } | null>(null);

  const editOf = (a: MediaAsset) => edits[a.id] ?? { title: a.title ?? "", altText: a.altText ?? "" };
  const setEdit = (id: string, patch: Partial<{ title: string; altText: string }>) =>
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { title: "", altText: "" }), ...patch } }));

  async function refresh() {
    const res = await fetchAssets();
    if (!("error" in res)) setAssets(res.assets);
  }

  async function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(id);
    setStatus(null);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      setStatus({ msg: res.error ?? "Action failed.", error: true });
      return;
    }
    setStatus({ msg: okMsg });
    await refresh();
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.title}>Media Library</h1>
        {status && (
          <span className={`${styles.status} ${status.error ? styles.statusError : ""}`} role="status">
            {status.msg}
          </span>
        )}
        <button type="button" className={styles.btn} onClick={refresh}>Refresh</button>
      </div>

      <div className={styles.grid}>
        {assets.map((a) => {
          const e = editOf(a);
          const isBusy = busy === a.id;
          return (
            <div key={a.id} className={styles.card}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.thumb} src={a.url} alt={a.altText ?? a.title ?? a.fileName} loading="lazy" />
              <div className={styles.cardBody}>
                <span className={`${styles.badge} ${a.status === "published" ? styles.badgePublished : ""}`}>
                  {a.status}
                </span>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Title</span>
                  <input className={styles.input} value={e.title} onChange={(ev) => setEdit(a.id, { title: ev.target.value })} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Alt text</span>
                  <input className={styles.input} value={e.altText} onChange={(ev) => setEdit(a.id, { altText: ev.target.value })} />
                </label>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    disabled={isBusy}
                    onClick={() => run(a.id, () => updateAsset(a.id, { title: e.title, altText: e.altText }), "Saved.")}
                  >
                    Save
                  </button>
                  {a.status === "published" ? (
                    <button type="button" className={styles.iconBtn} disabled={isBusy} onClick={() => run(a.id, () => unpublishAsset(a.id), "Unpublished.")}>
                      Unpublish
                    </button>
                  ) : (
                    <button type="button" className={styles.iconBtn} disabled={isBusy} onClick={() => run(a.id, () => publishAsset(a.id), "Published.")}>
                      Publish
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.iconBtn}
                    disabled={isBusy}
                    onClick={() => {
                      if (confirm(`Delete "${a.title || a.fileName}"? This cannot be undone.`)) {
                        run(a.id, () => deleteAsset(a.id), "Deleted.");
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
