"use client";

import { useState } from "react";
import Image from "next/image";
import EditModal, { fieldStyles as f } from "@/components/EditModal";
import AssetPicker from "@/components/AssetPicker/AssetPicker";
import styles from "./Home.module.scss";
import type { HomeContent } from "@/lib/home";

type Archive = HomeContent["archive"];

interface ArchiveEditorProps {
  initial: Archive;
  onClose: () => void;
  onSave: (archive: Archive) => Promise<string | null>;
}

/**
 * Single "edit the whole archive band" widget: the label/headline/body copy, the
 * button (label + link), and the image — the image is swapped through the shared
 * media picker, so admins reuse already-uploaded assets.
 */
export default function ArchiveEditor({ initial, onClose, onSave }: ArchiveEditorProps) {
  const [label, setLabel] = useState(initial.label);
  const [headline, setHeadline] = useState(initial.headline);
  const [body, setBody] = useState(initial.body);
  const [buttonLabel, setButtonLabel] = useState(initial.buttonLabel);
  const [buttonHref, setButtonHref] = useState(initial.buttonHref);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl);
  const [imageAlt, setImageAlt] = useState(initial.imageAlt);
  const [picking, setPicking] = useState(false);

  function save() {
    return onSave({ label, headline, body, buttonLabel, buttonHref, imageUrl, imageAlt });
  }

  return (
    <EditModal title="Edit archive band" onClose={onClose} onSave={save}>
      <label className={f.formField}>
        <span className={f.editFieldLabel}>Label</span>
        <input className={f.editInput} value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>

      <label className={f.formField}>
        <span className={f.editFieldLabel}>Headline</span>
        <input className={f.editInput} value={headline} onChange={(e) => setHeadline(e.target.value)} />
      </label>

      <label className={f.formField}>
        <span className={f.editFieldLabel}>Body</span>
        <textarea className={f.editInput} rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>

      <p className={f.formSubhead}>Button</p>
      <div className={f.formRow}>
        <label className={f.formField}>
          <span className={f.editFieldLabel}>Label</span>
          <input className={f.editInput} value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} />
        </label>
        <label className={f.formField}>
          <span className={f.editFieldLabel}>Link</span>
          <input className={f.editInput} value={buttonHref} onChange={(e) => setButtonHref(e.target.value)} />
        </label>
      </div>

      <p className={f.formSubhead}>Image</p>
      <div className={styles.imageField}>
        <div className={styles.imagePreview}>
          {imageUrl ? (
            <Image src={imageUrl} alt={imageAlt} fill sizes="160px" />
          ) : (
            <span className={styles.imageEmpty}>No image</span>
          )}
        </div>
        <div className={styles.imageControls}>
          <button type="button" className={styles.addBtn} onClick={() => setPicking(true)}>
            Change image…
          </button>
          <label className={f.formField}>
            <span className={f.editFieldLabel}>Alt text</span>
            <input className={f.editInput} value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} />
          </label>
        </div>
      </div>

      {picking && (
        <AssetPicker
          onClose={() => setPicking(false)}
          onSelect={({ url, altText }) => {
            setImageUrl(url);
            if (altText && !imageAlt) setImageAlt(altText);
          }}
        />
      )}
    </EditModal>
  );
}
