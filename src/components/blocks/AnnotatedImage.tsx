"use client";
import { useId, useState } from "react";
import Image from "next/image";
import styles from "./BlockSection.module.scss";
import { BLUR_DATA_URL } from "@/components/AnimatedSection";
import { resolveAlt } from "@/lib/images";
import type { ImageAnnotation, ImageRef } from "./blocks";

// An image with numbered markers pinned to it and a legend beneath.
//
// Two decisions do most of the accessibility work here:
//
//   1. The legend is always rendered as ordinary text, never revealed only on
//      hover or click. Everything the block says is readable without operating
//      anything — the markers add "where", not "what".
//   2. Each marker is a real <button>, tied to its legend entry by
//      aria-describedby. So it is reachable by keyboard, announces the label
//      and the detail together, and does not depend on a pointer to convey
//      which mark goes with which note.
//
// Selecting a marker highlights its legend entry. The legend entries are not
// themselves controls: they would be a second button for the same thing, and a
// focusable <li> that is also the target of aria-describedby is a worse
// experience than a plain one.
export default function AnnotatedImage({
  image,
  points,
  heading,
}: {
  image: ImageRef;
  points: ImageAnnotation[];
  heading: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const baseId = useId();
  const noteId = (i: number) => `${baseId}-note-${i}`;

  return (
    <div className={styles.annotated}>
      <figure className={styles.annotatedFigure}>
        <Image
          src={image.url}
          alt={resolveAlt(image.altText, heading || "Annotated image")}
          width={1400}
          height={1000}
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          className={styles.annotatedImg}
        />
        {points.map((point, i) => (
          <button
            key={i}
            type="button"
            className={`${styles.annotatedMarker} ${active === i ? styles.annotatedMarkerActive : ""}`}
            // Percentages, so a marker stays on the seam it was placed on at
            // every rendered width.
            style={{ left: `${point.x}%`, top: `${point.y}%` }}
            aria-pressed={active === i}
            aria-describedby={noteId(i)}
            onClick={() => setActive((current) => (current === i ? null : i))}
          >
            {i + 1}
          </button>
        ))}
      </figure>

      <ol className={styles.annotatedLegend}>
        {points.map((point, i) => (
          <li
            key={i}
            id={noteId(i)}
            className={`${styles.annotatedNote} ${active === i ? styles.annotatedNoteActive : ""}`}
          >
            <span className={styles.annotatedNumber} aria-hidden="true">
              {i + 1}
            </span>
            <span className={styles.annotatedText}>
              {point.label && <strong className={styles.annotatedLabel}>{point.label}</strong>}
              {point.detail && <span className={styles.annotatedDetail}>{point.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
