// The three rules the block editor runs on every block, and two sanitizers
// that nothing else reaches.
//
// `blockHasData` is the one with teeth: BlockEditor discards a block on save
// when it returns false, so a wrong answer here either throws away work an
// admin just did or litters the page with empty sections. `blockSummary` is
// the collapsed row label — the only thing distinguishing twenty collapsed
// rows from each other. `blocksProvideH1` decides whether a page supplies its
// own <h1>, so getting it wrong leaves a document with none at all.
//
// Two of them are exhaustive switches over `BlockType` with no `default:` arm
// and a non-optional return type, so a newly added type that nobody handled
// fails `tsc` with TS2366 before these tests ever run. That is the real guard
// against an *unhandled* type, and it predates this file.
//
// What the tables below add is the case the compiler cannot see: an arm that
// exists but is wrong. A summary that returns "" satisfies the type checker
// and leaves a blank row in the editor; a `blockHasData` arm that returns true
// for an empty template satisfies it too and litters the page with empty
// sections. Driving the tables from `BLOCK_TYPES` rather than a copied list is
// what makes those checks reach every type, including ones added later.

import { describe, expect, it } from "vitest";
import { at, only } from "@/test/at";
import {
  BLOCK_TYPES,
  blockHasData,
  blockSummary,
  blocksProvideH1,
  createEmptyBlock,
  sanitizeBlocks,
  type Block,
  type BlockType,
} from "./blocks";

/**
 * A block of `type` with `fields` merged over the empty template.
 *
 * Flat types only. The cast means nothing checks the merged shape against the
 * `Block` union, so merging into a container's children this way would build
 * something the real code never produces — `split` gets its own helper below
 * that spreads onto `base.left` / `base.right` instead.
 */
const block = (type: BlockType, fields: Record<string, unknown> = {}) =>
  ({ ...createEmptyBlock(type), ...fields }) as Block;

const richText = (text: string) => ({
  children: [{ type: "paragraph", children: [{ text }] }],
});

const IMAGE = { url: "https://media.graphassets.com/a.jpg", altText: "A coat" };
/** The same image after sanitizing — `str()` drops a blank altText entirely. */
const CLEAN_IMAGE = { url: IMAGE.url, altText: "A coat" };

describe("blockSummary — the collapsed row label", () => {
  // Weak per type, deliberately: the point is that no arm returns a blank
  // label, which the type checker is happy to allow and which shows up as an
  // unidentifiable row in a collapsed list. Types whose exact wording matters
  // get their own cases below.
  it.each(BLOCK_TYPES)("gives %s a non-empty label even when empty", (type) => {
    const summary = blockSummary(createEmptyBlock(type));

    expect(typeof summary).toBe("string");
    expect(summary.trim()).not.toBe("");
  });

  it.each([
    ["gallery", { images: [] }, "0 images"],
    ["gallery", { images: [IMAGE] }, "1 image"],
    ["gallery", { images: [IMAGE, IMAGE] }, "2 images"],
  ] as const)("pluralizes %s with %j as %j", (type, fields, expected) => {
    expect(blockSummary(block(type, fields))).toBe(expected);
  });

  it.each([
    ["richText", { content: richText("Some prose") }],
    ["singleImage", { image: IMAGE }],
  ] as const)("describes a populated %s as something other than 'empty'", (type, fields) => {
    expect(blockSummary(block(type, fields))).not.toBe("empty");
  });

  it.each(["richText", "singleImage"] as const)("describes an unpopulated %s as empty", (type) => {
    expect(blockSummary(createEmptyBlock(type))).toBe("empty");
  });

  // An annotated image is markers on a picture, so it reports the missing
  // picture rather than a marker count that would read as "nothing here yet".
  it("tells an annotatedImage it needs a picture before it counts markers", () => {
    expect(blockSummary(createEmptyBlock("annotatedImage"))).toBe("needs an image");
  });

  it.each([
    [[], "0 markers"],
    [[{ x: 10, y: 10, label: "Cuff" }], "1 marker"],
    [
      [
        { x: 10, y: 10, label: "Cuff" },
        { x: 20, y: 20, label: "Hem" },
      ],
      "2 markers",
    ],
  ])("counts %j annotated markers as %j once it has one", (points, expected) => {
    expect(blockSummary(block("annotatedImage", { image: IMAGE, points }))).toBe(expected);
  });
});

describe("blockHasData — what survives a save", () => {
  // The editor discards a block on save when this is false, so every empty
  // template has to answer false or a fresh block is thrown away the moment
  // it is added.
  it.each(BLOCK_TYPES)("reports a freshly created %s as having no data", (type) => {
    expect(blockHasData(createEmptyBlock(type))).toBe(false);
  });

  it.each([
    ["richText", { content: richText("Words") }],
    ["gallery", { images: [IMAGE] }],
    ["singleImage", { image: IMAGE }],
    ["specs", { rows: [{ label: "Fabric", value: "Wool" }] }],
    ["timeline", { stages: [{ marker: "1", title: "Start", description: "" }] }],
    ["tagList", { tags: ["one"] }],
    ["credentials", { items: [{ term: "BFA", title: "", meta: "", description: "" }] }],
    ["cta", { heading: "Get in touch" }],
    ["cta", { buttonLabel: "Email" }],
    ["pageIntro", { heading: "About" }],
    ["pageIntro", { eyebrow: "Intro" }],
    ["entry", { heading: "A role" }],
  ] as const)("reports a %s with %j as having data", (type, fields) => {
    expect(blockHasData(block(type, fields))).toBe(true);
  });

  // A container is only as empty as its children: discarding a split whose
  // halves hold content would throw away two blocks, not one. The default
  // pairing is a specs table beside a document viewer.
  describe("a split", () => {
    const split = (left?: Record<string, unknown>, right?: Record<string, unknown>) => {
      const base = createEmptyBlock("split");
      if (base.type !== "split") throw new Error("expected a split block");
      return {
        ...base,
        left: { ...base.left, ...left },
        right: { ...base.right, ...right },
      } as Block;
    };

    const ROW = { rows: [{ label: "Fabric", value: "Wool" }] };
    const SHEETS = { items: [{ title: "Sheet", description: "", image: IMAGE }] };

    it("is empty while both halves are", () => {
      expect(blockHasData(split())).toBe(false);
    });

    it.each([
      ["only the left half", ROW, undefined],
      ["only the right half", undefined, SHEETS],
      ["both halves", ROW, SHEETS],
    ])("has data with %s filled", (_n, left, right) => {
      expect(blockHasData(split(left, right))).toBe(true);
    });
  });
});

describe("blocksProvideH1 — who owns the page heading", () => {
  // A page built only of profileHero/credentials/tagList blocks has no <h1>,
  // which is what the About page was doing. Pages ask this to decide whether
  // to supply their own, so the outline never depends on an admin's choices.
  it("says no for an empty page", () => {
    expect(blocksProvideH1([])).toBe(false);
  });

  it("says yes for a pageIntro with a heading", () => {
    expect(blocksProvideH1([block("pageIntro", { heading: "About" })])).toBe(true);
  });

  it.each(["", "   ", "\t"])("says no for a pageIntro whose heading is %j", (heading) => {
    expect(blocksProvideH1([block("pageIntro", { heading })])).toBe(false);
  });

  it.each(BLOCK_TYPES.filter((t) => t !== "pageIntro"))(
    "says no for a %s, however populated",
    (type) => {
      expect(blocksProvideH1([block(type, { heading: "Looks like a heading" })])).toBe(false);
    }
  );

  it("finds the pageIntro wherever it sits in the list", () => {
    const blocks = [
      createEmptyBlock("gallery"),
      block("pageIntro", { heading: "About" }),
      createEmptyBlock("tagList"),
    ];
    expect(blocksProvideH1(blocks)).toBe(true);
  });
});

// ── Sanitizers nothing else reaches ──────────────────────────────────────────

describe("comparison views", () => {
  const views = (raw: unknown) => {
    const cleaned = sanitizeBlocks([{ id: "1", type: "comparison", heading: "H", views: raw }]);
    const b = only(cleaned);
    if (b.type !== "comparison") throw new Error("expected a comparison block");
    return b.views;
  };

  it("keeps a view with a usable image", () => {
    expect(views([{ label: "Front", image: IMAGE }])).toEqual([{ label: "Front", image: CLEAN_IMAGE }]);
  });

  // A view is an image with a caption; without the image there is nothing to
  // compare, so the label alone must not survive.
  it.each([
    ["a missing image", [{ label: "Front" }]],
    ["an unsafe image url", [{ label: "Front", image: { url: "javascript:alert(1)" } }]],
    ["a non-object entry", ["nope"]],
    ["a null entry", [null]],
  ])("drops a view with %s", (_n, raw) => {
    expect(views(raw)).toEqual([]);
  });

  it("names an unlabelled view rather than rendering a blank tab", () => {
    expect(at(views([{ image: IMAGE }]), 0).label).toBe("View");
  });

  it("keeps the usable views and drops only the rest", () => {
    const result = views([{ label: "Front", image: IMAGE }, { label: "Back" }, { image: IMAGE }]);
    expect(result.map((v) => v.label)).toEqual(["Front", "View"]);
  });
});

describe("credential entries", () => {
  const items = (raw: unknown) => {
    const cleaned = sanitizeBlocks([{ id: "1", type: "credentials", heading: "H", items: raw }]);
    const b = only(cleaned);
    if (b.type !== "credentials") throw new Error("expected a credentials block");
    return b.items;
  };

  // Any one field is enough: a credential may be just a date, or just a name.
  it.each([
    ["term", { term: "2024" }],
    ["title", { title: "BFA Apparel Design" }],
    ["meta", { meta: "Kent State" }],
    ["description", { description: "Honours" }],
  ])("keeps an entry that has only a %s", (_n, fields) => {
    expect(items([fields])).toHaveLength(1);
  });

  it.each([
    ["every field empty", [{ term: "", title: "", meta: "", description: "" }]],
    ["an empty object", [{}]],
    ["a null entry", [null]],
    ["a non-object entry", [42]],
  ])("drops an entry with %s", (_n, raw) => {
    expect(items(raw)).toEqual([]);
  });

  // `title` is rendered directly, so it is the one field that must never be
  // undefined downstream.
  it("gives a missing title an empty string rather than leaving it unset", () => {
    expect(at(items([{ term: "2024" }]), 0).title).toBe("");
  });
});
