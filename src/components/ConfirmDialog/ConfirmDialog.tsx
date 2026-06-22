"use client";

import { ReactNode, useId, useState } from "react";
import Modal from "@/components/Modal";
import styles from "./ConfirmDialog.module.scss";

interface ConfirmDialogProps {
  /** Heading, e.g. "Delete this card?". */
  title: string;
  /** Optional supporting copy below the title. */
  message?: ReactNode;
  /** Confirm button label. Defaults to "Delete". */
  confirmLabel?: string;
  /** Label shown on the confirm button while the action runs. Defaults to "Deleting…". */
  busyLabel?: string;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /**
   * Run the destructive action. Resolves to an error string to surface inline
   * (dialog stays open), or null/undefined on success (dialog closes).
   */
  onConfirm: () => Promise<string | null> | void;
  onClose: () => void;
}

/**
 * Reusable confirmation dialog for permanent/destructive actions — a real,
 * accessible modal in place of the browser's `window.confirm`. The dialog owns
 * its busy and error state: `onConfirm` may be async and return an error string
 * to keep the dialog open with the message shown, or resolve cleanly to close.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  busyLabel = "Deleting…",
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  async function confirm() {
    setBusy(true);
    setError(null);
    const err = await onConfirm();
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  }

  return (
    <Modal
      onClose={() => {
        if (!busy) onClose();
      }}
      labelledBy={titleId}
      overlayClassName={styles.overlay}
    >
      <div className={styles.panel}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {message && <p className={styles.message}>{message}</p>}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={styles.confirm} onClick={confirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
