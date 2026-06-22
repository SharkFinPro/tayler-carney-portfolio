"use client";

import { useState } from "react";
import { updateContentField } from "@/app/admin/contentActions";
import styles from "./EditableText.module.scss";

interface EditableTextProps {
  model: string;
  id: string;
  field: string;
  value: string | string[];
  editable?: boolean;
  multiline?: boolean;
  /** What visitors (and admins not editing) see. */
  children: React.ReactNode;
}

/**
 * Wraps a whitelisted CMS scalar/list field with an inline edit affordance.
 * When `editable` is false it simply renders `children`, so visitors see no
 * change. After a successful save the optimistic `display` value masks the
 * read-CDN lag (we deliberately do not revalidate).
 */
export default function EditableText({
  model,
  id,
  field,
  value,
  editable = false,
  multiline = false,
  children,
}: EditableTextProps) {
  const isList = Array.isArray(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(isList ? (value as string[]).join(", ") : (value as string));
  const [display, setDisplay] = useState<React.ReactNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!editable) return <>{children}</>;

  async function save() {
    setSaving(true);
    setError(null);
    const next: string | string[] = isList
      ? draft.split(",").map((s) => s.trim()).filter(Boolean)
      : draft;
    const res = await updateContentField(model, id, field, next);
    setSaving(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setDisplay(Array.isArray(next) ? next.join(", ") : next);
    setEditing(false);
  }

  function cancel() {
    setDraft(isList ? (value as string[]).join(", ") : (value as string));
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span className={styles.wrap}>
        {display ?? children}
        <button
          type="button"
          className={styles.editBtn}
          aria-label={`Edit ${field}`}
          onClick={() => setEditing(true)}
        >
          ✎
        </button>
      </span>
    );
  }

  return (
    <span className={styles.editor}>
      {multiline ? (
        <textarea
          className={styles.textarea}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`Edit ${field}`}
          autoFocus
        />
      ) : (
        <input
          className={styles.input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`Edit ${field}`}
          autoFocus
        />
      )}
      <button type="button" className={styles.actionBtn} onClick={save} disabled={saving} aria-label="Save">
        {saving ? "…" : "✓"}
      </button>
      <button type="button" className={styles.actionBtn} onClick={cancel} disabled={saving} aria-label="Cancel">
        ✕
      </button>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
