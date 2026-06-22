// Conversions between Hygraph's rich-text AST (the `{ children: [...] }` shape
// stored on RichText JSON and consumed by RichTextWidget) and the contentEditable
// DOM the editor manipulates. Kept dependency-free and pure so the same mapping
// drives both loading existing content and serializing edits back.
//
// Images are represented as Hygraph `image` nodes (self-contained: src + alt),
// exactly what the renderer's default `img` handler already expects — no
// separate `references` array needed.

type AstNode = { [key: string]: any };
type Marks = { bold?: boolean; italic?: boolean; underline?: boolean; code?: boolean };

// ---------------------------------------------------------------------------
// Link safety (also imported by blocks.ts so URL validation is defined once)
// ---------------------------------------------------------------------------

// Only allow link hrefs that can't trigger script execution when rendered for
// visitors: absolute http(s)/mailto URLs, site-relative paths, and anchors.
// Blocks javascript:/data:/vbscript: and other active schemes (click-XSS).
export function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:|\/|#)/i.test(url.trim());
}

/**
 * Recursively strip unsafe link hrefs from a rich-text AST. Used server-side as
 * a defense-in-depth check so unsafe links can't be persisted even if the
 * client editor is bypassed. Unsafe links are unwrapped to their child content.
 */
export function sanitizeRichTextAst<T extends { children?: any[] }>(node: T): T {
  function walk(nodes: any[]): any[] {
    const out: any[] = [];
    for (const n of nodes) {
      const kids = Array.isArray(n?.children) ? walk(n.children) : n?.children;
      if (n?.type === "link" && !isSafeUrl(String(n.href ?? ""))) {
        out.push(...(Array.isArray(kids) ? kids : []));
        continue;
      }
      out.push(kids === n?.children ? n : { ...n, children: kids });
    }
    return out;
  }
  return { ...node, children: Array.isArray(node.children) ? walk(node.children) : node.children };
}

// Marks a figure as an editor-managed image so it can be round-tripped losslessly.
const IMAGE_ATTR = "data-rt-image";

// Block-level tags the serializer recognizes at the top level of the surface.
const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "blockquote", "pre", "figure"
]);

// ---------------------------------------------------------------------------
// AST -> HTML (load existing field content into the editor)
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function textToHtml(node: AstNode): string {
  let html = escapeHtml(String(node.text ?? "")).replace(/\n/g, "<br>");
  if (node.code) html = `<code>${html}</code>`;
  if (node.underline) html = `<u>${html}</u>`;
  if (node.italic) html = `<em>${html}</em>`;
  if (node.bold) html = `<strong>${html}</strong>`;
  return html;
}

/** Render an `image` AST node as the editor's void figure (carrying its metadata). */
export function imageNodeHtml(node: AstNode): string {
  const src = String(node.src ?? "");
  const alt = String(node.altText ?? node.title ?? "");
  const attrs = [
    `${IMAGE_ATTR}="true"`,
    `contenteditable="false"`,
    `data-src="${escapeAttr(src)}"`,
    node.title ? `data-title="${escapeAttr(String(node.title))}"` : "",
    node.altText ? `data-alt="${escapeAttr(String(node.altText))}"` : ""
  ]
    .filter(Boolean)
    .join(" ");
  return `<figure ${attrs}><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" /></figure>`;
}

function childrenToHtml(children: AstNode[] = []): string {
  return children.map(nodeToHtml).join("");
}

function nodeToHtml(node: AstNode): string {
  if (typeof node.text === "string") return textToHtml(node);

  switch (node.type) {
    case "paragraph": return `<p>${childrenToHtml(node.children) || "<br>"}</p>`;
    case "heading-one": return `<h1>${childrenToHtml(node.children)}</h1>`;
    case "heading-two": return `<h2>${childrenToHtml(node.children)}</h2>`;
    case "heading-three": return `<h3>${childrenToHtml(node.children)}</h3>`;
    case "heading-four": return `<h4>${childrenToHtml(node.children)}</h4>`;
    case "heading-five": return `<h5>${childrenToHtml(node.children)}</h5>`;
    case "heading-six": return `<h6>${childrenToHtml(node.children)}</h6>`;
    case "bulleted-list": return `<ul>${childrenToHtml(node.children)}</ul>`;
    case "numbered-list": return `<ol>${childrenToHtml(node.children)}</ol>`;
    case "list-item": return `<li>${childrenToHtml(node.children)}</li>`;
    case "list-item-child": return childrenToHtml(node.children);
    case "block-quote": return `<blockquote>${childrenToHtml(node.children)}</blockquote>`;
    case "code-block": return `<pre>${childrenToHtml(node.children)}</pre>`;
    case "image": return imageNodeHtml(node);
    case "link": {
      const href = escapeAttr(String(node.href ?? ""));
      const target = node.openInNewTab ? ` target="_blank" rel="noopener noreferrer"` : "";
      return `<a href="${href}"${target}>${childrenToHtml(node.children)}</a>`;
    }
    default:
      return childrenToHtml(node.children);
  }
}

/** Serialize a rich-text AST (array or `{ children }`) into editor HTML. */
export function astToHtml(content: any): string {
  const children: AstNode[] = Array.isArray(content) ? content : content?.children ?? [];
  const html = children.map(nodeToHtml).join("");
  return html || "<p><br></p>";
}

// ---------------------------------------------------------------------------
// HTML -> AST (serialize edits back to the field shape)
// ---------------------------------------------------------------------------

function ensureChildren(nodes: AstNode[]): AstNode[] {
  return nodes.length ? nodes : [{ text: "" }];
}

// Walk inline DOM (text + formatting wrappers + links), accumulating marks.
function serializeInline(nodes: ChildNode[], marks: Marks): AstNode[] {
  const out: AstNode[] = [];

  for (const child of nodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? "";
      if (text) out.push({ text, ...marks });
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const el = child as HTMLElement;
    const kids = Array.from(el.childNodes);

    switch (el.tagName.toLowerCase()) {
      case "br":
        out.push({ text: "\n", ...marks });
        break;
      case "strong":
      case "b":
        out.push(...serializeInline(kids, { ...marks, bold: true }));
        break;
      case "em":
      case "i":
        out.push(...serializeInline(kids, { ...marks, italic: true }));
        break;
      case "u":
        out.push(...serializeInline(kids, { ...marks, underline: true }));
        break;
      case "code":
        out.push(...serializeInline(kids, { ...marks, code: true }));
        break;
      case "a": {
        const link: AstNode = {
          type: "link",
          href: el.getAttribute("href") ?? "",
          children: ensureChildren(serializeInline(kids, {}))
        };
        if (el.getAttribute("target") === "_blank") link.openInNewTab = true;
        out.push(link);
        break;
      }
      default: {
        const next: Marks = { ...marks };
        const style = el.style;
        if (style.fontWeight === "bold" || Number(style.fontWeight) >= 600) next.bold = true;
        if (style.fontStyle === "italic") next.italic = true;
        if ((style.textDecorationLine || style.textDecoration || "").includes("underline")) {
          next.underline = true;
        }
        out.push(...serializeInline(kids, next));
      }
    }
  }

  return out;
}

function listToAst(listEl: HTMLElement, type: "bulleted-list" | "numbered-list"): AstNode {
  const items: AstNode[] = [];

  for (const li of Array.from(listEl.children)) {
    if (li.tagName.toLowerCase() !== "li") continue;

    const inline: ChildNode[] = [];
    let nested: AstNode | null = null;

    for (const node of Array.from(li.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = (node as HTMLElement).tagName.toLowerCase();
        if (tag === "ul") { nested = listToAst(node as HTMLElement, "bulleted-list"); continue; }
        if (tag === "ol") { nested = listToAst(node as HTMLElement, "numbered-list"); continue; }
      }
      inline.push(node);
    }

    const children: AstNode[] = [
      { type: "list-item-child", children: ensureChildren(serializeInline(inline, {})) }
    ];
    if (nested) children.push(nested);
    items.push({ type: "list-item", children });
  }

  const fallback: AstNode = {
    type: "list-item",
    children: [{ type: "list-item-child", children: [{ text: "" }] }]
  };
  return { type, children: items.length ? items : [fallback] };
}

function figureToImageNode(fig: HTMLElement): AstNode | null {
  const src = fig.getAttribute("data-src") || fig.querySelector("img")?.getAttribute("src") || "";
  if (!src) return null;

  const node: AstNode = { type: "image", src, children: [{ text: "" }] };
  const title = fig.getAttribute("data-title");
  const alt = fig.getAttribute("data-alt");
  if (title) node.title = title;
  if (alt) node.altText = alt;
  return node;
}

function blockToAst(el: HTMLElement, out: AstNode[]): void {
  switch (el.tagName.toLowerCase()) {
    case "h1": out.push({ type: "heading-one", children: ensureChildren(serializeInline(Array.from(el.childNodes), {})) }); break;
    case "h2": out.push({ type: "heading-two", children: ensureChildren(serializeInline(Array.from(el.childNodes), {})) }); break;
    case "h3": out.push({ type: "heading-three", children: ensureChildren(serializeInline(Array.from(el.childNodes), {})) }); break;
    case "h4": out.push({ type: "heading-four", children: ensureChildren(serializeInline(Array.from(el.childNodes), {})) }); break;
    case "h5": out.push({ type: "heading-five", children: ensureChildren(serializeInline(Array.from(el.childNodes), {})) }); break;
    case "h6": out.push({ type: "heading-six", children: ensureChildren(serializeInline(Array.from(el.childNodes), {})) }); break;
    case "blockquote": out.push({ type: "block-quote", children: ensureChildren(serializeInline(Array.from(el.childNodes), {})) }); break;
    case "pre": out.push({ type: "code-block", children: ensureChildren(serializeInline(Array.from(el.childNodes), {})) }); break;
    case "ul": out.push(listToAst(el, "bulleted-list")); break;
    case "ol": out.push(listToAst(el, "numbered-list")); break;
    case "figure": {
      if (el.hasAttribute(IMAGE_ATTR)) {
        const node = figureToImageNode(el);
        if (node) out.push(node);
      }
      break;
    }
    case "div": {
      const hasBlockChildren = Array.from(el.children).some((c) =>
        BLOCK_TAGS.has(c.tagName.toLowerCase())
      );
      if (hasBlockChildren) {
        flushHtmlChildren(Array.from(el.childNodes), out);
      } else {
        out.push({ type: "paragraph", children: ensureChildren(serializeInline(Array.from(el.childNodes), {})) });
      }
      break;
    }
    default:
      out.push({ type: "paragraph", children: ensureChildren(serializeInline(Array.from(el.childNodes), {})) });
  }
}

function isBlockLevel(node: ChildNode): boolean {
  return (
    node.nodeType === Node.ELEMENT_NODE &&
    BLOCK_TAGS.has((node as HTMLElement).tagName.toLowerCase())
  );
}

function flushHtmlChildren(nodes: ChildNode[], out: AstNode[]): void {
  let inlineRun: ChildNode[] = [];

  const flush = () => {
    if (!inlineRun.length) return;
    const inline = serializeInline(inlineRun, {});
    const meaningful = inline.some(
      (n) => n.type === "link" || (typeof n.text === "string" && n.text.trim() !== "")
    );
    if (meaningful) out.push({ type: "paragraph", children: ensureChildren(inline) });
    inlineRun = [];
  };

  for (const node of nodes) {
    if (isBlockLevel(node)) {
      flush();
      blockToAst(node as HTMLElement, out);
    } else {
      inlineRun.push(node);
    }
  }
  flush();
}

/** Serialize the editor surface's DOM back into a rich-text AST. */
export function htmlToAst(root: HTMLElement): { children: AstNode[] } {
  const out: AstNode[] = [];
  flushHtmlChildren(Array.from(root.childNodes), out);
  if (out.length === 0) out.push({ type: "paragraph", children: [{ text: "" }] });
  return { children: out };
}

// ---------------------------------------------------------------------------
// Asset -> image node
// ---------------------------------------------------------------------------

/** Build a Hygraph `image` AST node from a chosen media asset (url + alt). */
export function imageNodeFromRef(asset: { url: string; altText?: string }): AstNode {
  const node: AstNode = { type: "image", src: asset.url, children: [{ text: "" }] };
  if (asset.altText) {
    node.title = asset.altText;
    node.altText = asset.altText;
  }
  return node;
}
