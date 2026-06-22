"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPen } from "@fortawesome/free-solid-svg-icons";
import EditModal, { fieldStyles as f } from "@/components/EditModal";
import { updateContentField } from "@/app/admin/contentActions";
import styles from "./Contact.module.scss";

interface ContactEditorProps {
  id: string;
  header: string;
  subheader: string;
  availabilityMessage: string;
  /** Admins get the edit affordance; everyone else just sees the copy. */
  editable?: boolean;
}

/**
 * Renders the contact page's editable left-panel copy (header, subheader and
 * availability message). For admins it adds a single pencil that opens the
 * shared {@link EditModal} to edit all three fields at once — replacing the old
 * per-field inline editors with one popup, reusing the homepage modal chrome.
 */
export default function ContactEditor({
  id,
  header: initialHeader,
  subheader: initialSubheader,
  availabilityMessage: initialAvailability,
  editable = false,
}: ContactEditorProps) {
  // Live (optimistic) values shown on the page.
  const [header, setHeader] = useState(initialHeader);
  const [subheader, setSubheader] = useState(initialSubheader);
  const [availability, setAvailability] = useState(initialAvailability);

  const [open, setOpen] = useState(false);

  // Modal-local drafts so a Cancel discards unsaved edits.
  const [headerDraft, setHeaderDraft] = useState(header);
  const [subheaderDraft, setSubheaderDraft] = useState(subheader);
  const [availabilityDraft, setAvailabilityDraft] = useState(availability);

  function openModal() {
    setHeaderDraft(header);
    setSubheaderDraft(subheader);
    setAvailabilityDraft(availability);
    setOpen(true);
  }

  // Persist only the changed fields, then sync optimistic state. We deliberately
  // do not revalidate (matching the rest of the admin UI) — the read CDN lags,
  // so the optimistic values mask it. Returns an error string or null.
  async function save(): Promise<string | null> {
    const edits: Array<[string, string, () => void]> = [];
    if (headerDraft !== header) edits.push(["header", headerDraft, () => setHeader(headerDraft)]);
    if (subheaderDraft !== subheader)
      edits.push(["subheader", subheaderDraft, () => setSubheader(subheaderDraft)]);
    if (availabilityDraft !== availability)
      edits.push(["availabilityMessage", availabilityDraft, () => setAvailability(availabilityDraft)]);

    for (const [field, value] of edits) {
      const res = await updateContentField("ContactPage", id, field, value);
      if ("error" in res) return res.error;
    }
    edits.forEach(([, , commit]) => commit());
    return null;
  }

  return (
    <>
      <div className={styles.leftTop}>
        <span className={styles.eyebrow}>Contact</span>
        <h1 className={styles.headline}>{header}</h1>
        <p className={styles.subtext}>{subheader}</p>
        {editable && (
          <button type="button" className={styles.editButton} onClick={openModal}>
            <FontAwesomeIcon icon={faPen} /> Edit contact copy
          </button>
        )}
      </div>
      <div className={styles.availability}>
        <span className={styles.availabilityDot} aria-hidden="true" />
        <span className={styles.availabilityText}>{availability}</span>
      </div>

      {open && (
        <EditModal title="Edit contact copy" onClose={() => setOpen(false)} onSave={save}>
          <label className={f.formField}>
            <span className={f.editFieldLabel}>Header</span>
            <input
              className={f.editInput}
              value={headerDraft}
              onChange={(e) => setHeaderDraft(e.target.value)}
            />
          </label>

          <label className={f.formField}>
            <span className={f.editFieldLabel}>Subheader</span>
            <textarea
              className={f.editInput}
              rows={3}
              value={subheaderDraft}
              onChange={(e) => setSubheaderDraft(e.target.value)}
            />
          </label>

          <label className={f.formField}>
            <span className={f.editFieldLabel}>Availability message</span>
            <input
              className={f.editInput}
              value={availabilityDraft}
              onChange={(e) => setAvailabilityDraft(e.target.value)}
            />
          </label>
        </EditModal>
      )}
    </>
  );
}
