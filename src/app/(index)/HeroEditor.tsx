"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical, faTrash, faPlus } from "@fortawesome/free-solid-svg-icons";
import { useDragReorder } from "@/components/blocks/useDragReorder";
import EditModal, { fieldStyles as f, newId } from "@/components/EditModal";
import styles from "./Home.module.scss";
import type { HomeContent, HomeStat } from "@/lib/home";

type Hero = HomeContent["hero"];
type StatRow = HomeStat & { _id: string };

interface HeroEditorProps {
  initial: Hero;
  onClose: () => void;
  onSave: (hero: Hero) => Promise<string | null>;
}

/**
 * Single "edit the whole hero" widget: the headline/eyebrow/subtext copy, both
 * call-to-action buttons (label + link), and the repeatable stats panel — the
 * stats reorder by dragging the grip or with arrow keys.
 */
export default function HeroEditor({ initial, onClose, onSave }: HeroEditorProps) {
  const [eyebrow, setEyebrow] = useState(initial.eyebrow);
  const [headline, setHeadline] = useState(initial.headline);
  const [subtext, setSubtext] = useState(initial.subtext);
  const [primaryLabel, setPrimaryLabel] = useState(initial.primaryCta.label);
  const [primaryHref, setPrimaryHref] = useState(initial.primaryCta.href);
  const [secondaryLabel, setSecondaryLabel] = useState(initial.secondaryCta.label);
  const [secondaryHref, setSecondaryHref] = useState(initial.secondaryCta.href);
  const [stats, setStats] = useState<StatRow[]>(() => initial.stats.map((s) => ({ ...s, _id: newId() })));

  const drag = useDragReorder<StatRow>({
    items: stats,
    setItems: setStats,
    getKey: (s) => s._id,
    onCommit: () => {}, // committed on Save
  });

  function patchStat(id: string, key: "key" | "value", value: string) {
    setStats((prev) => prev.map((s) => (s._id === id ? { ...s, [key]: value } : s)));
  }
  function removeStat(id: string) {
    setStats((prev) => prev.filter((s) => s._id !== id));
  }
  function addStat() {
    setStats((prev) => [...prev, { key: "", value: "", _id: newId() }]);
  }

  function save() {
    return onSave({
      eyebrow,
      headline,
      subtext,
      primaryCta: { label: primaryLabel, href: primaryHref },
      secondaryCta: { label: secondaryLabel, href: secondaryHref },
      stats: stats.map(({ _id, ...rest }) => rest),
    });
  }

  function statRow(row: StatRow, index: number, floating = false) {
    return (
      <div
        ref={floating ? undefined : drag.registerCard(row._id)}
        className={`${styles.editRow} ${floating ? styles.editRowFloating : ""}`}
      >
        <button
          type="button"
          className={styles.dragHandle}
          aria-label="Reorder stat. Press arrow keys to move, or drag."
          onPointerDown={(e) => drag.startDrag(index, row._id, e)}
          onKeyDown={drag.keyboardReorder(row._id)}
        >
          <FontAwesomeIcon icon={faGripVertical} />
        </button>
        <div className={styles.editFields}>
          <label className={styles.editField}>
            <span className={f.editFieldLabel}>Label</span>
            <input
              className={f.editInput}
              value={row.key}
              onChange={(e) => patchStat(row._id, "key", e.target.value)}
            />
          </label>
          <label className={styles.editField}>
            <span className={f.editFieldLabel}>Value</span>
            <input
              className={f.editInput}
              value={row.value}
              onChange={(e) => patchStat(row._id, "value", e.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className={styles.removeBtn}
          aria-label="Remove stat"
          onClick={() => removeStat(row._id)}
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>
      </div>
    );
  }

  const draggingStat = drag.draggingKey ? stats.find((s) => s._id === drag.draggingKey) : null;

  return (
    <EditModal
      title="Edit hero"
      onClose={onClose}
      onSave={save}
      overlay={
        draggingStat ? (
          <div className={styles.editFloatingLayer} style={drag.floatingStyle}>
            {statRow(draggingStat, 0, true)}
          </div>
        ) : null
      }
    >
      <label className={f.formField}>
        <span className={f.editFieldLabel}>Eyebrow</span>
        <input className={f.editInput} value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} />
      </label>

      <label className={f.formField}>
        <span className={f.editFieldLabel}>Headline</span>
        <textarea
          className={f.editInput}
          rows={2}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
        />
      </label>

      <label className={f.formField}>
        <span className={f.editFieldLabel}>Subtext</span>
        <textarea
          className={f.editInput}
          rows={3}
          value={subtext}
          onChange={(e) => setSubtext(e.target.value)}
        />
      </label>

      <p className={f.formSubhead}>Primary button</p>
      <div className={f.formRow}>
        <label className={f.formField}>
          <span className={f.editFieldLabel}>Label</span>
          <input className={f.editInput} value={primaryLabel} onChange={(e) => setPrimaryLabel(e.target.value)} />
        </label>
        <label className={f.formField}>
          <span className={f.editFieldLabel}>Link</span>
          <input className={f.editInput} value={primaryHref} onChange={(e) => setPrimaryHref(e.target.value)} />
        </label>
      </div>

      <p className={f.formSubhead}>Secondary button</p>
      <div className={f.formRow}>
        <label className={f.formField}>
          <span className={f.editFieldLabel}>Label</span>
          <input
            className={f.editInput}
            value={secondaryLabel}
            onChange={(e) => setSecondaryLabel(e.target.value)}
          />
        </label>
        <label className={f.formField}>
          <span className={f.editFieldLabel}>Link</span>
          <input
            className={f.editInput}
            value={secondaryHref}
            onChange={(e) => setSecondaryHref(e.target.value)}
          />
        </label>
      </div>

      <p className={f.formSubhead}>Stats panel</p>
      <div className={styles.editList}>
        {stats.length === 0 && <p className={styles.editEmpty}>No stats yet.</p>}
        {stats.map((row, index) =>
          row._id === drag.draggingKey ? (
            <div key={row._id} className={styles.editPlaceholder} style={{ height: drag.size.h }} />
          ) : (
            <div key={row._id}>{statRow(row, index)}</div>
          )
        )}
      </div>
      <button type="button" className={styles.addBtn} onClick={addStat}>
        <FontAwesomeIcon icon={faPlus} /> Add stat
      </button>
      <div className="srOnly" role="status" aria-live="polite">
        {drag.announcement}
      </div>
    </EditModal>
  );
}
