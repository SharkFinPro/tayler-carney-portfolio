"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import styles from "./BlockSection.module.scss";
import ImageGrid, { ImageGridItem } from "./ImageGrid";
import SheetViewer from "./SheetViewer";
import RichTextWidget from "./richText/RichTextWidget";
import { BLUR_DATA_URL } from "@/components/AnimatedSection";
import { resolveAlt } from "@/lib/images";
import { blockHasData, type Block, type ImageItem, type ImageRef } from "./blocks";

const fadeInVariant: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

type OnOpen = (src: string, title: string, items: ImageGridItem[], index: number) => void;

function refsToItems(refs: ImageRef[], prefix: string): ImageGridItem[] {
  return refs.map((r, i) => ({
    url: r.url,
    title: `${prefix} ${i + 1}`,
    alt: resolveAlt(r.altText, `${prefix} ${i + 1}`),
  }));
}

function itemsToGrid(items: ImageItem[], fallbackPrefix: string): ImageGridItem[] {
  return items.map((it, i) => {
    const title = it.title || `${fallbackPrefix} ${i + 1}`;
    return {
      url: it.image.url,
      title,
      description: it.description,
      alt: resolveAlt(it.image.altText, title),
    };
  });
}

const sectionMotion = {
  className: styles.section,
  variants: fadeInVariant,
  initial: "hidden" as const,
  whileInView: "visible" as const,
  viewport: { once: true },
};

// Optional count badge shown next to a section heading.
function blockCount(b: Block): number | undefined {
  switch (b.type) {
    case "gallery":
      return b.images.length;
    case "mediaShowcase":
      return b.items.length;
    case "comparison":
      return b.views.length;
    case "documentViewer":
      return b.items.length;
    default:
      return undefined;
  }
}

// Renders the inner content of one block — no section chrome, no heading. Kept
// separate from BlockSection so a split container can render its children's
// bodies inside columns. A standalone component so per-block hooks (comparison's
// active view) get a stable instance.
function BlockContent({ block, onOpen }: { block: Block; onOpen: OnOpen }) {
  // Declared unconditionally so hook order is stable (only comparison uses it).
  const [activeView, setActiveView] = useState(0);

  switch (block.type) {
    case "richText":
      return <RichTextWidget content={block.content} variant="bare" />;

    case "gallery": {
      const items = refsToItems(block.images, block.heading || "Image");
      return <ImageGrid items={items} variant={block.layout === "feature" ? "feature" : "gallery"} onOpen={onOpen} />;
    }

    case "singleImage": {
      if (!block.image) return null;
      const alt = resolveAlt(block.image.altText, block.heading || "Image");
      return (
        <div
          className={styles.singleImage}
          onClick={() => onOpen(block.image!.url, block.heading, [{ url: block.image!.url, title: block.heading, alt }], 0)}
        >
          <Image src={block.image.url} alt={alt} width={1600} height={1200} placeholder="blur" blurDataURL={BLUR_DATA_URL} />
        </div>
      );
    }

    case "mediaShowcase": {
      const items = itemsToGrid(block.items, block.heading || "Item");
      return <ImageGrid items={items} variant={block.layout === "grid" ? "grid" : "cards"} onOpen={onOpen} />;
    }

    case "comparison": {
      const views = block.views;
      const current = views[Math.min(activeView, views.length - 1)];
      if (!current) return null;
      const alt = resolveAlt(current.image.altText, current.label);
      return (
        <>
          <div className={styles.comparisonSelector}>
            {views.map((v, i) => (
              <button key={i} onClick={() => setActiveView(i)} aria-pressed={i === activeView}>
                {v.label}
              </button>
            ))}
          </div>
          <div className={styles.comparisonDisplay}>
            <div
              className={styles.comparisonView}
              onClick={() => onOpen(current.image.url, current.label, [{ url: current.image.url, title: current.label, alt }], 0)}
            >
              <h3>{current.label}</h3>
              <Image src={current.image.url} alt={alt} width={1000} height={1000} placeholder="blur" blurDataURL={BLUR_DATA_URL} />
            </div>
          </div>
        </>
      );
    }

    case "specs":
      return (
        <div className={styles.specsTable}>
          {block.rows.map((row, i) => (
            <div key={i} className={styles.specRow}>
              <span className={styles.specLabel}>{row.label}</span>
              <span className={styles.specValue}>{row.value}</span>
            </div>
          ))}
        </div>
      );

    case "documentViewer": {
      const items = itemsToGrid(block.items, block.heading || "Sheet");
      return <SheetViewer items={items} onOpen={onOpen} />;
    }

    case "callout": {
      const variantClass =
        block.variant === "quote"
          ? styles.calloutQuote
          : block.variant === "success"
          ? styles.calloutSuccess
          : block.variant === "warning"
          ? styles.calloutWarning
          : styles.calloutInfo;
      return (
        <div className={`${styles.callout} ${variantClass}`}>
          <p>{block.text}</p>
          {block.attribution && <span className={styles.calloutAttribution}>{block.attribution}</span>}
        </div>
      );
    }

    case "split":
      return (
        <div className={styles.splitLayout}>
          <SplitColumn block={block.left} onOpen={onOpen} />
          <SplitColumn block={block.right} onOpen={onOpen} />
        </div>
      );
  }
}

// One side of a split: an optional sub-heading above the child's content. Empty
// children are dropped so a half-filled split still renders cleanly.
function SplitColumn({ block, onOpen }: { block: Block; onOpen: OnOpen }) {
  if (!blockHasData(block)) return null;
  return (
    <div className={styles.splitColumn}>
      {block.heading && <h3 className={styles.splitColHeading}>{block.heading}</h3>}
      <BlockContent block={block} onOpen={onOpen} />
    </div>
  );
}

// Renders one top-level content block: the section chrome (the "01 / 05" counter
// heading + optional count badge) wrapped around the block's content. The DOM id
// is the block id (types can repeat on a page). `onOpen` hands image clicks back
// to the host page's lightbox.
export default function BlockSection({ block, onOpen }: { block: Block; onOpen: OnOpen }) {
  const count = blockCount(block);
  return (
    <motion.div id={block.id} {...sectionMotion}>
      {(block.heading || count != null) && (
        <h2>
          {block.heading}
          {count != null && <span>{count}</span>}
        </h2>
      )}
      <BlockContent block={block} onOpen={onOpen} />
    </motion.div>
  );
}
