"use client";

import { useState } from "react";
import { updateGlobal, updateSeo } from "@/app/admin/contentActions";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";
import AssetPicker from "@/components/AssetPicker";
import { MAX_NAV_ITEMS, type GlobalContent, type NavItem } from "@/lib/global";
import { SEO_PAGE_KEYS, type SeoContent, type SeoPage, type SeoPageKey } from "@/lib/seo";
import styles from "./Settings.module.scss";

// SEO keywords are edited as a single comma-separated line; the sanitizer also
// accepts an array, but the form keeps it as a string for a simple input.
type SeoForm = Omit<SeoContent, "keywords"> & { keywords: string };

type GlobalTextField = {
  [K in keyof GlobalContent]: GlobalContent[K] extends string ? K : never;
}[keyof GlobalContent];

const GLOBAL_FIELDS: { name: GlobalTextField; label: string; hint?: string; type?: string }[] = [
  { name: "displayName", label: "Display name", hint: "Shown in the nav, footer, and copyright." },
  { name: "focus", label: "Focus / tagline", hint: "Short subtitle under the name in the footer." },
  { name: "email", label: "Email", type: "email", hint: "Used for the contact page email link." },
  { name: "linkedInHandle", label: "LinkedIn handle", hint: "The part after linkedin.com/in/" },
  { name: "instagramHandle", label: "Instagram handle", hint: "Without the @" },
];

type SeoTextField = {
  [K in keyof SeoForm]: SeoForm[K] extends string ? K : never;
}[keyof SeoForm];

const SEO_FIELDS: { name: SeoTextField; label: string; hint?: string; multiline?: boolean }[] = [
  { name: "title", label: "Site title", hint: "Default browser/tab title and homepage <title>." },
  { name: "titleTemplate", label: "Title template", hint: 'Per-page title pattern. Use "%s" for the page name, e.g. "%s | Tayler Carney".' },
  { name: "description", label: "Meta description", hint: "Shown in search results.", multiline: true },
  { name: "keywords", label: "Keywords", hint: "Comma-separated." },
  { name: "ogTitle", label: "Social (OpenGraph) title", hint: "Title used when the site is shared." },
  { name: "ogDescription", label: "Social (OpenGraph) description", hint: "Description used when shared.", multiline: true },
];

const toSeoForm = (seo: SeoContent): SeoForm => ({ ...seo, keywords: seo.keywords.join(", ") });

// Human labels for the per-route overrides. Project pages are absent on
// purpose: they already derive their metadata from the project's own editable
// title and description.
const PAGE_LABELS: Record<SeoPageKey, string> = {
  home: "Home",
  portfolio: "Portfolio",
  atelier: "Atelier",
  about: "About",
  contact: "Contact",
};

type Status = { ok: boolean; message: string } | null;

/** Display info for the currently referenced resume asset. */
export type ResumeDisplay = { url: string; name: string };

const baseName = (fileName: string): string => fileName.replace(/\.[^.]+$/, "");

export default function SettingsForm({
  id,
  initialGlobal,
  initialSeo,
  initialResume,
}: {
  id: string;
  initialGlobal: GlobalContent;
  initialSeo: SeoContent;
  /** Resolved server-side from `initialGlobal.resumeAssetId`; null when unset or the asset is gone. */
  initialResume: ResumeDisplay | null;
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
  const [resumePickerOpen, setResumePickerOpen] = useState(false);
  // Local display info for the referenced asset; the saved value is only the
  // asset id (public pages re-resolve it on render, so renames propagate).
  const [resume, setResume] = useState<ResumeDisplay | null>(initialResume);

  const globalDirty = (Object.keys(savedGlobal) as (keyof GlobalContent)[]).some(
    (k) => global[k] !== savedGlobal[k]
  );
  const seoDirty = (Object.keys(savedSeo) as (keyof SeoForm)[]).some(
    (k) => seo[k] !== savedSeo[k]
  );

  useUnsavedChanges(globalDirty || seoDirty);

  // --- Navigation editing -----------------------------------------------
  // Kept as plain array operations rather than reusing the block editor's
  // drag hook: this is a short list of two-field rows, and up/down buttons are
  // both simpler and more accessible than a pointer-drag affordance here.

  function setNav(next: NavItem[]) {
    setGlobal((v) => ({ ...v, navItems: next }));
    setGlobalStatus(null);
  }

  function updateNavItem(index: number, patch: Partial<NavItem>) {
    setNav(global.navItems.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addNavItem() {
    if (global.navItems.length >= MAX_NAV_ITEMS) return;
    setNav([...global.navItems, { label: "", href: "" }]);
  }

  function removeNavItem(index: number) {
    setNav(global.navItems.filter((_, i) => i !== index));
  }

  function moveNavItem(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= global.navItems.length) return;
    const next = [...global.navItems];
    [next[index], next[target]] = [next[target], next[index]];
    setNav(next);
  }

  function updatePage(key: SeoPageKey, patch: Partial<SeoPage>) {
    setSeo((v) => ({ ...v, pages: { ...v.pages, [key]: { ...v.pages[key], ...patch } } }));
    setSeoStatus(null);
  }

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

        <div className={styles.field}>
          <span className={styles.label}>Navigation</span>
          <span className={styles.hint}>
            The menu shown in the header and the footer. Links can be a path on this site
            (<code>/portfolio</code>), an anchor (<code>#studio</code>), or a full external URL.
            An entry needs both a label and a link to appear.
          </span>

          <ul className={styles.navList}>
            {global.navItems.map((item, index) => (
              <li key={index} className={styles.navRow}>
                <input
                  className={styles.input}
                  aria-label={`Navigation label ${index + 1}`}
                  placeholder="Label"
                  value={item.label}
                  onChange={(e) => updateNavItem(index, { label: e.target.value })}
                />
                <input
                  className={styles.input}
                  aria-label={`Navigation link ${index + 1}`}
                  placeholder="/path"
                  value={item.href}
                  onChange={(e) => updateNavItem(index, { href: e.target.value })}
                />
                <div className={styles.navRowActions}>
                  <button
                    type="button"
                    className={styles.navMove}
                    onClick={() => moveNavItem(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${item.label || `item ${index + 1}`} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.navMove}
                    onClick={() => moveNavItem(index, 1)}
                    disabled={index === global.navItems.length - 1}
                    aria-label={`Move ${item.label || `item ${index + 1}`} down`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className={styles.navRemove}
                    onClick={() => removeNavItem(index)}
                    aria-label={`Remove ${item.label || `item ${index + 1}`}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {global.navItems.length === 0 && (
            <p className={styles.hint}>
              No navigation items — the header and footer menus will be empty.
            </p>
          )}

          <button
            type="button"
            className={styles.navAdd}
            onClick={addNavItem}
            disabled={global.navItems.length >= MAX_NAV_ITEMS}
          >
            + Add link
          </button>
          {global.navItems.length >= MAX_NAV_ITEMS && (
            <span className={styles.hint}>
              {MAX_NAV_ITEMS} is the most the header layout holds.
            </span>
          )}
        </div>

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

        <div className={styles.field}>
          <span className={styles.label}>Resume</span>
          <span className={styles.hint}>
            A PDF from the Media Library, offered as a download on the Contact page and in the
            footer. The file is referenced live — renaming or replacing it in the Media Library
            updates it everywhere. Remove it to hide those links.
          </span>
          <div className={styles.assetRow}>
            {global.resumeAssetId ? (
              <>
                {resume ? (
                  <a
                    href={resume.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.assetName}
                    title={resume.name}
                  >
                    {resume.name}
                  </a>
                ) : (
                  <span className={styles.assetEmpty}>
                    The selected PDF no longer exists in the Media Library.
                  </span>
                )}
                <button
                  type="button"
                  className={styles.assetBtn}
                  onClick={() => setResumePickerOpen(true)}
                >
                  Change…
                </button>
                <button
                  type="button"
                  className={`${styles.assetBtn} ${styles.assetBtnDanger}`}
                  onClick={() => {
                    setGlobal((v) => ({ ...v, resumeAssetId: "" }));
                    setResume(null);
                    setGlobalStatus(null);
                  }}
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <span className={styles.assetEmpty}>No resume selected.</span>
                <button
                  type="button"
                  className={styles.assetBtn}
                  onClick={() => setResumePickerOpen(true)}
                >
                  Select PDF…
                </button>
              </>
            )}
          </div>
        </div>

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

        <h2 className={styles.sectionTitle}>Page titles &amp; descriptions</h2>
        <p className={styles.hint}>
          What each page shows in search results. Leave a description blank to fall back to the
          site description above. Project pages aren&rsquo;t listed here — they use each
          project&rsquo;s own title and description.
        </p>

        {SEO_PAGE_KEYS.map((key) => (
          <fieldset key={key} className={styles.pageGroup}>
            <legend className={styles.pageLegend}>{PAGE_LABELS[key]}</legend>

            <div className={styles.field}>
              <label htmlFor={`seo-${key}-title`} className={styles.label}>
                Title
              </label>
              <input
                id={`seo-${key}-title`}
                className={styles.input}
                value={seo.pages[key].title}
                onChange={(e) => updatePage(key, { title: e.target.value })}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor={`seo-${key}-description`} className={styles.label}>
                Description
              </label>
              <textarea
                id={`seo-${key}-description`}
                className={`${styles.input} ${styles.textarea}`}
                rows={2}
                placeholder="Falls back to the site description"
                value={seo.pages[key].description}
                onChange={(e) => updatePage(key, { description: e.target.value })}
              />
            </div>
          </fieldset>
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

      {resumePickerOpen && (
        <AssetPicker
          kind="document"
          onClose={() => setResumePickerOpen(false)}
          onSelect={(asset) => {
            setGlobal((v) => ({ ...v, resumeAssetId: asset.id }));
            setResume({ url: asset.url, name: asset.title?.trim() || baseName(asset.fileName) });
            setGlobalStatus(null);
          }}
        />
      )}
    </>
  );
}
