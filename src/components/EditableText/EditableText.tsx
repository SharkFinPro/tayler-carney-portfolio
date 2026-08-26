"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen, faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { updateContentField } from "@/app/admin/contentActions";
import styles from "./EditableText.module.scss";

interface EditableTextProps {
  /** Required for the default CMS save path; omit when `onSave` is supplied. */
  model?: string;
  id?: string;
  field?: string;
  value: string | string[];
  editable?: boolean;
  multiline?: boolean;
  /**
   * Human name for this field, announced by assistive tech and shown in the
   * edit tooltip. Without it the accessible name falls back to the raw CMS
   * field name ("Edit description"), leaking schema vocabulary into the UI —
   * and on the homepage's nested JSON fields those names are less
   * recognizable still.
   */
  label?: string;
  /** Take the pencil out of flow (for headings/gradient text that must not reflow). */
  floatEdit?: boolean;
  /**
   * Custom persistence. When provided it replaces the default
   * `updateContentField(model, id, field, …)` call — used for content that
   * doesn't map to a single whitelisted CMS scalar (e.g. nested homepage JSON).
   */
  onSave?: (next: string | string[]) => Promise<{ error: string } | { ok: true }>;
  /** What visitors (and admins not editing) see. */
  children: React.ReactNode;
}

/**
 * Wraps a whitelisted CMS scalar/list field with an inline edit affordance.
 * When `editable` is false it simply renders `children`, so visitors see no
 * change. While editing, the field is swapped in place — it inherits the
 * surrounding type and fills the same visual area, so there is no popup and no
 * major layout shift. After a successful save the optimistic `display` value
 * masks the read-CDN lag (we deliberately do not revalidate).
 */
export default function EditableText({
  model,
  id,
  field,
  value,
  label,
  editable = false,
  multiline = false,
  floatEdit = false,
  onSave,
  children,
}: EditableTextProps) {
  const isList = Array.isArray(value);
  // Prefer the human label; fall back to the field name only when none is given.
  const name = label ?? field ?? "text";
  // A list is always edited as a textarea, one item per line, regardless of
  // what the caller passed for `multiline`.
  const useTextarea = multiline || isList;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(isList ? (value as string[]).join("\n") : (value as string));
  const [display, setDisplay] = useState<React.ReactNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow the textarea to fit its content so multiline edits occupy the same
  // space the rendered text would.
  function autosize(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  // Focus (and select) the field when editing begins.
  useEffect(() => {
    if (!editing) return;
    const el = useTextarea ? textareaRef.current : inputRef.current;
    el?.focus();
    el?.select();
    if (useTextarea) autosize(textareaRef.current);
  }, [editing, useTextarea]);

  if (!editable) return <>{children}</>;

  async function save() {
    setSaving(true);
    setError(null);
    const next: string | string[] = isList
      ? draft.split("\n").map((s) => s.trim()).filter(Boolean)
      : draft;
    const res = onSave
      ? await onSave(next)
      : await updateContentField(model!, id!, field!, next);
    setSaving(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setDisplay(Array.isArray(next) ? next.join(", ") : next);
    setEditing(false);
  }

  function cancel() {
    setDraft(isList ? (value as string[]).join("\n") : (value as string));
    setError(null);
    setEditing(false);
  }

  // Esc cancels; Enter saves (Ctrl/Cmd+Enter for multiline so newlines still work).
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && (!useTextarea || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (!saving) save();
    }
  }

  if (!editing) {
    return (
      <span className={`${styles.wrap} ${floatEdit ? styles.wrapFloat : ""}`}>
        {display ?? children}
        <button
          type="button"
          className={styles.editBtn}
          aria-label={`Edit ${name}`}
          title={`Edit ${name}`}
          onClick={() => setEditing(true)}
        >
          <FontAwesomeIcon icon={faPen} />
        </button>
      </span>
    );
  }

  return (
    <span className={`${styles.wrap} ${styles.editing}`}>
      {useTextarea ? (
        <textarea
          ref={textareaRef}
          className={`${styles.field} ${styles.textarea}`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            autosize(e.target);
          }}
          onKeyDown={onKeyDown}
          rows={1}
          aria-label={`Edit ${name}`}
        />
      ) : (
        <input
          ref={inputRef}
          className={styles.field}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label={`Edit ${name}`}
        />
      )}

      {isList && (
        <span className={styles.hint}>One item per line</span>
      )}

      <span className={styles.controls} contentEditable={false}>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.save}`}
          onClick={save}
          disabled={saving}
          aria-label="Save"
          title="Save (Enter)"
        >
          <FontAwesomeIcon icon={faCheck} />
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={cancel}
          disabled={saving}
          aria-label="Cancel"
          title="Cancel (Esc)"
        >
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </span>

      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
