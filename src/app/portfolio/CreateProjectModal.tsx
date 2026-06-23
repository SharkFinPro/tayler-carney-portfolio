"use client";

import { useState } from "react";
import EditModal, { fieldStyles as styles } from "@/components/EditModal";
import { createProject } from "@/app/admin/portfolioActions";
import { slugify } from "@/lib/portfolio";
import type { ProjectRow } from "./PortfolioClient";

interface CreateProjectModalProps {
  onClose: () => void;
  /** Called with the newly created project so the page can show it immediately. */
  onCreated: (project: ProjectRow) => void;
}

/**
 * "New project" dialog. Collects only the basic fields needed to spin up a
 * project page — title, slug, and a short description. The block-based layout
 * of the page itself is authored later on the project page, not here.
 */
export default function CreateProjectModal({ onClose, onCreated }: CreateProjectModalProps) {
  const [title, setTitle] = useState("");
  // The slug auto-follows the title until the admin edits it directly, after
  // which we stop overwriting their choice.
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");

  const effectiveSlug = slugTouched ? slug : slugify(title);

  async function save(): Promise<string | null> {
    const res = await createProject({ title, slug: effectiveSlug, description });
    if ("error" in res) return res.error;
    onCreated(res.project);
    return null;
  }

  return (
    <EditModal title="New project" onClose={onClose} onSave={save}>
      <label className={styles.formField}>
        <span className={styles.editFieldLabel}>Title</span>
        <input
          className={styles.editInput}
          value={title}
          placeholder="Structural Coat 01"
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      <label className={styles.formField}>
        <span className={styles.editFieldLabel}>Slug</span>
        <input
          className={styles.editInput}
          value={effectiveSlug}
          placeholder="structural-coat-01"
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
        />
        <span className={styles.editFieldHint}>The project URL: /portfolio/{effectiveSlug || "…"}</span>
      </label>

      <label className={styles.formField}>
        <span className={styles.editFieldLabel}>Description</span>
        <textarea
          className={styles.editInput}
          rows={3}
          value={description}
          placeholder="A short summary shown on the portfolio index."
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
    </EditModal>
  );
}
