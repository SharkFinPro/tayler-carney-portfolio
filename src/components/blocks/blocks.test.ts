// `sanitizeBlocks` is the single validator run on BOTH render and save, so a
// malformed layout can never break a page. The contract it must hold:
//
//   1. It never throws, for any input at all.
//   2. Unknown or malformed blocks are dropped, not repaired into something
//      that renders wrong.
//   3. Unsafe URLs never survive.
//   4. Containers never nest illegally (a split inside a split, a container
//      inside columns), because the renderers assume that.

import { describe, expect, it } from "vitest";
import {
  BLOCK_TYPES,
  blockHasData,
  createEmptyBlock,
  duplicateBlock,
  sanitizeBlocks,
  type Block,
} from "./blocks";
import { at } from "@/test/at";

const IMG = "https://media.graphassets.com/abc123";

/** Sanitize a single block and return it (or null when it was dropped). */
function one(raw: unknown): Block | null {
  return sanitizeBlocks([raw])[0] ?? null;
}

describe("sanitizeBlocks — never throws", () => {
  const hostile: unknown[] = [
    null,
    undefined,
    0,
    1,
    -1,
    NaN,
    Infinity,
    "",
    "a string",
    true,
    false,
    {},
    [],
    [[[[]]]],
    [null, undefined, 0, ""],
    [{ type: "richText" }],
    // Written as an escape, not a literal NUL: a raw control byte makes git
    // classify this whole file as binary, which hides every test in it from a
    // diff. The value the test sees is identical.
    [{ type: "\u0000" }],
    [{ type: "constructor" }],
    [{ type: "__proto__" }],
    [{ type: "toString" }],
    { entries: [] },
    Symbol,
    () => {},
    new Date(),
    new Map(),
  ];

  for (const [i, input] of hostile.entries()) {
    it(`survives hostile input #${i}`, () => {
      expect(() => sanitizeBlocks(input)).not.toThrow();
      expect(Array.isArray(sanitizeBlocks(input))).toBe(true);
    });
  }

  it("returns [] for anything that is not an array", () => {
    expect(sanitizeBlocks(null)).toEqual([]);
    expect(sanitizeBlocks({ type: "richText" })).toEqual([]);
    expect(sanitizeBlocks("[]")).toEqual([]);
  });

  it("survives a deeply nested split chain without blowing the stack", () => {
    // A linear chain of splits 2000 deep — nesting only through `left`, which
    // is the deepest structure that can actually arrive as JSON (a chain that
    // branched on both sides would be exponentially large on the wire).
    // ~200 KB of payload; the sanitizer handles it in single-digit ms.
    let node: Record<string, unknown> = { type: "richText", id: "leaf", heading: "" };
    for (let i = 0; i < 2000; i++) {
      node = {
        type: "split",
        id: `s${i}`,
        heading: "",
        left: node,
        right: { type: "richText", id: `r${i}`, heading: "" },
      };
    }
    expect(() => sanitizeBlocks([node])).not.toThrow();
    // Only the outermost split survives as a top-level block; every nested
    // split collapses to an empty richText via cleanChild.
    const out = sanitizeBlocks([node]);
    expect(out).toHaveLength(1);
    expect(at(out, 0).type).toBe("split");
  });
});

describe("sanitizeBlocks — drops what it cannot validate", () => {
  it("drops a block with an unrecognized type", () => {
    expect(one({ type: "definitelyNotABlock", id: "x", heading: "" })).toBeNull();
  });

  it("drops a block with no type at all", () => {
    expect(one({ id: "x", heading: "hello" })).toBeNull();
  });

  it("does not treat inherited Object properties as block types", () => {
    // `type in BLOCK_LABELS` would be true for "toString" if the guard used a
    // bare `in` against a prototype-bearing object.
    expect(one({ type: "toString", id: "x", heading: "" })).toBeNull();
    expect(one({ type: "hasOwnProperty", id: "x", heading: "" })).toBeNull();
  });

  it("keeps the valid blocks either side of an invalid one", () => {
    const out = sanitizeBlocks([
      { type: "specs", id: "a", heading: "A", rows: [{ label: "L", value: "V" }] },
      { type: "garbage" },
      { type: "specs", id: "b", heading: "B", rows: [{ label: "L", value: "V" }] },
    ]);
    expect(out.map((b) => b.id)).toEqual(["a", "b"]);
  });
});

describe("sanitizeBlocks — URL safety", () => {
  const unsafe = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox",
    "file:///etc/passwd",
  ];

  for (const url of unsafe) {
    it(`strips a gallery image with an unsafe url: ${JSON.stringify(url)}`, () => {
      const block = one({ type: "gallery", id: "g", heading: "", images: [{ url }] });
      expect(block).not.toBeNull();
      expect(block).toMatchObject({ type: "gallery", images: [] });
    });
  }

  it("keeps a safe https image url", () => {
    const block = one({ type: "gallery", id: "g", heading: "", images: [{ url: IMG }] });
    expect(block).toMatchObject({ type: "gallery", images: [{ url: IMG }] });
  });

  it("nulls a singleImage whose url is unsafe", () => {
    const block = one({
      type: "singleImage",
      id: "s",
      heading: "",
      image: { url: "javascript:alert(1)" },
    });
    expect(block).toMatchObject({ type: "singleImage", image: null });
  });

  it("falls back to '/' for an unsafe cta href rather than dropping the block", () => {
    const block = one({
      type: "cta",
      id: "c",
      heading: "Get in touch",
      buttonLabel: "Email",
      buttonHref: "javascript:alert(1)",
    });
    expect(block).toMatchObject({ type: "cta", buttonHref: "/" });
  });
});

describe("sanitizeBlocks — container nesting rules", () => {
  it("collapses a split nested inside a split to an empty richText", () => {
    const block = one({
      type: "split",
      id: "outer",
      heading: "",
      left: { type: "split", id: "inner", heading: "", left: null, right: null },
      right: { type: "specs", id: "sp", heading: "", rows: [] },
    });
    expect(block).not.toBeNull();
    if (block?.type !== "split") throw new Error("expected a split");
    expect(block.left.type).toBe("richText");
    expect(block.right.type).toBe("specs");
  });

  it("always gives a split two well-formed children", () => {
    const block = one({ type: "split", id: "s", heading: "", left: null, right: "nonsense" });
    if (block?.type !== "split") throw new Error("expected a split");
    expect(block.left).toBeTruthy();
    expect(block.right).toBeTruthy();
    expect(block.left.type).toBe("richText");
    expect(block.right.type).toBe("richText");
  });

  it("drops container children from a columns block", () => {
    const block = one({
      type: "columns",
      id: "c",
      heading: "",
      items: [
        { type: "specs", id: "ok", heading: "", rows: [] },
        { type: "columns", id: "nested", heading: "", items: [] },
        { type: "split", id: "sp", heading: "", left: null, right: null },
      ],
    });
    if (block?.type !== "columns") throw new Error("expected columns");
    expect(block.items.map((i) => i.type)).toEqual(["specs"]);
  });

  it("caps columns children at 4", () => {
    const block = one({
      type: "columns",
      id: "c",
      heading: "",
      items: Array.from({ length: 12 }, (_, i) => ({
        type: "specs",
        id: `s${i}`,
        heading: "",
        rows: [],
      })),
    });
    if (block?.type !== "columns") throw new Error("expected columns");
    expect(block.items).toHaveLength(4);
  });
});

describe("createEmptyBlock", () => {
  it("produces a sanitizer-stable block for every type in the palette", () => {
    for (const type of BLOCK_TYPES) {
      const empty = createEmptyBlock(type);
      expect(empty.type, `createEmptyBlock(${type})`).toBe(type);

      // The editor writes these straight to the CMS, so a freshly created
      // block must survive the same validator that runs on save.
      const round = one(structuredClone(empty));
      expect(round, `sanitizeBlocks dropped a fresh ${type}`).not.toBeNull();
      expect(round?.type).toBe(type);
    }
  });

  it("gives every block a distinct id", () => {
    const ids = BLOCK_TYPES.map(() => createEmptyBlock("richText").id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("starts every block empty, so the editor's 'add content' guard fires", () => {
    // `cta` and `entry` count their heading as data and `split` inherits from
    // its children, so they are legitimately exempt from this.
    const alwaysEmpty = BLOCK_TYPES.filter((t) => !["cta", "entry", "split"].includes(t));
    for (const type of alwaysEmpty) {
      expect(blockHasData(createEmptyBlock(type)), `${type} should start empty`).toBe(false);
    }
  });
});

describe("sanitizeBlocks — idempotence", () => {
  it("is stable when run twice (render and save must agree)", () => {
    const raw = [
      { type: "gallery", id: "g", heading: "Looks", images: [{ url: IMG, altText: "  " }] },
      { type: "specs", id: "s", heading: "Spec", rows: [{ label: "Fabric", value: "Wool" }] },
      {
        type: "split",
        id: "sp",
        heading: "",
        left: { type: "callout", id: "c", heading: "", variant: "quote", text: "Hi" },
        right: { type: "tagList", id: "t", heading: "", tone: "dark", tags: ["a", "b"] },
      },
    ];
    const once = sanitizeBlocks(raw);
    const twice = sanitizeBlocks(structuredClone(once));
    expect(twice).toEqual(once);
  });
});

describe("duplicateBlock", () => {
  it("copies content but issues a new id", () => {
    const original = one({
      type: "specs",
      id: "orig",
      heading: "Spec",
      rows: [{ label: "Fabric", value: "Wool" }],
    })!;
    const copy = duplicateBlock(original);

    expect(copy.id).not.toBe(original.id);
    expect({ ...copy, id: "" }).toEqual({ ...original, id: "" });
  });

  it("does not share structure with the original", () => {
    const original = one({
      type: "specs",
      id: "orig",
      heading: "Spec",
      rows: [{ label: "A", value: "1" }],
    })!;
    const copy = duplicateBlock(original);

    if (copy.type !== "specs" || original.type !== "specs") throw new Error("expected specs");
    at(copy.rows, 0).value = "changed";
    expect(at(original.rows, 0).value).toBe("1");
  });

  it("re-ids a split's children too", () => {
    // React keys and the drag reorder both key on `id`, so children sharing
    // ids with the original would make the two copies behave as one.
    const original = one({
      type: "split",
      id: "sp",
      heading: "",
      left: { type: "specs", id: "L", heading: "", rows: [{ label: "a", value: "b" }] },
      right: { type: "callout", id: "R", heading: "", variant: "info", text: "hi" },
    })!;
    const copy = duplicateBlock(original);

    if (copy.type !== "split" || original.type !== "split") throw new Error("expected split");
    expect(copy.left.id).not.toBe(original.left.id);
    expect(copy.right.id).not.toBe(original.right.id);
  });

  it("re-ids every child of a columns container", () => {
    const original = one({
      type: "columns",
      id: "c",
      heading: "",
      items: [
        { type: "specs", id: "a", heading: "", rows: [{ label: "x", value: "y" }] },
        { type: "specs", id: "b", heading: "", rows: [{ label: "x", value: "y" }] },
      ],
    })!;
    const copy = duplicateBlock(original);

    if (copy.type !== "columns" || original.type !== "columns") throw new Error("expected columns");
    const originalIds = original.items.map((i) => i.id);
    for (const item of copy.items) expect(originalIds).not.toContain(item.id);
    // ...and the copies aren't duplicates of each other either.
    expect(new Set(copy.items.map((i) => i.id)).size).toBe(copy.items.length);
  });

  it("produces a block that survives the sanitizer", () => {
    for (const type of BLOCK_TYPES) {
      const copy = duplicateBlock(createEmptyBlock(type));
      expect(one(structuredClone(copy)), type).not.toBeNull();
    }
  });

  it("gives every duplicate a distinct id", () => {
    const original = createEmptyBlock("specs");
    const ids = Array.from({ length: 20 }, () => duplicateBlock(original).id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("new layouts — timeline", () => {
  it("keeps a stage with any one of its three fields", () => {
    const block = one({
      type: "timeline",
      id: "t",
      heading: "",
      stages: [
        { marker: "Week 1", title: "Draping", description: "Toile on the stand." },
        { marker: "Week 2" },
        { title: "Fitting" },
        { description: "Notes only" },
      ],
    });
    if (block?.type !== "timeline") throw new Error("expected timeline");
    expect(block.stages).toHaveLength(4);
  });

  it("drops entirely blank stages", () => {
    const block = one({
      type: "timeline",
      id: "t",
      heading: "",
      stages: [{ marker: "W1", title: "", description: "" }, {}, null, { marker: "   " }],
    });
    if (block?.type !== "timeline") throw new Error("expected timeline");
    expect(block.stages).toHaveLength(1);
  });

  it("preserves stage order", () => {
    const block = one({
      type: "timeline",
      id: "t",
      heading: "",
      stages: [{ title: "A" }, { title: "B" }, { title: "C" }],
    });
    if (block?.type !== "timeline") throw new Error("expected timeline");
    expect(block.stages.map((s) => s.title)).toEqual(["A", "B", "C"]);
  });
});

describe("new layouts — beforeAfter", () => {
  const withImages = {
    type: "beforeAfter",
    id: "ba",
    heading: "",
    before: { label: "Sketch", image: { url: IMG } },
    after: { label: "Garment", image: { url: `${IMG}2` } },
  };

  it("keeps both labelled sides", () => {
    const block = one(withImages);
    if (block?.type !== "beforeAfter") throw new Error("expected beforeAfter");
    expect(block.before.label).toBe("Sketch");
    expect(block.after.image.url).toBe(`${IMG}2`);
  });

  it("renders only when BOTH images are present", () => {
    // A wipe with one image is not a comparison.
    expect(blockHasData(one(withImages)!)).toBe(true);
    expect(
      blockHasData(one({ ...withImages, after: { label: "After", image: { url: "" } } })!)
    ).toBe(false);
    expect(
      blockHasData(one({ ...withImages, before: { label: "Before", image: null } })!)
    ).toBe(false);
  });

  it("always keeps two structural sides, even when empty", () => {
    // cleanSide must not drop a side — the block is a fixed pair.
    const block = one({ type: "beforeAfter", id: "ba", heading: "" });
    if (block?.type !== "beforeAfter") throw new Error("expected beforeAfter");
    expect(block.before).toBeTruthy();
    expect(block.after).toBeTruthy();
    expect(block.before.label).toBe("Before");
    expect(block.after.label).toBe("After");
  });

  it("strips an unsafe image url to empty rather than dropping the side", () => {
    const block = one({
      ...withImages,
      before: { label: "Sketch", image: { url: "javascript:alert(1)" } },
    });
    if (block?.type !== "beforeAfter") throw new Error("expected beforeAfter");
    expect(block.before.image.url).toBe("");
    expect(blockHasData(block)).toBe(false);
  });
});

describe("new layouts — swatches", () => {
  it("accepts a flat colour", () => {
    const block = one({
      type: "swatches",
      id: "s",
      heading: "",
      items: [{ name: "Oxblood", detail: "Wool melton", color: "#7B1E22" }],
    });
    if (block?.type !== "swatches") throw new Error("expected swatches");
    expect(at(block.items, 0).color).toBe("#7b1e22");
  });

  it.each(["#fff", "#FFFFFF", "#a0522d"])("accepts the hex form %s", (color) => {
    const block = one({ type: "swatches", id: "s", heading: "", items: [{ name: "x", color }] });
    if (block?.type !== "swatches") throw new Error("expected swatches");
    expect(at(block.items, 0).color).toBe(color.toLowerCase());
  });

  it.each([
    "red",
    "rgb(1,2,3)",
    "#12345",
    "#gggggg",
    "expression(alert(1))",
    "; background: url(x)",
  ])("rejects %j, since the value goes into an inline style", (color) => {
    const block = one({ type: "swatches", id: "s", heading: "", items: [{ name: "x", color }] });
    if (block?.type !== "swatches") throw new Error("expected swatches");
    expect(at(block.items, 0).color).toBe("");
  });

  it("keeps an entry that has a photo but no colour", () => {
    const block = one({
      type: "swatches",
      id: "s",
      heading: "",
      items: [{ image: { url: IMG } }],
    });
    if (block?.type !== "swatches") throw new Error("expected swatches");
    expect(block.items).toHaveLength(1);
    expect(at(block.items, 0).image?.url).toBe(IMG);
  });

  it("drops an entry with nothing to show at all", () => {
    const block = one({
      type: "swatches",
      id: "s",
      heading: "",
      items: [{ name: "Keep" }, { detail: "no name, no colour, no photo" }, {}, null],
    });
    if (block?.type !== "swatches") throw new Error("expected swatches");
    expect(block.items.map((i) => i.name)).toEqual(["Keep"]);
  });
});

describe("new layouts — annotatedImage", () => {
  const withPoints = (points: unknown) =>
    one({ type: "annotatedImage", id: "a", heading: "", image: { url: IMG }, points });

  function points(raw: unknown) {
    const block = withPoints(raw);
    if (block?.type !== "annotatedImage") throw new Error("expected annotatedImage");
    return block.points;
  }

  it("keeps a marker with a label and a position", () => {
    expect(points([{ x: 25, y: 60, label: "Shoulder seam", detail: "Set 1cm forward." }])).toEqual([
      { x: 25, y: 60, label: "Shoulder seam", detail: "Set 1cm forward." },
    ]);
  });

  it.each([
    [-40, 0],
    [140, 100],
    [100.04, 100],
  ])("clamps a coordinate of %s to %s", (input, expected) => {
    // Clamped rather than dropped: a marker off the edge is a bug in whatever
    // wrote it, and pinning it to the border keeps it visible and fixable.
    expect(at(points([{ x: input, y: input, label: "L" }]), 0)).toMatchObject({
      x: expected,
      y: expected,
    });
  });

  it("rounds to a tenth of a percent", () => {
    expect(at(points([{ x: 33.333333, y: 66.666666, label: "L" }]), 0)).toMatchObject({
      x: 33.3,
      y: 66.7,
    });
  });

  it.each([null, undefined, "40%", "", NaN, {}, []])(
    "falls back to centre for the unusable coordinate %j",
    (x) => {
      // Note `null`, `""` and `[]` all coerce to 0 through `Number`, which
      // would pin the marker to the top-left corner and read as deliberate.
      expect(at(points([{ x, y: 10, label: "L" }]), 0).x).toBe(50);
    }
  );

  it("accepts a numeric string, since a form field produces one", () => {
    expect(at(points([{ x: "42.5", y: "10", label: "L" }]), 0)).toMatchObject({ x: 42.5, y: 10 });
  });

  it("drops a marker with nothing to say", () => {
    // A dot on a photograph explains nothing; the coordinate alone is not a
    // reason to render one.
    expect(points([{ x: 10, y: 10 }, { x: 20, y: 20, label: "Keep" }, {}, null])).toHaveLength(1);
  });

  it("keeps a marker that has only a detail", () => {
    expect(points([{ x: 10, y: 10, detail: "Bar tack here." }])).toHaveLength(1);
  });

  it("caps the number of markers", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ x: i, y: i, label: `L${i}` }));
    expect(points(many).length).toBeLessThanOrEqual(20);
  });

  it("survives a points value that is not an array", () => {
    for (const raw of ["nope", 5, {}, null, undefined]) {
      expect(points(raw)).toEqual([]);
    }
  });

  it("renders with an image and no markers, but not the other way round", () => {
    const withImage = one({ type: "annotatedImage", id: "a", heading: "", image: { url: IMG }, points: [] });
    const withoutImage = one({ type: "annotatedImage", id: "a", heading: "", image: null, points: [{ x: 1, y: 1, label: "L" }] });
    expect(withImage && blockHasData(withImage)).toBe(true);
    expect(withoutImage && blockHasData(withoutImage)).toBe(false);
  });
});

describe("new layouts — stats", () => {
  function items(raw: unknown) {
    const block = one({ type: "stats", id: "s", heading: "", items: raw });
    if (block?.type !== "stats") throw new Error("expected stats");
    return block.items;
  }

  it("keeps a figure with a value and a label", () => {
    expect(items([{ value: "48", label: "Pattern pieces", detail: "Excluding facings." }])).toEqual([
      { value: "48", label: "Pattern pieces", detail: "Excluding facings." },
    ]);
  });

  it("keeps a figure with only one of the two", () => {
    expect(items([{ value: "48" }, { label: "Fittings" }])).toHaveLength(2);
  });

  it("drops a figure that is only a detail", () => {
    expect(items([{ detail: "a caption for nothing" }])).toEqual([]);
  });

  it("trims, so a stray space never reaches the layout", () => {
    expect(at(items([{ value: "  12  ", label: " Weeks " }]), 0)).toEqual({
      value: "12",
      label: "Weeks",
      detail: "",
    });
  });

  it("survives an items value that is not an array", () => {
    for (const raw of ["nope", 5, {}, null, undefined]) {
      expect(items(raw)).toEqual([]);
    }
  });
});
