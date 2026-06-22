"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import styles from "./Project.module.scss";
import ImageGrid, { ImageGridItem } from "./ImageGrid";
import { BLUR_DATA_URL } from "@/components/AnimatedSection";
import { resolveAlt } from "@/lib/images";
import type { Block, ImageItem, ImageRef } from "@/components/ProjectBlocks/blocks";
import { SECTION_META } from "@/components/ProjectBlocks/blocks";

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

export default function ProjectBlockSection({ block, onOpen }: { block: Block; onOpen: OnOpen }) {
  // Always declared so hook order is stable across block types (only used by flats).
  const [activeFlat, setActiveFlat] = useState<string>("front");
  const domId = SECTION_META[block.type].id;

  switch (block.type) {
    case "sketches": {
      const items = refsToItems(block.images, "Sketch");
      return (
        <motion.div id={domId} {...sectionMotion}>
          <h2>{block.heading} <span>{items.length}</span></h2>
          <ImageGrid items={items} variant="sketches" onOpen={onOpen} />
        </motion.div>
      );
    }

    case "digitalRendering": {
      if (!block.image) return null;
      const alt = resolveAlt(block.image.altText, "Digital Rendering");
      return (
        <motion.div id={domId} {...sectionMotion}>
          <h2>{block.heading}</h2>
          <div
            className={styles.digitalRendering}
            onClick={() => onOpen(block.image!.url, block.heading, [{ url: block.image!.url, title: block.heading, alt }], 0)}
          >
            <Image src={block.image.url} alt={alt} width={1600} height={1200} placeholder="blur" blurDataURL={BLUR_DATA_URL} />
          </div>
        </motion.div>
      );
    }

    case "flats": {
      const { front, back, side, coloredFlats, coloredFlatsHeading } = block;
      const numFlats = (front ? 1 : 0) + (back ? 1 : 0) + (side ? 1 : 0);
      const coloredItems = itemsToGrid(coloredFlats, coloredFlatsHeading);
      const flatImage = (ref: ImageRef, label: string) => {
        const alt = resolveAlt(ref.altText, label);
        return (
          <Image
            src={ref.url}
            alt={alt}
            width={1000}
            height={1000}
            onClick={() => onOpen(ref.url, label, [{ url: ref.url, title: label, alt }], 0)}
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
          />
        );
      };
      return (
        <motion.div id={domId} {...sectionMotion}>
          <h2>{block.heading} <span>{numFlats}</span></h2>
          <div className={styles.flatViewSelector}>
            <button onClick={() => setActiveFlat("front")} aria-pressed={activeFlat === "front"} disabled={!front}>Front</button>
            <button onClick={() => setActiveFlat("back")} aria-pressed={activeFlat === "back"} disabled={!back}>Back</button>
            <button onClick={() => setActiveFlat("side")} aria-pressed={activeFlat === "side"} disabled={!side}>Side</button>
            {front && back && (
              <button onClick={() => setActiveFlat("both")} aria-pressed={activeFlat === "both"}>Both</button>
            )}
          </div>
          <div className={styles.flatDisplay}>
            {activeFlat === "both" ? (
              <div className={styles.flatSideBySide}>
                <div className={styles.flat}>
                  <h3>Front View</h3>
                  {front && flatImage(front, "Front Flat")}
                </div>
                <div className={styles.flat}>
                  <h3>Back View</h3>
                  {back && flatImage(back, "Back Flat")}
                </div>
              </div>
            ) : (
              <div className={styles.flat}>
                {activeFlat === "front" && front && <><h3>Front View</h3>{flatImage(front, "Front Flat")}</>}
                {activeFlat === "back" && back && <><h3>Back View</h3>{flatImage(back, "Back Flat")}</>}
                {activeFlat === "side" && side && <><h3>Side View</h3>{flatImage(side, "Side Flat")}</>}
              </div>
            )}
          </div>

          {coloredItems.length > 0 && (
            <div className={styles.coloredFlatsSubsection}>
              <h3 className={styles.subsectionHeading}>
                {coloredFlatsHeading} <span>{coloredItems.length}</span>
              </h3>
              <ImageGrid items={coloredItems} variant="materials" onOpen={onOpen} />
            </div>
          )}
        </motion.div>
      );
    }

    case "looks": {
      const items = itemsToGrid(block.items, "Look");
      return (
        <motion.div id={domId} {...sectionMotion}>
          <h2>{block.heading} <span>{items.length}</span></h2>
          <ImageGrid items={items} variant="looks" onOpen={onOpen} />
        </motion.div>
      );
    }

    case "details": {
      const items = itemsToGrid(block.items, "Detail");
      return (
        <motion.div id={domId} {...sectionMotion}>
          <h2>{block.heading} <span>{items.length}</span></h2>
          <ImageGrid items={items} variant="grid" onOpen={onOpen} />
        </motion.div>
      );
    }

    case "patterns": {
      const items = refsToItems(block.images, "Pattern");
      return (
        <motion.div id={domId} {...sectionMotion}>
          <h2>{block.heading} <span>{items.length}</span></h2>
          <ImageGrid items={items} variant="patterns" onOpen={onOpen} />
        </motion.div>
      );
    }

    case "materials": {
      const items = itemsToGrid(block.items, "Material");
      return (
        <motion.div id={domId} {...sectionMotion}>
          <h2>{block.heading} <span>{items.length}</span></h2>
          <ImageGrid items={items} variant="materials" onOpen={onOpen} />
        </motion.div>
      );
    }

    case "techPack": {
      const items = itemsToGrid(block.sheets, "Tech Pack");
      return (
        <motion.div id={domId} {...sectionMotion}>
          <h2>{block.heading} <span>{items.length}</span></h2>
          <div className={styles.techPackLayout}>
            {block.info && (
              <aside className={styles.techPackInfo}>
                {Object.entries(block.info).map(([label, value]) => (
                  <div key={label} className={styles.techPackInfoItem}>
                    <span className={styles.techPackLabel}>
                      {label.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                    </span>
                    <span className={styles.techPackValue}>{value}</span>
                  </div>
                ))}
              </aside>
            )}
            <div className={styles.techPackContent}>
              <ImageGrid items={items} variant="techpack" onOpen={onOpen} />
            </div>
          </div>
        </motion.div>
      );
    }

    case "finalProduct": {
      const items = refsToItems(block.images, "Final Product");
      return (
        <motion.div id={domId} {...sectionMotion}>
          <h2>{block.heading} <span>{items.length}</span></h2>
          <ImageGrid items={items} variant="finalProduct" onOpen={onOpen} />
        </motion.div>
      );
    }
  }
}
