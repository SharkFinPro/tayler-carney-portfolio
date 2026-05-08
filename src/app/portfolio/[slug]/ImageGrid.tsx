"use client";
import styles from "./Project.module.scss";
import Image from "next/image";

export interface ImageGridItem {
  url: string;
  title: string;
  subtitle?: string;
  description?: string;
}

interface ImageGridProps {
  items: ImageGridItem[];
  variant?: "sketches" | "grid" | "patterns" | "materials" | "techpack" | "finalProduct";
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
                blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjYwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjBmMGVlIi8+PC9zdmc+"
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
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwMCIgaGVpZ2h0PSIxMjAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNmMGYwZWUiLz48L3N2Zz4="
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
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwMCIgaGVpZ2h0PSIxMDAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNmMGYwZWUiLz48L3N2Zz4="
            />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "techpack") {
    return (
      <div className={styles.techPackContainer}>
        {items.map((item, i) => (
          <div
            key={i}
            className={styles.techPack}
            onClick={() => onOpen(item.url, item.title, items, i)}
          >
            <Image
              src={item.url}
              alt={item.title}
              width={1000}
              height={1000}
              placeholder="blur"
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwMCIgaGVpZ2h0PSIxMDAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNmMGYwZWUiLz48L3N2Zz4="
            />
          </div>
        ))}
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
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwMCIgaGVpZ2h0PSIxMDAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNmMGYwZWUiLz48L3N2Zz4="
            />
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
            blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwMCIgaGVpZ2h0PSIxMDAwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNmMGYwZWUiLz48L3N2Zz4="
          />
        </div>
      ))}
    </div>
  );
}
