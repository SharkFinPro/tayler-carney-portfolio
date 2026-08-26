"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import styles from "./BlockSection.module.scss";
import { resolveAlt } from "@/lib/images";
import type { ComparisonView } from "./blocks";

/**
 * Two images stacked under a draggable divider.
 *
 * A side-by-side pair makes the reader's eye do the alignment work; an overlay
 * you wipe between puts both states in the same place, which is what makes a
 * sketch-against-garment comparison legible.
 *
 * Implemented as a range input rather than pointer handlers. The native control
 * is keyboard-operable, announces its value, and supports Home/End and
 * page-step for free — all of which a hand-rolled drag would have to reproduce.
 * It is visually hidden and the thumb drawn separately.
 */
export default function BeforeAfter({
  before,
  after,
}: {
  before: ComparisonView;
  after: ComparisonView;
}) {
  const [position, setPosition] = useState(50);
  const frameRef = useRef<HTMLDivElement>(null);

  // Dragging anywhere on the image is the expected affordance, so a pointer
  // press maps its x-position onto the same state the slider drives.
  const setFromPointer = useCallback((clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width === 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, pct)));
  }, []);

  return (
    <div className={styles.beforeAfter}>
      <div
        ref={frameRef}
        className={styles.baFrame}
        style={{ ["--ba-position" as string]: `${position}%` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromPointer(e.clientX);
        }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      >
        {/* The "after" image is the base layer, fully visible underneath. */}
        <Image
          src={after.image.url}
          alt={resolveAlt(after.image.altText, after.label)}
          width={1400}
          height={1400}
          sizes="(max-width: 860px) 92vw, 1100px"
          className={styles.baImage}
          draggable={false}
        />

        {/* The "before" image is clipped to the divider position. aria-hidden
            because the slider below already describes what is being compared,
            and both images carry the same subject. */}
        <div className={styles.baClip} aria-hidden="true">
          <Image
            src={before.image.url}
            alt=""
            width={1400}
            height={1400}
            sizes="(max-width: 860px) 92vw, 1100px"
            className={styles.baImage}
            draggable={false}
          />
        </div>

        <div className={styles.baDivider} aria-hidden="true">
          <span className={styles.baHandle}>⟺</span>
        </div>

        <span className={`${styles.baLabel} ${styles.baLabelBefore}`}>{before.label}</span>
        <span className={`${styles.baLabel} ${styles.baLabelAfter}`}>{after.label}</span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(position)}
        onChange={(e) => setPosition(Number(e.target.value))}
        className={styles.baRange}
        aria-label={`Reveal ${before.label} versus ${after.label}`}
        aria-valuetext={`${Math.round(position)}% ${before.label}`}
      />
    </div>
  );
}
