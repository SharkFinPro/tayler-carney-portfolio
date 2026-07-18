"use client";

import { useState } from "react";
import { updateGlobal, updateSeo } from "@/app/admin/contentActions";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";
import type { GlobalContent } from "@/lib/global";
import type { SeoContent } from "@/lib/seo";
import styles from "./Settings.module.scss";

// SEO keywords are edited as a single comma-separated line; the sanitizer also
// accepts an array, but the form keeps it as a string for a simple input.
type SeoForm = Omit<SeoContent, "keywords"> & { keywords: string };

const GLOBAL_FIELDS: { name: keyof GlobalContent; label: string; hint?: string; type?: string }[] = [
  { name: "displayName", label: "Display name", hint: "Shown in the nav, footer, and copyright." },
  { name: "focus", label: "Focus / tagline", hint: "Short subtitle under the name in the footer." },
  { name: "email", label: "Email", type: "email", hint: "Used for the contact page email link." },
  { name: "linkedInHandle", label: "LinkedIn handle", hint: "The part after linkedin.com/in/" },
  { name: "instagramHandle", label: "Instagram handle", hint: "Without the @" },
];

const SEO_FIELDS: { name: keyof SeoForm; label: string; hint?: string; multiline?: boolean }[] = [
  { name: "title", label: "Site title", hint: "Default browser/tab title and homepage <title>." },
  { name: "titleTemplate", label: "Title template", hint: 'Per-page title pattern. Use "%s" for the page name, e.g. "%s | Tayler Carney".' },
  { name: "description", label: "Meta description", hint: "Shown in search results.", multiline: true },
  { name: "keywords", label: "Keywords", hint: "Comma-separated." },
  { name: "ogTitle", label: "Social (OpenGraph) title", hint: "Title used when the site is shared." },
  { name: "ogDescription", label: "Social (OpenGraph) description", hint: "Description used when shared.", multiline: true },
];

const toSeoForm = (seo: SeoContent): SeoForm => ({ ...seo, keywords: seo.keywords.join(", ") });

type Status = { ok: boolean; message: string } | null;

export default function SettingsForm({
  id,
  initialGlobal,
  initialSeo,
}: {
  id: string;
  initialGlobal: GlobalContent;
  initialSeo: SeoContent;
}) {
  const [global, setGlobal] = useState<GlobalContent>(initialGlobal);
  const [seo, setSeo] = useState<SeoForm>(() => toSeoForm(initialSeo));
  // Baselines for the dirty check — these track the last *saved* (and sanitized)
  // values, not the original props, so "dirty" stays correct across saves.
  const [savedGlobal, setSavedGlobal] = useState<GlobalContent>(initialGlobal);
  const [savedSeo, setSavedSeo] = useState<SeoForm>(() => toSeoForm(initialSeo));
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingSeo, setSavingSeo] = useState(false);
  const [globalStatus, setGlobalStatus] = useState<Status>(null);
  const [seoStatus, setSeoStatus] = useState<Status>(null);

  const globalDirty = (Object.keys(savedGlobal) as (keyof GlobalContent)[]).some(
    (k) => global[k] !== savedGlobal[k]
  );
  const seoDirty = (Object.keys(savedSeo) as (keyof SeoForm)[]).some(
    (k) => seo[k] !== savedSeo[k]
  );

  useUnsavedChanges(globalDirty || seoDirty);

  async function saveGlobal(e: React.FormEvent) {
    e.preventDefault();
    setSavingGlobal(true);
    setGlobalStatus(null);
    const res = await updateGlobal(id, global);
    setSavingGlobal(false);
    if ("error" in res) {
      setGlobalStatus({ ok: false, message: res.error });
      return;
    }
    setGlobal(res.global);
    setSavedGlobal(res.global);
    setGlobalStatus({ ok: true, message: "Saved." });
  }

  async function saveSeo(e: React.FormEvent) {
    e.preventDefault();
    setSavingSeo(true);
    setSeoStatus(null);
    const res = await updateSeo(id, seo);
    setSavingSeo(false);
    if ("error" in res) {
      setSeoStatus({ ok: false, message: res.error });
      return;
    }
    const savedForm = toSeoForm(res.seo);
    setSeo(savedForm);
    setSavedSeo(savedForm);
    setSeoStatus({ ok: true, message: "Saved." });
  }

  return (
    <>
      <form className={styles.form} onSubmit={saveGlobal}>
        <h2 className={styles.sectionTitle}>Identity</h2>
        {GLOBAL_FIELDS.map((field) => (
          <div key={field.name} className={styles.field}>
            <label htmlFor={field.name} className={styles.label}>
              {field.label}
            </label>
            {field.hint && <span className={styles.hint}>{field.hint}</span>}
            <input
              id={field.name}
              name={field.name}
              type={field.type ?? "text"}
              className={styles.input}
              value={global[field.name]}
              onChange={(e) => {
                setGlobal((v) => ({ ...v, [field.name]: e.target.value }));
                setGlobalStatus(null);
              }}
            />
          </div>
        ))}

        <div className={styles.actions}>
          <button type="submit" className={styles.button} disabled={savingGlobal || !globalDirty}>
            {savingGlobal ? "Saving…" : "Save identity"}
          </button>
          {globalStatus && (
            <span className={globalStatus.ok ? styles.success : styles.error} role="status">
              {globalStatus.message}
            </span>
          )}
        </div>
      </form>

      <form className={styles.form} onSubmit={saveSeo}>
        <h2 className={styles.sectionTitle}>SEO &amp; social</h2>
        {SEO_FIELDS.map((field) => (
          <div key={field.name} className={styles.field}>
            <label htmlFor={field.name} className={styles.label}>
              {field.label}
            </label>
            {field.hint && <span className={styles.hint}>{field.hint}</span>}
            {field.multiline ? (
              <textarea
                id={field.name}
                name={field.name}
                rows={3}
                className={styles.input}
                value={seo[field.name]}
                onChange={(e) => {
                  setSeo((v) => ({ ...v, [field.name]: e.target.value }));
                  setSeoStatus(null);
                }}
              />
            ) : (
              <input
                id={field.name}
                name={field.name}
                type="text"
                className={styles.input}
                value={seo[field.name]}
                onChange={(e) => {
                  setSeo((v) => ({ ...v, [field.name]: e.target.value }));
                  setSeoStatus(null);
                }}
              />
            )}
          </div>
        ))}

        <div className={styles.actions}>
          <button type="submit" className={styles.button} disabled={savingSeo || !seoDirty}>
            {savingSeo ? "Saving…" : "Save SEO"}
          </button>
          {seoStatus && (
            <span className={seoStatus.ok ? styles.success : styles.error} role="status">
              {seoStatus.message}
            </span>
          )}
        </div>
      </form>
    </>
  );
}
