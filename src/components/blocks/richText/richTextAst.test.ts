// @vitest-environment happy-dom
//
// The rich-text editor is a contentEditable surface with no editor library, so
// `astToHtml` / `htmlToAst` are the entire persistence layer for published
// prose. If the round-trip is lossy, editing a paragraph silently corrupts it —
// the failure is invisible until someone reads the page.
//
// `isSafeUrl` / `sanitizeRichTextAst` are the click-XSS boundary and are shared
// with blocks.ts, so they are pinned down here too.

import { describe, expect, it } from "vitest";
import {
  astToHtml,
  htmlToAst,
  imageNodeFromRef,
  isSafeUrl,
  sanitizeRichTextAst,
} from "./richTextAst";

/** Round-trip an AST through the editor's HTML representation and back. */
function roundTrip(children: unknown[]): unknown[] {
  const host = document.createElement("div");
  host.innerHTML = astToHtml({ children });
  return htmlToAst(host).children;
}

const para = (text: string, marks: Record<string, boolean> = {}) => ({
  type: "paragraph",
  children: [{ text, ...marks }],
});

describe("isSafeUrl", () => {
  it.each([
    "https://example.com",
    "http://example.com",
    "HTTPS://EXAMPLE.COM",
    "mailto:hello@example.com",
    "/portfolio",
    "/portfolio/coat",
    "#section",
    "  https://example.com  ",
  ])("accepts %j", (url) => {
    expect(isSafeUrl(url)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "\tjavascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "ftp://example.com",
    "about:blank",
    "",
    "   ",
    "example.com",
  ])("rejects %j", (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });
});

describe("sanitizeRichTextAst", () => {
  it("unwraps an unsafe link, keeping its visible text", () => {
    const out = sanitizeRichTextAst({
      children: [
        {
          type: "paragraph",
          children: [
            { text: "see " },
            { type: "link", href: "javascript:alert(1)", children: [{ text: "this" }] },
          ],
        },
      ],
    });
    const p = (out.children as Record<string, unknown>[])[0];
    const kids = p.children as Record<string, unknown>[];
    // The link node is gone but "this" survives as plain text.
    expect(kids.some((k) => k.type === "link")).toBe(false);
    expect(kids.map((k) => k.text)).toContain("this");
  });

  it("leaves a safe link intact", () => {
    const link = { type: "link", href: "https://example.com", children: [{ text: "site" }] };
    const out = sanitizeRichTextAst({ children: [{ type: "paragraph", children: [link] }] });
    const kids = (out.children as Record<string, unknown>[])[0].children as Record<string, unknown>[];
    expect(kids[0]).toMatchObject({ type: "link", href: "https://example.com" });
  });

  it("strips unsafe links nested several levels deep", () => {
    const out = sanitizeRichTextAst({
      children: [
        {
          type: "bulleted-list",
          children: [
            {
              type: "list-item",
              children: [
                {
                  type: "list-item-child",
                  children: [{ type: "link", href: "javascript:x", children: [{ text: "deep" }] }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(out)).not.toContain("javascript:");
    expect(JSON.stringify(out)).toContain("deep");
  });

  it("never throws on a malformed tree", () => {
    // The generic accepts `children?: any[]`, so these all typecheck — the
    // point is that malformed *values* don't blow up the walk at runtime.
    for (const input of [{ children: undefined }, { children: [null, 0, "x"] }, { children: [] }]) {
      expect(() => sanitizeRichTextAst(input)).not.toThrow();
    }
  });
});

describe("astToHtml", () => {
  it("escapes text so stored content cannot inject markup", () => {
    const html = astToHtml({ children: [para("<script>alert(1)</script>")] });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes a link href", () => {
    const html = astToHtml({
      children: [
        {
          type: "paragraph",
          children: [{ type: "link", href: 'https://x.com/"><img onerror=alert(1)>', children: [{ text: "x" }] }],
        },
      ],
    });
    expect(html).not.toContain('"><img');
    expect(html).toContain("&quot;");
  });

  it("renders an empty paragraph as a <br> so the caret has somewhere to sit", () => {
    expect(astToHtml({ children: [{ type: "paragraph", children: [] }] })).toBe("<p><br></p>");
  });

  it("falls back to a single empty paragraph for empty content", () => {
    expect(astToHtml({ children: [] })).toBe("<p><br></p>");
    expect(astToHtml(null)).toBe("<p><br></p>");
    expect(astToHtml([])).toBe("<p><br></p>");
  });

  it("accepts a bare array as well as a { children } wrapper", () => {
    expect(astToHtml([para("hi")])).toBe(astToHtml({ children: [para("hi")] }));
  });
});

describe("round-trip: AST → HTML → AST", () => {
  it("preserves a plain paragraph", () => {
    expect(roundTrip([para("Hello world")])).toEqual([para("Hello world")]);
  });

  it("preserves several paragraphs and their order", () => {
    const input = [para("First"), para("Second"), para("Third")];
    const out = roundTrip(input) as Record<string, unknown>[];
    expect(out).toHaveLength(3);
    expect(out.map((p) => (p.children as { text: string }[])[0].text)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  it.each([
    ["bold", { bold: true }],
    ["italic", { italic: true }],
    ["underline", { underline: true }],
    ["code", { code: true }],
  ])("preserves the %s mark", (_name, mark) => {
    const out = roundTrip([para("styled", mark)]) as Record<string, unknown>[];
    const leaf = (out[0].children as Record<string, unknown>[])[0];
    expect(leaf).toMatchObject({ text: "styled", ...mark });
  });

  it("preserves combined marks", () => {
    const out = roundTrip([para("both", { bold: true, italic: true })]) as Record<string, unknown>[];
    const leaf = (out[0].children as Record<string, unknown>[])[0];
    expect(leaf).toMatchObject({ text: "both", bold: true, italic: true });
  });

  it.each([
    "heading-one",
    "heading-two",
    "heading-three",
    "heading-four",
    "heading-five",
    "heading-six",
  ])("preserves %s", (type) => {
    const out = roundTrip([{ type, children: [{ text: "Title" }] }]) as Record<string, unknown>[];
    expect(out[0].type).toBe(type);
  });

  it("preserves a block quote", () => {
    const out = roundTrip([
      { type: "block-quote", children: [{ text: "Quoted" }] },
    ]) as Record<string, unknown>[];
    expect(out[0].type).toBe("block-quote");
  });

  it("preserves a bulleted list and its items", () => {
    const input = [
      {
        type: "bulleted-list",
        children: [
          { type: "list-item", children: [{ type: "list-item-child", children: [{ text: "one" }] }] },
          { type: "list-item", children: [{ type: "list-item-child", children: [{ text: "two" }] }] },
        ],
      },
    ];
    const out = roundTrip(input) as Record<string, unknown>[];
    expect(out[0].type).toBe("bulleted-list");
    expect((out[0].children as unknown[])).toHaveLength(2);
    expect(JSON.stringify(out)).toContain("one");
    expect(JSON.stringify(out)).toContain("two");
  });

  it("preserves a numbered list", () => {
    const out = roundTrip([
      {
        type: "numbered-list",
        children: [
          { type: "list-item", children: [{ type: "list-item-child", children: [{ text: "step" }] }] },
        ],
      },
    ]) as Record<string, unknown>[];
    expect(out[0].type).toBe("numbered-list");
  });

  it("preserves a safe link with its href", () => {
    const out = roundTrip([
      {
        type: "paragraph",
        children: [{ type: "link", href: "https://example.com", children: [{ text: "site" }] }],
      },
    ]) as Record<string, unknown>[];
    const link = (out[0].children as Record<string, unknown>[]).find((c) => c.type === "link");
    expect(link).toMatchObject({ type: "link", href: "https://example.com" });
  });

  it("preserves an image node's src and alt", () => {
    const out = roundTrip([
      { type: "image", src: "https://media.graphassets.com/x.jpg", altText: "A coat" },
    ]) as Record<string, unknown>[];
    const img = out.find((n) => n.type === "image");
    expect(img).toMatchObject({ src: "https://media.graphassets.com/x.jpg", altText: "A coat" });
  });

  it("preserves text that looks like markup", () => {
    const out = roundTrip([para("5 < 6 && 7 > 3")]) as Record<string, unknown>[];
    expect((out[0].children as { text: string }[])[0].text).toBe("5 < 6 && 7 > 3");
  });

  it("preserves non-ASCII text", () => {
    const out = roundTrip([para("Déjà vu — naïve façade ✦")]) as Record<string, unknown>[];
    expect((out[0].children as { text: string }[])[0].text).toBe("Déjà vu — naïve façade ✦");
  });

  it("is stable across a second round-trip", () => {
    const input = [
      { type: "heading-two", children: [{ text: "Process" }] },
      para("Some prose with ", {}),
      {
        type: "bulleted-list",
        children: [
          { type: "list-item", children: [{ type: "list-item-child", children: [{ text: "a" }] }] },
        ],
      },
    ];
    const once = roundTrip(input);
    const twice = roundTrip(once);
    expect(twice).toEqual(once);
  });
});

describe("imageNodeFromRef", () => {
  it("builds an image node the renderer understands", () => {
    expect(imageNodeFromRef({ url: "https://media.graphassets.com/a.jpg", altText: "Alt" })).toMatchObject({
      type: "image",
      src: "https://media.graphassets.com/a.jpg",
    });
  });

  it("survives a missing altText", () => {
    expect(() => imageNodeFromRef({ url: "https://media.graphassets.com/a.jpg" })).not.toThrow();
  });
});
