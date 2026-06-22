"use client";

import { useState } from "react";
import { updateSiteSettings } from "@/app/admin/contentActions";
import styles from "./Settings.module.scss";

type Fields = {
  displayName: string;
  focus: string;
  email: string;
  linkedInHandle: string;
  instagramHandle: string;
};

const FIELDS: { name: keyof Fields; label: string; hint?: string; type?: string }[] = [
  { name: "displayName", label: "Display name", hint: "Shown in the footer and copyright." },
  { name: "focus", label: "Focus / tagline", hint: "Short subtitle under the name in the footer." },
  { name: "email", label: "Email", type: "email", hint: "Used for the contact page email link." },
  { name: "linkedInHandle", label: "LinkedIn handle", hint: "The part after linkedin.com/in/" },
  { name: "instagramHandle", label: "Instagram handle", hint: "Without the @" },
];

export default function SettingsForm({ id, initial }: { id: string; initial: Fields }) {
  const [values, setValues] = useState<Fields>(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const dirty = (Object.keys(initial) as (keyof Fields)[]).some((k) => values[k] !== initial[k]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    const res = await updateSiteSettings(id, values);
    setSaving(false);
    if ("error" in res && res.ok === false) {
      setStatus({ ok: false, message: res.error });
      return;
    }
    setStatus({ ok: true, message: "Saved." });
  }

  return (
    <form className={styles.form} onSubmit={save}>
      {FIELDS.map((f) => (
        <div key={f.name} className={styles.field}>
          <label htmlFor={f.name} className={styles.label}>
            {f.label}
          </label>
          {f.hint && <span className={styles.hint}>{f.hint}</span>}
          <input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            className={styles.input}
            value={values[f.name]}
            onChange={(e) => {
              setValues((v) => ({ ...v, [f.name]: e.target.value }));
              setStatus(null);
            }}
          />
        </div>
      ))}

      <div className={styles.actions}>
        <button type="submit" className={styles.button} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {status && (
          <span className={status.ok ? styles.success : styles.error} role="status">
            {status.message}
          </span>
        )}
      </div>
    </form>
  );
}
