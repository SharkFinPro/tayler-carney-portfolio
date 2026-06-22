"use client";
import { useState } from "react";
import Image from "next/image";
import styles from "./BlockSection.module.scss";
import { BLUR_DATA_URL } from "@/components/AnimatedSection";
import type { ImageGridItem } from "./ImageGrid";

interface SheetViewerProps {
  items: ImageGridItem[];
  onOpen: (src: string, title: string, items: ImageGridItem[], index: number) => void;
}

// A paginated single-document viewer: a dropdown picks one of N large sheets,
// shown one at a time with a position counter. Generic across page types
// (tech-pack pages, line sheets, plates, …).
export default function SheetViewer({ items, onOpen }: SheetViewerProps) {
  const [index, setIndex] = useState(0);
  if (!items.length) return null;
  const selected = items[Math.min(index, items.length - 1)];

  return (
    <div className={styles.sheetViewer}>
      <div className={styles.sheetToolbar}>
        <span className={styles.sheetToolbarLabel}>Sheet</span>
        <select
          className={styles.sheetSelect}
          value={Math.min(index, items.length - 1)}
          onChange={(e) => setIndex(Number(e.target.value))}
          aria-label="Select a sheet"
        >
          {items.map((item, i) => (
            <option key={i} value={i}>
              {item.title}
            </option>
          ))}
        </select>
        <span className={styles.sheetCounter}>
          {Math.min(index, items.length - 1) + 1} / {items.length}
        </span>
      </div>

      <div
        className={styles.sheet}
        onClick={() => onOpen(selected.url, selected.title, items, Math.min(index, items.length - 1))}
      >
        <Image
          src={selected.url}
          alt={selected.alt ?? selected.title}
          width={1600}
          height={2200}
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
        />
      </div>
    </div>
  );
}
