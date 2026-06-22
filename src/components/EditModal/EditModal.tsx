"use client";

import { ReactNode, useState } from "react";
import Modal from "@/components/Modal/Modal";
import styles from "./EditModal.module.scss";

interface EditModalProps {
  title: string;
  onClose: () => void;
  /** Persist the edited content. Resolves to an error string on failure, or null on success. */
  onSave: () => Promise<string | null>;
  /** Optional extra layer (e.g. a drag floating clone) rendered outside the panel. */
  overlay?: ReactNode;
  children: ReactNode;
}

/**
 * General-purpose editing modal: panel chrome, a Save/Cancel footer, and the
 * saving state and inline error surface. Each caller supplies its own form
 * fields (styled with the exported {@link fieldStyles}) and an `onSave`. Used by
 * the homepage section editors, the contact-page editor, and anywhere else a
 * small "edit these fields" dialog is needed.
 */
export default function EditModal({ title, onClose, onSave, overlay, children }: EditModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const err = await onSave();
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  }

  return (
    <Modal onClose={onClose} overlayClassName={styles.modalOverlay} labelledBy="edit-modal-title">
      <div className={styles.modalPanel}>
        <div className={styles.modalHeader}>
          <h2 id="edit-modal-title" className={styles.modalTitle}>
            {title}
          </h2>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.modalForm}>{children}</div>

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

      {overlay}
    </Modal>
  );
}

/** Shared form-field class names (label/input/row/subhead) for modal contents. */
export const fieldStyles = styles;

export const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
