import { RichText } from "@graphcms/rich-text-react-renderer";
import styles from "./RichText.module.scss";

// Guarantee an `alt` attribute on every CMS image: prefer the asset's authored
// alt text, fall back to its title, and finally to "" (decorative) so a screen
// reader never announces a raw filename/URL. WCAG 1.1.1.
const renderers = {
  img: ({ src, altText, title, width, height }: any) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={altText ?? title ?? ""} width={width} height={height} loading="lazy" />
  ),
  table_header_cell: ({ children }: any) => <th scope="col">{children}</th>,
};

type Props = {
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
