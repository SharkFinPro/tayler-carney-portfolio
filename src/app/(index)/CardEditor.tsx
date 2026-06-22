"use client";

import { useState } from "react";
import EditModal, { fieldStyles as styles } from "@/components/EditModal";
import type { HomeDestination } from "@/lib/home";

interface CardEditorProps {
  /** "Edit card" vs "Add card" heading. */
  mode: "edit" | "add";
  initial: HomeDestination;
  onClose: () => void;
  onSave: (card: HomeDestination) => Promise<string | null>;
}

/**
 * Editor for a single "Explore the Site" card. One card per modal — far easier
 * to focus on than one giant list — and the same form backs both editing an
 * existing card and adding a new one.
 */
export default function CardEditor({ mode, initial, onClose, onSave }: CardEditorProps) {
  const [ref, setRef] = useState(initial.ref);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [tag, setTag] = useState(initial.tag);
  const [href, setHref] = useState(initial.href);

  function save() {
    // Size is positional (set by drag order), so it's passed through untouched
    // here and normalized by the list when the card is saved.
    return onSave({ ref, title, description, tag, href, size: initial.size });
  }

  return (
    <EditModal title={mode === "add" ? "Add card" : "Edit card"} onClose={onClose} onSave={save}>
      <label className={styles.formField}>
        <span className={styles.editFieldLabel}>Reference</span>
        <input
          className={styles.editInput}
          value={ref}
          placeholder="Sec. 01"
          onChange={(e) => setRef(e.target.value)}
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.editFieldLabel}>Title</span>
        <input className={styles.editInput} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>

      <label className={styles.formField}>
        <span className={styles.editFieldLabel}>Description</span>
        <textarea
          className={styles.editInput}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <div className={styles.formRow}>
        <label className={styles.formField}>
          <span className={styles.editFieldLabel}>Tag</span>
          <input className={styles.editInput} value={tag} onChange={(e) => setTag(e.target.value)} />
        </label>
        <label className={styles.formField}>
          <span className={styles.editFieldLabel}>Link</span>
          <input className={styles.editInput} value={href} onChange={(e) => setHref(e.target.value)} />
        </label>
      </div>
    </EditModal>
  );
}
