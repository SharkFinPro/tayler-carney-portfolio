"use client";
import styles from "./Project.module.scss";
import Image from "next/image";
import { useState } from "react";
import { BLUR_DATA_URL } from "@/components/AnimatedSection";

export interface ImageGridItem {
  url: string;
  title: string;
  subtitle?: string;
  description?: string;
}

interface ImageGridProps {
  items: ImageGridItem[];
  variant?: "sketches" | "grid" | "patterns" | "materials" | "techpack" | "finalProduct" | "looks";
  onOpen: (src: string, title: string, items: ImageGridItem[], index: number) => void;
}

export default function ImageGrid({ items, variant = "grid", onOpen }: ImageGridProps) {
  if (!items || items.length === 0) return null;

  if (variant === "materials") {
    return (
      <div className={styles.materialsContainer}>
        {items.map((item, i) => (
          <div
            key={i}
            className={styles.materialCard}
            onClick={() => onOpen(item.url, item.title, items, i)}
          >
            <div className={styles.materialImage}>
              <Image
                src={item.url}
                alt={item.title}
                width={600}
                height={600}
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL}
              />
            </div>
            <div className={styles.materialInfo}>
              <h3>{item.title}</h3>
              {item.description && <p>{item.description}</p>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "patterns") {
    return (
      <div className={styles.patternsContainer}>
        {items.map((item, i) => (
          <div
            key={i}
            className={styles.patternCard}
            onClick={() => onOpen(item.url, item.title, items, i)}
          >
            <Image
              src={item.url}
              alt={item.title}
              width={1200}
              height={1200}
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
            />
            <div className={styles.patternLabel}>{item.title}</div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "sketches") {
    return (
      <div className={styles.sketchesContainer}>
        {items.map((item, i) => (
          <div
            key={i}
            className={styles.sketch}
            onClick={() => onOpen(item.url, item.title, items, i)}
          >
            <Image
              src={item.url}
              alt={item.title}
              width={1000}
              height={1000}
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
            />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "techpack") {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selected = items[selectedIndex];

    return (
      <div className={styles.techPackViewer}>

        <div className={styles.techPackToolbar}>
        <span className={styles.techPackToolbarLabel}>
          Sheet
        </span>

          <select
            value={selectedIndex}
            onChange={(e) =>
              setSelectedIndex(Number(e.target.value))
            }
            className={styles.techPackSelect}
          >
            {items.map((item, i) => (
              <option key={i} value={i}>
                {item.title}
              </option>
            ))}
          </select>

          <span className={styles.techPackCounter}>
          {selectedIndex + 1} / {items.length}
        </span>
        </div>

        <div
          className={styles.techPackSheet}
          onClick={() =>
            onOpen(
              selected.url,
              selected.title,
              items,
              selectedIndex
            )
          }
        >
          <Image
            src={selected.url}
            alt={selected.title}
            width={1600}
            height={2200}
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
          />
        </div>
      </div>
    );
  }

  if (variant === "finalProduct") {
    return (
      <div className={styles.finalProductContainer}>
        {items.map((item, i) => (
          <div
            key={i}
            className={styles.finalProduct}
            onClick={() => onOpen(item.url, item.title, items, i)}
          >
            <Image
              src={item.url}
              alt={item.title}
              width={1000}
              height={1000}
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
            />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "looks") {
    return (
      <div className={styles.looksContainer}>
        {items.map((item, i) => (
          <div
            key={i}
            className={styles.lookCard}
            onClick={() => onOpen(item.url, item.title, items, i)}
          >
            <div className={styles.lookImage}>
              <Image
                src={item.url}
                alt={item.title}
                width={1000}
                height={1200}
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL}
              />
            </div>
            {(item.title || item.description) && (
              <div className={styles.lookInfo}>
                {item.title && <h3>{item.title}</h3>}
                {item.description && <p>{item.description}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // default grid
  return (
    <div className={styles.detailsContainer}>
      {items.map((item, i) => (
        <div
          key={i}
          className={styles.detail}
          onClick={() => onOpen(item.url, item.title, items, i)}
        >
          <h3>{item.title}</h3>
          {item.description && <p>{item.description}</p>}
          <Image
            src={item.url}
            alt={item.title}
            width={1000}
            height={1000}
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
          />
        </div>
      ))}
    </div>
  );
}
