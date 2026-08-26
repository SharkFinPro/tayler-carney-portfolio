"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import styles from "./BlockSection.module.scss";
import ImageGrid, { ImageGridItem } from "./ImageGrid";
import SheetViewer from "./SheetViewer";
import RichTextWidget from "./richText/RichTextWidget";
import { BLUR_DATA_URL } from "@/components/AnimatedSection";
import { resolveAlt } from "@/lib/images";
import { clickableProps } from "@/lib/a11y";
import { blockHasData, richTextHasContent, type Block, type BlockType, type ImageItem, type ImageRef } from "./blocks";

// Block types that render their own heading/layout and so skip the generic
// numbered "01 / 05" section chrome.
const SELF_CHROME_TYPES: BlockType[] = [
  "entry",
  "profileHero",
  "credentials",
  "tagList",
  "cta",
  "pageIntro",
  "columns",
];

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
    case "entry":
      return b.items.length;
    default:
      return undefined;
  }
}

// Renders the inner content of one block — no section chrome, no heading. Kept
// separate from BlockSection so a split container can render its children's
// bodies inside columns. A standalone component so per-block hooks (comparison's
// active view) get a stable instance.
function BlockContent({ block, onOpen, priority = false }: { block: Block; onOpen: OnOpen; priority?: boolean }) {
  // Declared unconditionally so hook order is stable (only comparison uses it).
  // -1 is the "view all" mode (all views shown side-by-side); it's the default.
  const [activeView, setActiveView] = useState(-1);

  switch (block.type) {
    case "richText":
      return <RichTextWidget content={block.content} variant="bare" />;

    case "gallery": {
      const items = refsToItems(block.images, block.heading || "Image");
      return <ImageGrid items={items} variant={block.layout === "feature" ? "feature" : "gallery"} onOpen={onOpen} priority={priority} />;
    }

    case "singleImage": {
      if (!block.image) return null;
      const alt = resolveAlt(block.image.altText, block.heading || "Image");
      return (
        <div
          className={styles.singleImage}
          {...clickableProps(
            () => onOpen(block.image!.url, block.heading, [{ url: block.image!.url, title: block.heading, alt }], 0),
            `View ${block.heading || "image"}`
          )}
        >
          <Image
            src={block.image.url}
            alt={alt}
            width={1600}
            height={1200}
            priority={priority}
            placeholder="blur"
            blurDataURL={BLUR_DATA_URL}
          />
        </div>
      );
    }

    case "mediaShowcase": {
      const items = itemsToGrid(block.items, block.heading || "Item");
      return <ImageGrid items={items} variant={block.layout === "grid" ? "grid" : "cards"} onOpen={onOpen} priority={priority} />;
    }

    case "comparison": {
      const views = block.views;
      if (!views.length) return null;
      // "View all" (activeView === -1) shows every view; otherwise a single one.
      const shown = activeView === -1 ? views : [views[Math.min(activeView, views.length - 1)]];
      const gallery = views.map((v) => ({
        url: v.image.url,
        title: v.label,
        alt: resolveAlt(v.image.altText, v.label),
      }));
      return (
        <>
          <div className={styles.comparisonSelector}>
            <button onClick={() => setActiveView(-1)} aria-pressed={activeView === -1}>
              View all
            </button>
            {views.map((v, i) => (
              <button key={i} onClick={() => setActiveView(i)} aria-pressed={i === activeView}>
                {v.label}
              </button>
            ))}
          </div>
          <div className={styles.comparisonDisplay}>
            {shown.map((v, shownIndex) => {
              const idx = views.indexOf(v);
              const alt = gallery[idx].alt;
              return (
                <div
                  key={idx}
                  className={styles.comparisonView}
                  {...clickableProps(() => onOpen(v.image.url, v.label, gallery, idx), `View ${v.label}`)}
                >
                  <h3>{v.label}</h3>
                  <Image
                    src={v.image.url}
                    alt={alt}
                    width={1000}
                    height={1000}
                    // "View all" renders every view at once, so restrict the
                    // preload to the leading one — preloading all of them is
                    // the same mistake as preloading none, in the other
                    // direction.
                    priority={priority && shownIndex === 0}
                    placeholder="blur"
                    blurDataURL={BLUR_DATA_URL}
                  />
                </div>
              );
            })}
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
      return <SheetViewer items={items} onOpen={onOpen} priority={priority} />;
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

    case "entry": {
      const items = itemsToGrid(block.items, block.heading || "Image");
      return (
        <div className={styles.entry}>
          <div className={styles.entryText}>
            <span className={styles.entryIndex} aria-hidden="true" />
            {block.heading && <h2 className={styles.entryTitle}>{block.heading}</h2>}
            {richTextHasContent(block.content) && (
              <div className={styles.entryDesc}>
                <RichTextWidget content={block.content} variant="bare" />
              </div>
            )}
            {items.length > 0 && (
              <span className={styles.entryCount}>
                {items.length} {items.length === 1 ? "image" : "images"}
              </span>
            )}
          </div>
          {items.length > 0 && (
            <div className={styles.imageStrip}>
              {items.map((item, i) => (
                <figure
                  key={i}
                  className={styles.imageItem}
                  {...clickableProps(() => onOpen(item.url, item.title, items, i), `View ${item.title}`)}
                >
                  <div className={styles.imageWrap}>
                    <Image
                      src={item.url}
                      alt={item.alt ?? item.title}
                      width={0}
                      height={0}
                      sizes="(max-width: 860px) 90vw, 40vw"
                      className={styles.imageNatural}
                      // Only the first image of the strip. `priority` on all of
                      // them would preload the whole entry and defeat the point.
                      priority={priority && i === 0}
                    />
                  </div>
                  {(item.title || item.description) && (
                    <figcaption className={styles.imageCaption}>
                      {item.title && <span className={styles.imageCaptionTitle}>{item.title}</span>}
                      {item.description && (
                        <span className={styles.imageCaptionDesc}>{item.description}</span>
                      )}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}
        </div>
      );
    }

    case "profileHero": {
      const alt = resolveAlt(block.image?.altText, block.name || "Portrait");
      return (
        <div className={styles.profileHero}>
          <div className={styles.profilePortrait}>
            {block.image && (
              <Image
                src={block.image.url}
                alt={alt}
                fill
                sizes="(max-width: 768px) 90vw, 40vw"
                className={styles.profilePortraitImg}
                priority={priority}
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL}
              />
            )}
            {(block.name || block.subtitle) && (
              <div className={styles.profileBadge}>
                {block.name && <span className={styles.profileName}>{block.name}</span>}
                {block.subtitle && <span className={styles.profileSubtitle}>{block.subtitle}</span>}
              </div>
            )}
          </div>
          <div className={styles.profileBio}>
            {block.heading && <span className={styles.profileBioLabel}>{block.heading}</span>}
            {richTextHasContent(block.bio) && <RichTextWidget content={block.bio} variant="bare" />}
          </div>
        </div>
      );
    }

    case "credentials":
      return (
        <div className={styles.credentials}>
          {block.heading && <span className={styles.colHeader}>{block.heading}</span>}
          <div className={styles.credentialsList}>
            {block.items.map((it, i) => (
              <div key={i} className={`${styles.credentialItem} ${it.term ? styles.credentialItemTermed : ""}`}>
                {it.term && <span className={styles.credentialTerm}>{it.term}</span>}
                <div className={styles.credentialBody}>
                  {it.title && <h3 className={styles.credentialTitle}>{it.title}</h3>}
                  {it.meta && <p className={styles.credentialMeta}>{it.meta}</p>}
                  {it.description && <p className={styles.credentialDesc}>{it.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case "tagList":
      return (
        <div className={`${styles.tagList} ${block.tone === "dark" ? styles.tagListDark : ""}`}>
          {block.heading && <span className={styles.tagListHeader}>{block.heading}</span>}
          <ul className={styles.tagItems}>
            {block.tags.map((t, i) => (
              <li key={i} className={styles.tagItem}>
                <span className={styles.tagName}>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    case "cta":
      return (
        <div className={styles.cta}>
          {block.heading && <h2 className={styles.ctaHeadline}>{block.heading}</h2>}
          {block.buttonLabel && (
            <Link href={block.buttonHref} className={styles.ctaButton}>
              {block.buttonLabel}
            </Link>
          )}
        </div>
      );

    case "pageIntro":
      return (
        <div className={styles.pageIntro}>
          {block.eyebrow && <span className={styles.pageIntroEyebrow}>{block.eyebrow}</span>}
          {block.heading && <h1 className={styles.pageIntroHeading}>{block.heading}</h1>}
          {richTextHasContent(block.body) && (
            <div className={styles.pageIntroBody}>
              <RichTextWidget content={block.body} variant="bare" />
            </div>
          )}
        </div>
      );

    case "columns": {
      const children = block.items.filter(blockHasData);
      if (!children.length) return null;
      return (
        <div className={styles.columns} data-count={children.length}>
          {/*
            No `priority` here, for the same reason as SplitColumn: a columns
            block renders two to four children at once, and marking them all
            above-the-fold preloads several images and preloads none of them
            usefully. A page that leads with columns is choosing a layout with
            no single leading image.
          */}
          {children.map((child) => (
            <div key={child.id} className={styles.column}>
              <BlockContent block={child} onOpen={onOpen} />
            </div>
          ))}
        </div>
      );
    }
  }
}

// One side of a split: an optional sub-heading above the child's content. Empty
// children are dropped so a half-filled split still renders cleanly.
function SplitColumn({ block, onOpen }: { block: Block; onOpen: OnOpen }) {
  if (!blockHasData(block)) return null;
  return (
    <div className={styles.splitColumn}>
      {block.heading && <h3 className={styles.splitColHeading}>{block.heading}</h3>}
      {/*
        No `priority` here on purpose. A split has two children, and marking
        both would have them competing to be the LCP element — preloading two
        images helps neither. Split children stay lazy.
      */}
      <BlockContent block={block} onOpen={onOpen} />
    </div>
  );
}

// Renders one top-level content block: the section chrome (the "01 / 05" counter
// heading + optional count badge) wrapped around the block's content. The DOM id
// is the block id (types can repeat on a page). `onOpen` hands image clicks back
// to the host page's lightbox.
/**
 * `priority` marks this section as above the fold, so its leading image is
 * preloaded instead of lazy-loaded. Set it only on the first block of a page:
 * on an image-heavy portfolio that photograph is what LCP measures, and before
 * this every image on the site was lazy.
 */
export default function BlockSection({ block, onOpen, priority = false }: { block: Block; onOpen: OnOpen; priority?: boolean }) {
  const count = blockCount(block);
  // Some blocks render their own heading/layout (the editorial entry, the
  // About/Contact page blocks), so they skip the generic section chrome (the
  // "01 / 05" counter h2).
  if (SELF_CHROME_TYPES.includes(block.type)) {
    return (
      <motion.div id={block.id} {...sectionMotion}>
        <BlockContent block={block} onOpen={onOpen} priority={priority} />
      </motion.div>
    );
  }
  return (
    <motion.div id={block.id} {...sectionMotion}>
      {(block.heading || count != null) && (
        <h2>
          {block.heading}
          {count != null && <span>{count}</span>}
        </h2>
      )}
      <BlockContent block={block} onOpen={onOpen} priority={priority} />
    </motion.div>
  );
}
