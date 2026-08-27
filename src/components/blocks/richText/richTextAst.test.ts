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
import { at } from "@/test/at";

/** Round-trip an AST through the editor's HTML representation and back. */
function roundTrip(children: unknown[]): unknown[] {
  const host = document.createElement("div");
  host.innerHTML = astToHtml({ children });
  return htmlToAst(host).children;
}

// These suites work on untyped AST fragments, so almost every assertion starts
// by reaching into a node's children. Naming that reach once keeps the casts in
// one place, and `at` reports an empty list plainly rather than as a property
// access on undefined.

/** Node `i` of an AST fragment, as a plain record. */
const nodeAt = (nodes: readonly unknown[], i = 0) => at(nodes, i) as Record<string, unknown>;

/** The children of node `i`, as plain records. */
const kidsOf = (nodes: readonly unknown[], i = 0) =>
  nodeAt(nodes, i).children as Record<string, unknown>[];

/** The `text` of the first leaf under node `i`. */
const firstText = (nodes: readonly unknown[], i = 0) => at(kidsOf(nodes, i), 0).text;

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
    const kids = kidsOf(out.children as unknown[]);
    // The link node is gone but "this" survives as plain text.
    expect(kids.some((k) => k.type === "link")).toBe(false);
    expect(kids.map((k) => k.text)).toContain("this");
  });

  it("leaves a safe link intact", () => {
    const link = { type: "link", href: "https://example.com", children: [{ text: "site" }] };
    const out = sanitizeRichTextAst({ children: [{ type: "paragraph", children: [link] }] });
    const kids = kidsOf(out.children as unknown[]);
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
    expect(out.map((_, i) => firstText(out, i))).toEqual([
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
    const leaf = at(kidsOf(out), 0);
    expect(leaf).toMatchObject({ text: "styled", ...mark });
  });

  it("preserves combined marks", () => {
    const out = roundTrip([para("both", { bold: true, italic: true })]) as Record<string, unknown>[];
    const leaf = at(kidsOf(out), 0);
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
    expect(nodeAt(out).type).toBe(type);
  });

  it("preserves a block quote", () => {
    const out = roundTrip([
      { type: "block-quote", children: [{ text: "Quoted" }] },
    ]) as Record<string, unknown>[];
    expect(nodeAt(out).type).toBe("block-quote");
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
    expect(nodeAt(out).type).toBe("bulleted-list");
    expect(kidsOf(out)).toHaveLength(2);
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
    expect(nodeAt(out).type).toBe("numbered-list");
  });

  it("preserves a safe link with its href", () => {
    const out = roundTrip([
      {
        type: "paragraph",
        children: [{ type: "link", href: "https://example.com", children: [{ text: "site" }] }],
      },
    ]) as Record<string, unknown>[];
    const link = kidsOf(out).find((c) => c.type === "link");
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
    expect(firstText(out)).toBe("5 < 6 && 7 > 3");
  });

  it("preserves non-ASCII text", () => {
    const out = roundTrip([para("Déjà vu — naïve façade ✦")]) as Record<string, unknown>[];
    expect(firstText(out)).toBe("Déjà vu — naïve façade ✦");
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

describe("isSafeUrl — protocol-relative URLs", () => {
  it.each(["//evil.com", "//evil.com/path", "  //evil.com", "///evil.com"])(
    "rejects %j, which resolves off-site rather than as a path",
    (url) => {
      expect(isSafeUrl(url)).toBe(false);
    }
  );

  // The WHATWG URL parser treats a backslash as a slash for http(s) URLs, so
  // these resolve to another origin exactly like "//evil.com" does. A check
  // that only excluded a second forward slash let every one of them through.
  it.each([
    "/\\evil.com",
    "/\\\\evil.com",
    "/\\/evil.com",
    "/\\evil.com/path",
    "  /\\evil.com",
  ])("rejects the backslash form %j", (url) => {
    // Assert the premise as well as the check: if a future runtime stopped
    // resolving these off-site, this test would be guarding nothing.
    expect(new URL(url.trim(), "https://site.test/page").origin).toBe("https://evil.com");
    expect(isSafeUrl(url)).toBe(false);
  });

  it("still accepts ordinary site-relative paths", () => {
    for (const url of ["/", "/portfolio", "/portfolio/coat", "/a/b/c", "/a/b?c=1#d"]) {
      expect(isSafeUrl(url), url).toBe(true);
    }
  });

  it("strips a protocol-relative link href during sanitization", () => {
    const out = sanitizeRichTextAst({
      children: [
        {
          type: "paragraph",
          children: [{ type: "link", href: "//evil.com", children: [{ text: "click" }] }],
        },
      ],
    });
    expect(JSON.stringify(out)).not.toContain("evil.com");
    expect(JSON.stringify(out)).toContain("click");
  });
});

// ── HTML the editor did not write ────────────────────────────────────────────
//
// Everything above round-trips AST → HTML → AST, so it only ever feeds
// `htmlToAst` markup that `astToHtml` produced moments earlier. That is the
// easy half. The hard half is a paste: Word, Google Docs and every CMS export
// drop styled `<span>`s, `<div>` wrappers, nested lists and whitespace between
// tags into the contentEditable surface, and `htmlToAst` has to turn all of it
// into the same small AST vocabulary or the content is silently mangled on the
// next save.
//
// These cases feed `htmlToAst` markup no `astToHtml` call would ever emit.

/** Parse foreign HTML the way a paste into the editor surface would. */
function fromHtml(html: string): Record<string, unknown>[] {
  const host = document.createElement("div");
  host.innerHTML = html;
  return htmlToAst(host).children as Record<string, unknown>[];
}

describe("an AST node the renderer does not recognize", () => {
  // Stored content outlives the code that wrote it: a node type that was
  // removed, or one written by a newer deploy and read by an older one, must
  // not take the page down or swallow the words inside it.
  it("renders the children of an unknown node rather than dropping them", () => {
    const html = astToHtml({
      children: [{ type: "some-future-block", children: [{ text: "Still readable" }] }],
    });

    expect(html).toContain("Still readable");
  });

  it("still escapes the text inside an unknown node", () => {
    const html = astToHtml({
      children: [{ type: "some-future-block", children: [{ text: "<script>alert(1)</script>" }] }],
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("pasted marks carried as inline styles", () => {
  // A paste does not bring <strong>/<em> — it brings spans with CSS. Dropping
  // these loses every bold word in a pasted document, with no error anywhere.
  it.each([
    ["font-weight: bold", "bold"],
    ["font-weight: 700", "bold"],
    ["font-weight: 600", "bold"],
    ["font-style: italic", "italic"],
    ["text-decoration: underline", "underline"],
  ])("reads %j as %s", (style, mark) => {
    const out = fromHtml(`<p><span style="${style}">Styled</span></p>`);

    expect(at(kidsOf(out), 0)).toMatchObject({ text: "Styled", [mark]: true });
  });

  it.each(["font-weight: 500", "font-weight: normal", "font-style: normal"])(
    "does not invent a mark for %j",
    (style) => {
      const out = fromHtml(`<p><span style="${style}">Plain</span></p>`);

      const leaf = at(kidsOf(out), 0);
      expect(leaf).toMatchObject({ text: "Plain" });
      expect(leaf.bold).toBeUndefined();
      expect(leaf.italic).toBeUndefined();
    }
  );

  it("combines styles from nested spans", () => {
    const out = fromHtml(
      `<p><span style="font-weight: bold"><span style="font-style: italic">Both</span></span></p>`
    );

    expect(at(kidsOf(out), 0)).toMatchObject({ text: "Both", bold: true, italic: true });
  });

  // Current behaviour, pinned rather than endorsed: `serializeInline` resets
  // marks to {} when it builds a link node, so a mark applied *around* a link
  // does not reach the link's text. In the editor's own output that never
  // arises — bolding inside a link produces <a><strong>…</strong></a>, which
  // survives — so this only costs fidelity on a paste where the emphasis wraps
  // the anchor. Asserted so the reset reads as a decision someone made rather
  // than one nobody noticed; changing it is a renderer question, not a test one.
  it("drops a mark applied outside a link, keeping the link itself", () => {
    const out = fromHtml(
      `<p><span style="font-weight: bold"><a href="/x">Linked</a></span></p>`
    );

    const link = at(kidsOf(out), 0);
    expect(link.type).toBe("link");
    expect(link.href).toBe("/x");
    expect(at(link.children as Record<string, unknown>[], 0)).toEqual({ text: "Linked" });
  });

  it("keeps a mark applied inside a link, which is what the editor emits", () => {
    const out = fromHtml(`<p><a href="/x"><strong>Linked</strong></a></p>`);

    const link = at(kidsOf(out), 0);
    expect(at(link.children as Record<string, unknown>[], 0)).toMatchObject({
      text: "Linked",
      bold: true,
    });
  });
});

describe("pasted structure", () => {
  it("keeps a code block through the round trip", () => {
    const out = fromHtml("<pre>const x = 1;</pre>");

    expect(nodeAt(out).type).toBe("code-block");
    expect(firstText(out)).toBe("const x = 1;");
    // And back out again, so the editor can render what it just parsed.
    expect(astToHtml({ children: out })).toContain("<pre>");
  });

  it("flattens a div that wraps block content", () => {
    const out = fromHtml("<div><h2>Heading</h2><p>Body</p></div>");

    expect(out.map((n) => n.type)).toEqual(["heading-two", "paragraph"]);
  });

  // A div holding only inline content is a paragraph in everything but name.
  it("treats a div of inline content as a paragraph", () => {
    const out = fromHtml("<div>Just words</div>");

    expect(nodeAt(out).type).toBe("paragraph");
    expect(firstText(out)).toBe("Just words");
  });

  // This is why the branch exists at all, and the only case that distinguishes
  // it. contentEditable wraps each line in a <div>, so an *empty* div is a
  // blank line the author pressed Enter to make. The block-children path drops
  // whitespace-only runs — correct for indentation between pasted tags, wrong
  // for a line someone typed — so an inline-only div becomes a paragraph
  // unconditionally, blank or not, and the blank line survives the save.
  it.each(["<div></div>", "<div>   </div>", "<div><br></div>"])(
    "keeps the deliberate blank line %j",
    (html) => {
      const out = fromHtml(html);

      expect(out).toHaveLength(1);
      expect(nodeAt(out).type).toBe("paragraph");
    }
  );

  it("keeps a blank line between two paragraphs of prose", () => {
    const out = fromHtml("<div>One</div><div></div><div>Two</div>");

    expect(out.map((n) => n.type)).toEqual(["paragraph", "paragraph", "paragraph"]);
    expect(firstText(out, 0)).toBe("One");
    expect(firstText(out, 2)).toBe("Two");
  });

  it("keeps a nested list under its parent item", () => {
    const out = fromHtml("<ul><li>Outer<ul><li>Inner</li></ul></li></ul>");

    expect(nodeAt(out).type).toBe("bulleted-list");
    const item = at(kidsOf(out), 0);
    const nested = (item.children as Record<string, unknown>[]).find(
      (c) => c.type === "bulleted-list"
    );
    expect(nested).toBeDefined();
  });

  it("keeps a numbered list nested inside a bulleted one", () => {
    const out = fromHtml("<ul><li>Outer<ol><li>Inner</li></ol></li></ul>");

    const item = at(kidsOf(out), 0);
    const nested = (item.children as Record<string, unknown>[]).find(
      (c) => c.type === "numbered-list"
    );
    expect(nested).toBeDefined();
  });

  it("ignores stray non-li children of a list", () => {
    const out = fromHtml("<ul><li>Kept</li><div>Stray</div></ul>");

    expect(kidsOf(out)).toHaveLength(1);
  });

  // These are block-level in HTML but absent from BLOCK_TAGS, so they are not
  // routed through `blockToAst` at all — they join the inline run and are
  // unwrapped by `serializeInline`'s default arm, then wrapped in a paragraph
  // by the flush. The outcome is what matters: the words survive. Losing the
  // text would be far worse than losing the tag it arrived in.
  it.each(["<section>Words</section>", "<article>Words</article>", "<main>Words</main>"])(
    "unwraps %j, keeping its text as a paragraph",
    (html) => {
      const out = fromHtml(html);

      expect(nodeAt(out).type).toBe("paragraph");
      expect(firstText(out)).toBe("Words");
    }
  );

  // A tag that IS in BLOCK_TAGS but has no case of its own falls to
  // `blockToAst`'s default arm. `<li>` outside a list is the reachable one.
  it("turns a stray list item into a paragraph", () => {
    const out = fromHtml("<li>Orphaned</li>");

    expect(nodeAt(out).type).toBe("paragraph");
    expect(firstText(out)).toBe("Orphaned");
  });

  it("unwraps an unknown inline element, keeping its text", () => {
    const out = fromHtml("<p>before <cite>cited</cite> after</p>");

    const text = kidsOf(out)
      .map((n) => n.text ?? "")
      .join("");
    expect(text).toContain("cited");
  });
});

describe("whitespace between pasted tags", () => {
  // Markup is usually indented, and every newline between block tags arrives
  // as a text node. Turning those into paragraphs would double the spacing of
  // a pasted document.
  it("does not turn indentation into empty paragraphs", () => {
    const out = fromHtml("<p>One</p>\n  \n<p>Two</p>");

    expect(out.map((n) => n.type)).toEqual(["paragraph", "paragraph"]);
    expect(out.map((n) => firstText([n]))).toEqual(["One", "Two"]);
  });

  it.each(["   ", "\n", "\t\n  "])("drops the whitespace-only run %j", (ws) => {
    expect(fromHtml(`<p>Kept</p>${ws}`)).toHaveLength(1);
  });

  // A bare link between blocks is meaningful even with no surrounding text, so
  // the "is this run worth keeping" check has to look past whitespace.
  it("keeps an inline run that is only a link", () => {
    const out = fromHtml("<p>Above</p>\n<a href='/x'>Link</a>\n");

    expect(out.map((n) => n.type)).toEqual(["paragraph", "paragraph"]);
    // The surrounding newlines are text nodes in their own right, so the link
    // sits among them rather than first.
    const link = kidsOf(out, 1).find((n) => n.type === "link");
    expect(link).toMatchObject({ href: "/x" });
  });

  it("keeps loose text that is not only whitespace", () => {
    const out = fromHtml("<p>Above</p>loose words");

    expect(out).toHaveLength(2);
    expect(firstText(out, 1)).toBe("loose words");
  });
});
