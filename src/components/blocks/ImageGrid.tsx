"use client";
import Image from "next/image";
import styles from "./BlockSection.module.scss";
import { BLUR_DATA_URL } from "@/components/AnimatedSection";
import { clickableProps } from "@/lib/a11y";

export interface ImageGridItem {
  url: string;
  title: string;
  description?: string;
  alt?: string;
}

export type ImageGridVariant = "gallery" | "feature" | "cards" | "grid";

interface ImageGridProps {
  items: ImageGridItem[];
  variant: ImageGridVariant;
  onOpen: (src: string, title: string, items: ImageGridItem[], index: number) => void;
}

// Renders a list of images in one of several reusable layouts:
//   gallery — masonry-style image grid (no captions)
//   feature — bold editorial grid that leads with one large image
//   cards   — image with a caption (title + description) below
//   grid    — title + description above the image
export default function ImageGrid({ items, variant, onOpen }: ImageGridProps) {
  if (!items || items.length === 0) return null;

  if (variant === "feature") {
    return (
      <div className={styles.featureContainer}>
        {items.map((item, i) => (
          <div
            key={i}
            className={styles.featureItem}
            {...clickableProps(() => onOpen(item.url, item.title, items, i), `View ${item.title}`)}
          >
            <Image
              src={item.url}
              alt={item.alt ?? item.title}
              width={1400}
              height={1400}
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
            />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "cards") {
    return (
      <div className={styles.cardsContainer}>
        {items.map((item, i) => (
          <div
            key={i}
            className={styles.card}
            {...clickableProps(() => onOpen(item.url, item.title, items, i), `View ${item.title}`)}
          >
            <div className={styles.cardImage}>
              <Image
                src={item.url}
                alt={item.alt ?? item.title}
                width={1000}
                height={1000}
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL}
              />
            </div>
            {(item.title || item.description) && (
              <div className={styles.cardInfo}>
                {item.title && <h3>{item.title}</h3>}
                {item.description && <p>{item.description}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (variant === "grid") {
    return (
      <div className={styles.gridContainer}>
        {items.map((item, i) => (
          <div
            key={i}
            className={styles.gridCard}
            {...clickableProps(() => onOpen(item.url, item.title, items, i), `View ${item.title}`)}
          >
            {item.title && <h3>{item.title}</h3>}
            {item.description && <p>{item.description}</p>}
            <Image
              src={item.url}
              alt={item.alt ?? item.title}
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

  // gallery (default)
  return (
    <div className={styles.galleryContainer}>
      {items.map((item, i) => (
        <div
          key={i}
          className={styles.galleryItem}
          {...clickableProps(() => onOpen(item.url, item.title, items, i), `View ${item.title}`)}
        >
          <Image
            src={item.url}
            alt={item.alt ?? item.title}
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
