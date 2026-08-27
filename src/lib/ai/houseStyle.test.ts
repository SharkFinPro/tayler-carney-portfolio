// The outliner reads pages other code wrote and turns them into a prompt hint.
//
// The properties that matter:
//   - It never throws on a stored layout, however malformed. A bad page must
//     cost its own example, not the whole draft.
//   - It describes a page in the six kinds the model can actually emit.
//   - It carries structure, never the designer's prose.

import { describe, expect, it } from "vitest";
import { outlinePage, outlinePages } from "./houseStyle";
import { at, only } from "@/test/at";
import { BLOCK_TYPES, createEmptyBlock, type BlockType } from "@/components/blocks/blocks";

const IMG = "https://media.graphassets.com/aaa.jpg";

const richText = (text: string) => ({
  children: [{ type: "paragraph", children: [{ text }] }],
});

const layout = [
  { id: "1", type: "pageIntro", heading: "Wool Coat", eyebrow: "Case study", body: richText("A study.") },
  { id: "2", type: "richText", heading: "Approach", content: richText("Secret prose.") },
  {
    id: "3",
    type: "gallery",
    heading: "Flats",
    layout: "grid",
    images: [{ url: IMG }, { url: IMG }, { url: IMG }],
  },
];

describe("outlinePage", () => {
  it("describes a page in the kinds a model can emit", () => {
    const out = outlinePage("Wool Coat", layout);
    expect(out?.sections).toEqual([
      { kind: "intro", heading: "Wool Coat", imageCount: 0 },
      { kind: "prose", heading: "Approach", imageCount: 0 },
      { kind: "gallery", heading: "Flats", imageCount: 3 },
    ]);
  });

  it("carries no prose — only the shape crosses into the prompt", () => {
    // The copy on an existing page is the designer's; putting it in the prompt
    // invites a draft that echoes those sentences rather than that shape.
    expect(JSON.stringify(outlinePage("Wool Coat", layout))).not.toContain("Secret prose");
  });

  it("counts the images a section carries, which is the load-bearing signal", () => {
    // A model that cannot see this puts one image per section, and the site
    // runs galleries of a dozen.
    const out = outlinePage("P", [
      { id: "1", type: "gallery", heading: "G", layout: "grid", images: [{ url: IMG }, { url: IMG }] },
    ]);
    expect(only(out?.sections ?? []).imageCount).toBe(2);
  });

  it("reads a container as its children rather than as itself", () => {
    const out = outlinePage("P", [
      {
        id: "1",
        type: "split",
        heading: "",
        left: { id: "2", type: "specs", heading: "Spec", rows: [{ label: "Material", value: "Wool" }] },
        right: { id: "3", type: "gallery", heading: "Flats", layout: "grid", images: [{ url: IMG }] },
      },
    ]);
    expect(out?.sections.map((s) => s.kind)).toEqual(["specs", "gallery"]);
  });

  it("leaves out blocks with no drafting equivalent", () => {
    const out = outlinePage("P", [
      { id: "1", type: "cta", heading: "Get in touch", buttonLabel: "Email", buttonHref: "/contact" },
      { id: "2", type: "richText", heading: "Notes", content: richText("x") },
    ]);
    expect(only(out?.sections ?? []).kind).toBe("prose");
  });

  it("returns null for a page with nothing to learn from", () => {
    expect(outlinePage("Empty", [])).toBeNull();
    expect(outlinePage("Missing", null)).toBeNull();
    expect(outlinePage("Only furniture", [
      { id: "1", type: "cta", heading: "x", buttonLabel: "y", buttonHref: "/z" },
    ])).toBeNull();
  });

  it.each([null, undefined, "nope", 42, {}, [null], [{ type: "gallery" }], [{ type: "__proto__" }]])(
    "never throws on the stored layout %j",
    (stored) => {
      expect(() => outlinePage("P", stored)).not.toThrow();
    }
  );
});

describe("outlinePages", () => {
  const pages = [
    { title: "One", layout },
    { title: "Two", layout: [{ id: "1", type: "richText", heading: "Only", content: richText("x") }] },
    { title: "Three", layout: [] },
  ];

  it("skips pages that outlined to nothing", () => {
    expect(outlinePages(pages).map((p) => p.title)).toEqual(["One", "Two"]);
  });

  it("puts the richer page first — it says more about the house style", () => {
    expect(at(outlinePages(pages), 0).title).toBe("One");
  });

  it("excludes the page being drafted, which would anchor a redraft to itself", () => {
    expect(outlinePages(pages, "one").map((p) => p.title)).toEqual(["Two"]);
    expect(outlinePages(pages, "  ONE  ").map((p) => p.title)).toEqual(["Two"]);
  });

  it("shows a handful, not the whole portfolio", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `P${i}`, layout }));
    expect(outlinePages(many)).toHaveLength(4);
  });
});

// ── Every block type, and what the outline calls it ──────────────────────────
//
// NEAREST_KIND maps all twenty-two block types onto the six kinds a model can
// emit, or to null for the ones with no drafting equivalent. The cases above
// exercise a handful of entries; mutation testing found the rest — blanking an
// entry makes `if (!kind) return []` fire, so the block silently vanishes from
// the outline and every existing assertion still passes.
//
// The expectations are literals, but the *coverage* check below is driven from
// BLOCK_TYPES, so a block type added later cannot slip past unnamed.

/** The kinds a one-block page outlines to. */
const kindsFor = (type: BlockType): string[] => {
  const page = outlinePage("A page", [createEmptyBlock(type)]);
  return (page?.sections ?? []).map((s) => s.kind);
};

/**
 * Block types that produce no section of their own.
 *
 * Two different reasons, kept apart because they are different decisions:
 * CONTAINERS describe arrangement, so the outline reads them as their
 * children; FURNITURE is page chrome a case study does not draft, and is left
 * out entirely.
 */
const CONTAINERS: BlockType[] = ["split", "columns"];
const FURNITURE: BlockType[] = ["profileHero", "tagList", "cta"];

const MAPPED: [BlockType, string][] = [
  ["pageIntro", "intro"],
  ["richText", "prose"],
  ["callout", "prose"],
  ["gallery", "gallery"],
  ["singleImage", "gallery"],
  ["swatches", "gallery"],
  ["comparison", "gallery"],
  ["beforeAfter", "gallery"],
  ["annotatedImage", "gallery"],
  ["mediaShowcase", "captioned"],
  ["documentViewer", "captioned"],
  ["entry", "captioned"],
  ["specs", "specs"],
  ["stats", "specs"],
  ["credentials", "specs"],
  ["timeline", "timeline"],
];

describe("outlinePage — the block-type vocabulary", () => {
  it.each(MAPPED)("outlines a %s block as a %s section", (type, kind) => {
    expect(kindsFor(type)).toEqual([kind]);
  });

  // Page furniture a case study does not draft: left out entirely rather than
  // misrepresented as a kind it is not.
  it.each(FURNITURE)("leaves a %s out of the outline entirely", (type) => {
    expect(kindsFor(type)).toEqual([]);
  });

  // A container carries no kind of its own, but its children do, so it reads
  // as them rather than as nothing. Asserted against the block's real default
  // children: a split pairs specs with a document viewer, a columns row holds
  // two credential lists.
  it.each([
    ["split", ["specs", "captioned"]],
    ["columns", ["specs", "specs"]],
  ] as const)("reads a %s as its children, %j", (type, kinds) => {
    expect(kindsFor(type)).toEqual(kinds);
  });

  // The drift guard: every block type is either mapped above or deliberately
  // omitted, so adding one without deciding what it looks like from the
  // drafting side fails here.
  it("accounts for every block type the editor can produce", () => {
    const named = new Set<string>([...MAPPED.map(([t]) => t), ...CONTAINERS, ...FURNITURE]);

    for (const type of BLOCK_TYPES) {
      expect(named, `no case decides what a ${type} outlines to`).toContain(type);
    }
    expect(named.size).toBe(BLOCK_TYPES.length);
  });
});

describe("outlinePage — containers read as their children", () => {
  // `split` is covered above; `columns` is the other container and had no case,
  // so removing its arm left it outlining as nothing at all.
  it("reads a columns row as the blocks inside it", () => {
    const page = outlinePage("A page", [
      {
        id: "c1",
        type: "columns",
        heading: "Row",
        items: [createEmptyBlock("richText"), createEmptyBlock("gallery")],
      },
    ]);

    expect((page?.sections ?? []).map((s) => s.kind)).toEqual(["prose", "gallery"]);
  });

  // A container inside a container is not reachable: CHILD_BLOCK_TYPES
  // excludes the container types, so the sanitizer drops one before the
  // outline ever sees it. Asserted so the flattening recursion is understood
  // as one level deep by construction rather than by luck.
  it("cannot nest a container inside a container", () => {
    const page = outlinePage("A page", [
      {
        id: "c1",
        type: "columns",
        heading: "Row",
        items: [
          {
            id: "s1",
            type: "split",
            heading: "Pair",
            left: createEmptyBlock("specs"),
            right: createEmptyBlock("timeline"),
          },
        ],
      },
    ]);

    expect(page).toBeNull();
  });
});

describe("outlinePage — counting the images a section carries", () => {
  const countFor = (block: unknown) =>
    at(outlinePage("A page", [block])?.sections ?? [], 0).imageCount;

  it("counts an image wherever it is nested", () => {
    expect(
      countFor({
        id: "g1",
        type: "gallery",
        heading: "H",
        layout: "grid",
        images: [{ url: IMG }, { url: IMG }, { url: IMG }],
      })
    ).toBe(3);
  });

  it("counts images held under a key that is not `images`", () => {
    expect(
      countFor({
        id: "m1",
        type: "mediaShowcase",
        heading: "H",
        layout: "cards",
        items: [
          { title: "A", description: "", image: { url: IMG } },
          { title: "B", description: "", image: { url: IMG } },
        ],
      })
    ).toBe(2);
  });

  it("counts nothing for a block that carries no images", () => {
    expect(countFor(createEmptyBlock("specs"))).toBe(0);
  });

  // A url that is present but empty is not an image, and the walk has to keep
  // descending past a value that is not an object rather than counting it.
  it("does not count an empty url as an image", () => {
    expect(
      countFor({ id: "g1", type: "gallery", heading: "H", layout: "grid", images: [{ url: "" }] })
    ).toBe(0);
  });
});

describe("outlinePage / outlinePages — the strings that reach the prompt", () => {
  it("trims the heading it reports", () => {
    const page = outlinePage("A page", [
      { id: "r1", type: "richText", heading: "  Spaced  ", content: richText("Body") },
    ]);
    expect(at(page?.sections ?? [], 0).heading).toBe("Spaced");
  });

  it("trims the title it reports", () => {
    expect(outlinePage("  A page  ", layout)?.title).toBe("A page");
  });

  it("caps how much of one page it shows", () => {
    const many = Array.from({ length: 30 }, () => createEmptyBlock("richText"));
    expect(outlinePage("A page", many)?.sections.length).toBe(12);
  });
});

describe("outlinePages — ordering and exclusion", () => {
  const pageOf = (title: string, count: number) => ({
    title,
    layout: Array.from({ length: count }, () => createEmptyBlock("richText")),
  });

  // Three distinct lengths, so a sort that added instead of subtracting, or
  // that did not sort at all, produces a different order.
  it("orders richest first across more than two pages", () => {
    const out = outlinePages([pageOf("small", 1), pageOf("big", 5), pageOf("mid", 3)]);
    expect(out.map((p) => p.title)).toEqual(["big", "mid", "small"]);
  });

  it.each(["  Big  ", "BIG", "big"])("excludes the page being drafted, matching %j", (exclude) => {
    const out = outlinePages([pageOf("Big", 5), pageOf("Other", 3)], exclude);
    expect(out.map((p) => p.title)).toEqual(["Other"]);
  });

  // The stored title is trimmed too, not just the one the form supplied. CMS
  // titles are arbitrary strings, and a trailing space in one would otherwise
  // stop the page being recognized as the one being drafted — so a redraft
  // would be offered its own current layout as an example of itself, which is
  // exactly what the exclusion exists to prevent.
  it.each(["  Big  ", "Big ", " Big"])("excludes a page whose own title is %j", (title) => {
    const out = outlinePages([pageOf(title, 5), pageOf("Other", 3)], "Big");
    expect(out.map((p) => p.title)).toEqual(["Other"]);
  });

  it("excludes nothing when no title is given", () => {
    const out = outlinePages([pageOf("Big", 5), pageOf("Other", 3)]);
    expect(out).toHaveLength(2);
  });

  it.each(["", "   "])("treats the blank exclusion %j as excluding nothing", (exclude) => {
    const out = outlinePages([pageOf("Big", 5), pageOf("Other", 3)], exclude);
    expect(out).toHaveLength(2);
  });
});
