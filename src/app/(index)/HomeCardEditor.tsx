"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical, faTrash, faPlus } from "@fortawesome/free-solid-svg-icons";
import Modal from "@/components/Modal/Modal";
import { useDragReorder } from "@/components/blocks/useDragReorder";
import styles from "./Home.module.scss";

// A column descriptor for one editable field on a card row.
export type Column<T> = {
  key: keyof T;
  label: string;
  type?: "text" | "multiline" | "select";
  options?: { value: string; label: string }[];
};

type WithId<T> = T & { _id: string };

interface HomeCardEditorProps<T> {
  title: string;
  /** Singular noun for the add button, e.g. "stat" / "card". */
  itemNoun: string;
  initial: T[];
  columns: Column<T>[];
  makeEmpty: () => T;
  onClose: () => void;
  /** Persist the edited list. Resolves to an error string on failure. */
  onSave: (items: T[]) => Promise<string | null>;
}

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());

/**
 * Generic modal editor for a repeatable list of flat string-keyed cards.
 * Rows can be edited in place, reordered by dragging the grip (or arrow keys for
 * keyboards), added, and removed. Nothing is written until "Save" — the parent
 * owns persistence. Drag/keyboard reordering reuses the same `useDragReorder`
 * hook the block editor uses.
 */
export default function HomeCardEditor<T extends Record<string, string>>({
  title,
  itemNoun,
  initial,
  columns,
  makeEmpty,
  onClose,
  onSave,
}: HomeCardEditorProps<T>) {
  const [items, setItems] = useState<WithId<T>[]>(() =>
    initial.map((it) => ({ ...it, _id: newId() }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const drag = useDragReorder<WithId<T>>({
    items,
    setItems,
    getKey: (it) => it._id,
    onCommit: () => {}, // committed on explicit Save, not per-move
  });

  function patch(id: string, key: keyof T, value: string) {
    setItems((prev) => prev.map((it) => (it._id === id ? { ...it, [key]: value } : it)));
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((it) => it._id !== id));
  }

  function add() {
    setItems((prev) => [...prev, { ...makeEmpty(), _id: newId() }]);
  }

  async function save() {
    setSaving(true);
    setError(null);
    // Strip the transient _id before handing the list back to the parent.
    const clean = items.map(({ _id, ...rest }) => rest as unknown as T);
    const err = await onSave(clean);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  }

  function renderRow(item: WithId<T>, index: number, floating = false) {
    return (
      <div
        ref={floating ? undefined : drag.registerCard(item._id)}
        className={`${styles.editRow} ${floating ? styles.editRowFloating : ""}`}
      >
        <button
          type="button"
          className={styles.dragHandle}
          aria-label={`Reorder ${itemNoun}. Press arrow keys to move, or drag.`}
          onPointerDown={(e) => drag.startDrag(index, item._id, e)}
          onKeyDown={drag.keyboardReorder(item._id)}
        >
          <FontAwesomeIcon icon={faGripVertical} />
        </button>

        <div className={styles.editFields}>
          {columns.map((col) => {
            const id = `${item._id}-${String(col.key)}`;
            const value = item[col.key] ?? "";
            return (
              <label key={String(col.key)} className={styles.editField}>
                <span className={styles.editFieldLabel}>{col.label}</span>
                {col.type === "multiline" ? (
                  <textarea
                    id={id}
                    className={styles.editInput}
                    rows={2}
                    value={value}
                    onChange={(e) => patch(item._id, col.key, e.target.value)}
                  />
                ) : col.type === "select" ? (
                  <select
                    id={id}
                    className={styles.editInput}
                    value={value}
                    onChange={(e) => patch(item._id, col.key, e.target.value)}
                  >
                    {col.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    className={styles.editInput}
                    value={value}
                    onChange={(e) => patch(item._id, col.key, e.target.value)}
                  />
                )}
              </label>
            );
          })}
        </div>

        <button
          type="button"
          className={styles.removeBtn}
          aria-label={`Remove ${itemNoun}`}
          onClick={() => remove(item._id)}
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>
      </div>
    );
  }

  const draggingItem = drag.draggingKey ? items.find((it) => it._id === drag.draggingKey) : null;

  return (
    <Modal onClose={onClose} overlayClassName={styles.modalOverlay} labelledBy="home-card-editor-title">
      <div className={styles.modalPanel}>
        <div className={styles.modalHeader}>
          <h2 id="home-card-editor-title" className={styles.modalTitle}>
            {title}
          </h2>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="srOnly" role="status" aria-live="polite">
          {drag.announcement}
        </div>

        <div className={styles.editList}>
          {items.length === 0 && <p className={styles.editEmpty}>No {itemNoun}s yet.</p>}
          {items.map((item, index) =>
            item._id === drag.draggingKey ? (
              <div
                key={item._id}
                className={styles.editPlaceholder}
                style={{ height: drag.size.h }}
              />
            ) : (
              <div key={item._id}>{renderRow(item, index)}</div>
            )
          )}
        </div>

        <button type="button" className={styles.addBtn} onClick={add}>
          <FontAwesomeIcon icon={faPlus} /> Add {itemNoun}
        </button>

        {error && (
          <p className={styles.editError} role="alert">
            {error}
          </p>
        )}

        <div className={styles.modalActions}>
          <button type="button" className={styles.modalCancel} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className={styles.modalSave} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {draggingItem && (
        <div className={styles.editFloatingLayer} style={drag.floatingStyle}>
          {renderRow(draggingItem, 0, true)}
        </div>
      )}
    </Modal>
  );
}
