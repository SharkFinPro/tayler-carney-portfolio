// The legacy-project fallback.
//
// `projectToBlocks` is not migration tooling that has run and retired — it is
// live, and it renders the project page for any project whose `projectPage`
// layout has never been authored (see ProjectPageClient, which calls it
// whenever `project.projectPage` is null). So it is the difference between an
// old project rendering and rendering blank, and none of it was covered.
//
// Three things are worth pinning:
//
//   1. The section order, because it *is* the page. A reordering here silently
//      rearranges every unmigrated project.
//   2. That an absent section produces no block at all, rather than an empty
//      one. An empty heading with nothing under it is worse than a gap.
//   3. That an unsafe image URL is dropped, since these URLs go straight into
//      image sources.

import { describe, expect, it } from "vitest";
import { at, only } from "@/test/at";
import { projectToBlocks, type LegacyProject } from "./blocks";

/** A CMS-shaped image. */
const img = (url = "https://media.graphassets.com/a.jpg", altText?: string) => ({ url, altText });

/** A CMS-shaped captioned item. */
const item = (title = "T", description = "D", url?: string) => ({
  title,
  description,
  image: img(url),
});

const headings = (p: LegacyProject) => projectToBlocks(p).map((b) => b.heading);
const types = (p: LegacyProject) => projectToBlocks(p).map((b) => b.type);

describe("an empty project", () => {
  it.each([{}, { sketches: [] }, { coloredFlats: [] }, { techPackHeader: {} }])(
    "produces no blocks at all for %j",
    (project) => {
      expect(projectToBlocks(project as LegacyProject)).toEqual([]);
    }
  );

  // Every section is independently optional, so a project with one populated
  // field must yield exactly one block rather than a page of empty headings.
  it("emits only the sections that have content", () => {
    expect(headings({ sketches: [img()] })).toEqual(["Initial Sketches"]);
  });
});

describe("the section order — it is the page", () => {
  // Every section populated, so the order below is the full running order.
  const full: LegacyProject = {
    sketches: [img()],
    digitalRendering: img(),
    frontFlat: img(),
    backFlat: img(),
    sideFlat: img(),
    coloredFlats: [item()],
    looks: [item()],
    details: [item()],
    patterns: [img()],
    materials: [item()],
    techPackHeader: { fabricContent: "Wool" },
    techPacks: [item()],
    finalProduct: [img()],
  };

  it("runs sketches → rendering → flats → … → final product", () => {
    expect(headings(full)).toEqual([
      "Initial Sketches",
      "Digital Rendering",
      "Technical Flats",
      "Colored Flats",
      "Looks",
      "Details",
      "Pattern Drafting",
      "Materials List",
      "Tech Pack",
      "Final Product",
    ]);
  });

  it("maps each section onto the block type that renders it", () => {
    expect(types(full)).toEqual([
      "gallery",
      "singleImage",
      "comparison",
      "mediaShowcase",
      "mediaShowcase",
      "mediaShowcase",
      "gallery",
      "mediaShowcase",
      "split",
      "gallery",
    ]);
  });

  // Layout is not incidental: the final product is the feature shot and the
  // detail grid is a grid, which is what distinguishes them on the page.
  it.each([
    ["Initial Sketches", "grid"],
    ["Pattern Drafting", "grid"],
    ["Final Product", "feature"],
    ["Colored Flats", "cards"],
    ["Looks", "cards"],
    ["Details", "grid"],
    ["Materials List", "cards"],
  ])("gives %j the %j layout", (heading, layout) => {
    const block = projectToBlocks(full).find((b) => b.heading === heading);
    expect(block).toMatchObject({ layout });
  });
});

describe("technical flats", () => {
  it("labels each view it was given, in front/back/side order", () => {
    const block = only(projectToBlocks({ frontFlat: img(), backFlat: img(), sideFlat: img() }));
    if (block.type !== "comparison") throw new Error("expected a comparison block");

    expect(block.views.map((v) => v.label)).toEqual(["Front", "Back", "Side"]);
  });

  it.each([
    [{ frontFlat: img() }, ["Front"]],
    [{ backFlat: img() }, ["Back"]],
    [{ sideFlat: img() }, ["Side"]],
    [{ frontFlat: img(), sideFlat: img() }, ["Front", "Side"]],
  ])("includes only the views present in %j", (project, expected) => {
    const block = only(projectToBlocks(project as LegacyProject));
    if (block.type !== "comparison") throw new Error("expected a comparison block");

    expect(block.views.map((v) => v.label)).toEqual(expected);
  });

  it("emits nothing when every flat is missing", () => {
    expect(projectToBlocks({ coloredFlats: [] })).toEqual([]);
  });
});

describe("the tech pack — three shapes, not one", () => {
  const header = { fabricContent: "Wool" };

  it("pairs the spec table with the sheet viewer when it has both", () => {
    const block = only(projectToBlocks({ techPackHeader: header, techPacks: [item()] }));
    if (block.type !== "split") throw new Error("expected a split block");

    expect(block.left.type).toBe("specs");
    expect(block.right.type).toBe("documentViewer");
    // The outer block carries the heading; the halves must not repeat it.
    expect(block.heading).toBe("Tech Pack");
    expect(block.left.heading).toBe("");
    expect(block.right.heading).toBe("");
  });

  it("falls back to a plain spec table with no sheets", () => {
    const block = only(projectToBlocks({ techPackHeader: header }));
    expect(block).toMatchObject({ type: "specs", heading: "Tech Pack" });
  });

  it("falls back to a plain sheet viewer with no header", () => {
    const block = only(projectToBlocks({ techPacks: [item()] }));
    expect(block).toMatchObject({ type: "documentViewer", heading: "Tech Pack" });
  });
});

describe("legacy tech-pack header rows", () => {
  const rowsOf = (techPackHeader: Record<string, unknown>) => {
    const block = only(projectToBlocks({ techPackHeader } as LegacyProject));
    if (block.type !== "specs") throw new Error("expected a specs block");
    return block.rows;
  };

  // The old schema stored camelCase keys; they are labels on a rendered table.
  it.each([
    ["fabricContent", "Fabric Content"],
    ["careInstructions", "Care Instructions"],
    ["size", "Size"],
    ["sizeRangeOffered", "Size Range Offered"],
  ])("humanizes the key %j into %j", (key, label) => {
    expect(at(rowsOf({ [key]: "x" }), 0).label).toBe(label);
  });

  it("keeps numbers, as strings", () => {
    expect(at(rowsOf({ year: 2024 }), 0)).toEqual({ label: "Year", value: "2024" });
  });

  it.each([
    ["an object", { nested: { a: 1 } }],
    ["an array", { list: [1, 2] }],
    ["a null", { missing: null }],
    ["a boolean", { flag: true }],
  ])("drops %s rather than rendering it as [object Object]", (_n, header) => {
    // `as unknown as` on purpose: LegacyProject says these values cannot occur,
    // and the runtime guard exists precisely because the type is a claim about
    // CMS JSON rather than a fact about it. Casting through the declared type
    // would be a compile error, which is the type system correctly objecting to
    // input the CMS can still produce.
    expect(projectToBlocks({ techPackHeader: header } as unknown as LegacyProject)).toEqual([]);
  });

  it("preserves the authored key order", () => {
    const rows = rowsOf({ zebra: "1", alpha: "2", middle: "3" });
    expect(rows.map((r) => r.label)).toEqual(["Zebra", "Alpha", "Middle"]);
  });
});

describe("unsafe and malformed images", () => {
  // These URLs become image sources, so the same rule the sanitizer applies
  // has to apply on this path too.
  it.each(["javascript:alert(1)", "data:text/html,<script>", "vbscript:x", "  ", "not a url"])(
    "drops the image with the unsafe url %j",
    (url) => {
      expect(projectToBlocks({ sketches: [img(url)] })).toEqual([]);
    }
  );

  it.each(["https://x.test/a.jpg", "http://x.test/a.jpg", "/local/a.jpg", "#anchor"])(
    "keeps the image with the safe url %j",
    (url) => {
      const block = only(projectToBlocks({ sketches: [img(url)] }));
      if (block.type !== "gallery") throw new Error("expected a gallery block");
      expect(at(block.images, 0).url).toBe(url);
    }
  );

  it("drops only the unsafe entries, keeping the rest of the gallery", () => {
    const block = only(
      projectToBlocks({
        sketches: [img("https://x.test/1.jpg"), img("javascript:alert(1)"), img("https://x.test/2.jpg")],
      })
    );
    if (block.type !== "gallery") throw new Error("expected a gallery block");

    expect(block.images.map((i) => i.url)).toEqual(["https://x.test/1.jpg", "https://x.test/2.jpg"]);
  });

  it("drops a captioned item whose image is unusable, rather than emitting a caption alone", () => {
    expect(projectToBlocks({ looks: [item("T", "D", "javascript:alert(1)")] })).toEqual([]);
  });

  it.each([
    ["a missing url", [{ altText: "a" }]],
    ["a null entry", [null]],
    ["an undefined entry", [undefined]],
    ["an empty object", [{}]],
  ])("survives %s", (_n, sketches) => {
    expect(projectToBlocks({ sketches } as LegacyProject)).toEqual([]);
  });

  // Unset rather than empty, and the difference carries meaning: images.ts
  // treats an empty altText as "not yet written" and substitutes a derived
  // fallback, because the schema has no decorative flag. Emitting "" here
  // would assert authorship over an image nobody has described.
  it.each([
    ["  ", undefined],
    ["", undefined],
    [undefined, undefined],
    ["A sketch", "A sketch"],
  ])("carries the alt text %j through as %j", (altText, expected) => {
    const block = only(
      projectToBlocks({ sketches: [img("https://x.test/a.jpg", altText)] })
    );
    if (block.type !== "gallery") throw new Error("expected a gallery block");

    expect(at(block.images, 0).altText).toBe(expected);
  });
});

describe("block identity", () => {
  it("gives every block a distinct id, including the halves of the split", () => {
    const blocks = projectToBlocks({
      sketches: [img()],
      patterns: [img()],
      techPackHeader: { size: "M" },
      techPacks: [item()],
    });

    const ids = blocks.map((b) => b.id);
    const split = blocks.find((b) => b.type === "split");
    if (split?.type === "split") ids.push(split.left.id, split.right.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(Boolean)).toBe(true);
  });
});
