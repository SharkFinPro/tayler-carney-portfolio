import Image from "next/image";
import { RichText } from "@graphcms/rich-text-react-renderer";
import styles from "./RichText.module.scss";

// Hygraph asset URLs are always remote and covered by the `**.graphassets.com`
// entry in next.config's remotePatterns. Anything else — a pasted URL from a
// host that isn't allowlisted — would make next/image throw at render time and
// take the page down, so those fall back to a plain <img>.
// Exported for its suite: this pair decides whether a stored image goes down
// the optimized path or the raw <img> fallback, and both have already been
// wrong once in a way that renders nothing visible.
export function isOptimizable(src: unknown): src is string {
  return typeof src === "string" && /^https:\/\/[^/]*\.graphassets\.com\//i.test(src);
}

// Hygraph does not always supply dimensions on an embedded image. next/image
// needs either both, or `fill` with a sized parent — so when they are missing
// the image falls back to the unoptimized path rather than guessing an aspect
// ratio and causing layout shift.
//
// The bound is `> 0`, not `Number.isFinite`. `Number(null)` is 0 and 0 is
// finite, so a stored `width: null` would have passed and handed next/image a
// 0x0 box — an invisible image, which is worse than the unoptimized <img> this
// is supposed to fall back to.
export function hasDimensions(width: unknown, height: unknown): boolean {
  return Number(width) > 0 && Number(height) > 0;
}

type ImgProps = {
  src?: string;
  altText?: string;
  title?: string;
  width?: number | string;
  height?: number | string;
};

// Guarantee an `alt` attribute on every CMS image: prefer the asset's authored
// alt text, fall back to its title, and finally to "" (decorative) so a screen
// reader never announces a raw filename/URL. WCAG 1.1.1.
const renderers = {
  img: ({ src, altText, title, width, height }: ImgProps) => {
    const alt = altText ?? title ?? "";

    // The visitor-facing path. Previously every rich-text image was a raw
    // <img>, so full-resolution originals were served with no resizing and no
    // format negotiation — on an image-heavy fashion portfolio.
    if (isOptimizable(src) && hasDimensions(width, height)) {
      return (
        <Image
          src={src}
          alt={alt}
          width={Number(width)}
          height={Number(height)}
          sizes="(max-width: 860px) 90vw, 720px"
          className={styles.image}
        />
      );
    }

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt} width={width} height={height} loading="lazy" />
    );
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table_header_cell: ({ children }: any) => <th scope="col">{children}</th>,
};

type Props = {
  // Hygraph's rich-text AST, validated by sanitizeRichTextAst rather than by
  // the type system.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  /**
   * "card" wraps the prose in a standalone bordered surface. "bare" (default for
   * blocks) drops the box so the prose sits inside a larger composition without
   * looking like a widget.
   */
  variant?: "card" | "bare";
};

export default function RichTextWidget({ content, variant = "bare" }: Props) {
  return (
    <div className={`${styles.container} ${variant === "card" ? styles.card : ""}`}>
      <RichText content={content} renderers={renderers} />
    </div>
  );
}
