"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { updateContentField } from "@/app/admin/contentActions";
import styles from "./EditableText.module.scss";

interface EditableTextProps {
  model: string;
  id: string;
  field: string;
  value: string | string[];
  editable?: boolean;
  multiline?: boolean;
  /** Take the pencil out of flow (for headings/gradient text that must not reflow). */
  floatEdit?: boolean;
  /** What visitors (and admins not editing) see. */
  children: React.ReactNode;
}

/**
 * Wraps a whitelisted CMS scalar/list field with an inline edit affordance.
 * When `editable` is false it simply renders `children`, so visitors see no
 * change. While editing, the original text stays in place and a floating panel
 * holds a roomy input — this keeps the page layout from reflowing. After a
 * successful save the optimistic `display` value masks the read-CDN lag (we
 * deliberately do not revalidate).
 */
export default function EditableText({
  model,
  id,
  field,
  value,
  editable = false,
  multiline = false,
  floatEdit = false,
  children,
}: EditableTextProps) {
  const isList = Array.isArray(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(isList ? (value as string[]).join(", ") : (value as string));
  const [display, setDisplay] = useState<React.ReactNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  // Focus the field (and select its contents) when the panel opens.
  useEffect(() => {
    if (editing) fieldRef.current?.select();
  }, [editing]);

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

  // Esc cancels; Enter saves (Ctrl/Cmd+Enter for multiline so newlines still work).
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!saving) save();
    }
  }

  return (
    <span className={`${styles.wrap} ${floatEdit ? styles.wrapFloat : ""}`}>
      {display ?? children}

      {!editing && (
        <button
          type="button"
          className={styles.editBtn}
          aria-label={`Edit ${field}`}
          title={`Edit ${field}`}
          onClick={() => setEditing(true)}
        >
          <FontAwesomeIcon icon={faPen} />
        </button>
      )}

      {editing && (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <span className={styles.panel} role="dialog" aria-label={`Edit ${field}`} onKeyDown={onKeyDown}>
          {multiline ? (
            <textarea
              ref={fieldRef}
              className={styles.textarea}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={`Edit ${field}`}
            />
          ) : (
            <input
              ref={fieldRef}
              className={styles.input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={`Edit ${field}`}
            />
          )}

          <span className={styles.controls}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.save}`}
              onClick={save}
              disabled={saving}
            >
              <FontAwesomeIcon icon={faCheck} />
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              onClick={cancel}
              disabled={saving}
              aria-label="Cancel"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </span>

          {error && (
            <span className={styles.error} role="alert">
              {error}
            </span>
          )}
          <span className={styles.hint}>
            {multiline ? "⌘/Ctrl+Enter to save · Esc to cancel" : "Enter to save · Esc to cancel"}
          </span>
        </span>
      )}
    </span>
  );
}
