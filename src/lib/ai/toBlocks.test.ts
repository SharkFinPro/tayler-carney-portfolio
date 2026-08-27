// `toBlocks` is the trust boundary between model output and stored content.
// Model output is treated exactly like a form post from a stranger: no more
// privileged, and subject to the same sanitizer.
//
// The properties that matter:
//   - A model can never produce a block type outside the six mapped kinds.
//   - A model can never reference an image the admin didn't supply.
//   - Malformed output degrades to fewer blocks, never to a throw.

import { describe, expect, it } from "vitest";
import { LEFTOVER_HEADING, toBlocks } from "./toBlocks";
import type { GeneratedPage, SourceImage } from "./types";
import type { Block } from "@/components/blocks/blocks";
import { at, only } from "@/test/at";

const A = "https://media.graphassets.com/aaa.jpg";
const B = "https://media.graphassets.com/bbb.jpg";

const images: SourceImage[] = [
  { url: A, name: "Front flat", altText: "Front flat of a wool coat" },
  { url: B, name: "Back flat" },
];

const page = (sections: unknown[]): GeneratedPage => ({ sections }) as GeneratedPage;

/**
 * The draft's own blocks, without the catch-all gallery `toBlocks` appends for
 * images the model did not place. Most cases here feed one section that uses
 * one image, so that gallery is present and is not what they are about; the
 * cases that ARE about it assert on the raw output instead.
 */
function drafted(out: Block[]): Block[] {
  const last = out.at(-1);
  return last?.type === "gallery" && last.heading === LEFTOVER_HEADING ? out.slice(0, -1) : out;
}

/**
 * The single block a one-section page produced, checked to be of the expected
 * type. Every case that uses this feeds in exactly one section, so a wrong
 * count or a wrong type IS the failure -- and naming the block up front lets
 * the assertion after it read as a plain property access.
 */
function oneBlock<K extends Block["type"]>(out: Block[], kind: K): Extract<Block, { type: K }> {
  const found = only(out);
  if (found.type !== kind) throw new Error(`Expected a ${kind} block, got ${found.type}.`);
  return found as Extract<Block, { type: K }>;
}

describe("toBlocks — image allowlisting", () => {
  it("keeps images the admin supplied", () => {
    const out = toBlocks(page([{ kind: "gallery", heading: "Flats", imageRefs: [A, B] }]), images);
    expect(drafted(out)).toHaveLength(1);
    expect(oneBlock(drafted(out), "gallery").images.map((i) => i.url)).toEqual([A, B]);
  });

  it("drops a URL the model invented", () => {
    // The single most important property here: a hallucinated asset URL must
    // never reach stored content.
    const out = toBlocks(
      page([
        {
          kind: "gallery",
          heading: "Flats",
          imageRefs: [A, "https://media.graphassets.com/does-not-exist.jpg"],
        },
      ]),
      images
    );
    expect(oneBlock(drafted(out), "gallery").images.map((i) => i.url)).toEqual([A]);
  });

  it.each([
    "https://evil.example.com/x.jpg",
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "//evil.example.com/x.jpg",
    "/local/path.jpg",
    "",
  ])("drops the off-allowlist url %j", (url) => {
    const out = toBlocks(page([{ kind: "gallery", heading: "G", imageRefs: [url] }]), images);
    // No usable image means no block at all.
    expect(out).toEqual([]);
  });

  it("uses the admin's alt text, never anything the model wrote", () => {
    const out = toBlocks(
      page([{ kind: "gallery", heading: "G", imageRefs: [A], altText: "model-written" }]),
      images
    );
    expect(at(oneBlock(drafted(out), "gallery").images, 0).altText).toBe("Front flat of a wool coat");
  });

  it("drops a captioned item whose image is not allowed", () => {
    const out = toBlocks(
      page([
        {
          kind: "captioned",
          heading: "Details",
          items: [
            { imageRef: A, title: "Collar", description: "Two-piece." },
            { imageRef: "https://elsewhere.test/x.jpg", title: "Fake", description: "No." },
          ],
        },
      ]),
      images
    );
    const showcase = oneBlock(drafted(out), "mediaShowcase");
    expect(showcase.items).toHaveLength(1);
    expect(at(showcase.items, 0).title).toBe("Collar");
  });

  it("allows nothing at all when the admin supplied no images", () => {
    const out = toBlocks(page([{ kind: "gallery", heading: "G", imageRefs: [A] }]), []);
    expect(out).toEqual([]);
  });
});

describe("toBlocks — section mapping", () => {
  it("maps intro to a pageIntro block", () => {
    const out = toBlocks(
      page([{ kind: "intro", eyebrow: "Case study", heading: "Wool Coat", body: "A study." }]),
      images
    );
    expect(out[0]).toMatchObject({ type: "pageIntro", heading: "Wool Coat", eyebrow: "Case study" });
  });

  it("maps prose to richText, splitting paragraphs on blank lines", () => {
    const out = toBlocks(page([{ kind: "prose", heading: "Notes", body: "One.\n\nTwo." }]), images);
    expect(oneBlock(drafted(out), "richText").content.children).toHaveLength(2);
  });

  it("maps specs rows", () => {
    const out = toBlocks(
      page([{ kind: "specs", heading: "Spec", rows: [{ label: "Material", value: "Wool" }] }]),
      images
    );
    expect(out[0]).toMatchObject({ type: "specs", rows: [{ label: "Material", value: "Wool" }] });
  });

  it("maps timeline stages", () => {
    const out = toBlocks(
      page([
        {
          kind: "timeline",
          heading: "Process",
          stages: [{ marker: "Week 1", title: "Draping", description: "Toile." }],
        },
      ]),
      images
    );
    expect(oneBlock(drafted(out), "timeline").stages).toHaveLength(1);
  });

  it("honors the gallery layout choice", () => {
    const grid = toBlocks(page([{ kind: "gallery", heading: "", imageRefs: [A], layout: "grid" }]), images);
    const feature = toBlocks(page([{ kind: "gallery", heading: "", imageRefs: [A], layout: "feature" }]), images);
    expect(grid[0]).toMatchObject({ layout: "grid" });
    expect(feature[0]).toMatchObject({ layout: "feature" });
  });

  it("falls back to grid for an unrecognized layout", () => {
    const out = toBlocks(
      page([{ kind: "gallery", heading: "", imageRefs: [A], layout: "carousel" }]),
      images
    );
    expect(out[0]).toMatchObject({ layout: "grid" });
  });

  it("gives every block a distinct id", () => {
    const out = toBlocks(
      page([
        { kind: "prose", heading: "A", body: "one" },
        { kind: "prose", heading: "B", body: "two" },
        { kind: "prose", heading: "C", body: "three" },
      ]),
      images
    );
    expect(new Set(drafted(out).map((b) => b.id)).size).toBe(3);
  });

  it("preserves section order", () => {
    const out = toBlocks(
      page([
        { kind: "intro", eyebrow: "", heading: "First", body: "x" },
        { kind: "prose", heading: "Second", body: "y" },
        { kind: "specs", heading: "Third", rows: [{ label: "a", value: "b" }] },
      ]),
      images
    );
    expect(drafted(out).map((b) => b.heading)).toEqual(["First", "Second", "Third"]);
  });
});

describe("toBlocks — a model cannot escape the vocabulary", () => {
  it.each([
    "split",
    "columns",
    "cta",
    "documentViewer",
    "richText",
    "definitelyNotAKind",
    "__proto__",
    "constructor",
  ])("drops the unmapped kind %j", (kind) => {
    // There is no path from model output to an arbitrary block type — only the
    // six mapped kinds exist, and `kind` is not a block type name.
    const out = toBlocks(page([{ kind, heading: "x", body: "y" }]), images);
    expect(out).toEqual([]);
  });

  it("cannot smuggle a cta with an unsafe href", () => {
    const out = toBlocks(
      page([{ kind: "cta", heading: "Click", buttonLabel: "Go", buttonHref: "javascript:alert(1)" }]),
      images
    );
    expect(out).toEqual([]);
  });

  it("keeps the valid sections either side of an invalid one", () => {
    const out = toBlocks(
      page([
        { kind: "prose", heading: "Keep", body: "one" },
        { kind: "nonsense" },
        { kind: "prose", heading: "Also keep", body: "two" },
      ]),
      images
    );
    expect(drafted(out).map((b) => b.heading)).toEqual(["Keep", "Also keep"]);
  });
});

describe("toBlocks — never throws", () => {
  const hostile: unknown[] = [
    null,
    undefined,
    {},
    { sections: null },
    { sections: "nope" },
    { sections: [null, undefined, 0, "", []] },
    { sections: [{ kind: "gallery" }] },
    { sections: [{ kind: "specs", rows: "not an array" }] },
    { sections: [{ kind: "captioned", items: [null, 5, {}] }] },
    { sections: [{ kind: "timeline", stages: [{ marker: 42 }] }] },
    { sections: [{ kind: "prose", body: 12345 }] },
  ];

  for (const [i, input] of hostile.entries()) {
    it(`survives hostile draft #${i}`, () => {
      expect(() => toBlocks(input as GeneratedPage, images)).not.toThrow();
      expect(Array.isArray(toBlocks(input as GeneratedPage, images))).toBe(true);
    });
  }

  it("drops sections that carry no usable content", () => {
    const out = toBlocks(
      page([
        { kind: "prose", heading: "Heading only", body: "   " },
        { kind: "specs", heading: "Empty", rows: [] },
        { kind: "timeline", heading: "Empty", stages: [] },
        { kind: "gallery", heading: "Empty", imageRefs: [] },
      ]),
      images
    );
    expect(out).toEqual([]);
  });

  it("returns [] rather than throwing on a completely absent draft", () => {
    expect(toBlocks(null, images)).toEqual([]);
    expect(toBlocks(undefined, images)).toEqual([]);
  });
});

describe("toBlocks — every selected image reaches the page", () => {
  const gallery = (refs: string[]) => page([{ kind: "gallery", heading: "Flats", imageRefs: refs }]);

  it("resolves the img-N tokens the brief hands the model", () => {
    // The tokens exist because a model copying forty opaque asset URLs gets
    // some of them wrong, and each mistyped character used to be an image
    // silently missing from the page.
    const out = toBlocks(gallery(["img-1", "img-2"]), images);
    expect(oneBlock(out, "gallery").images.map((i) => i.url)).toEqual([A, B]);
  });

  it("drops a token for an image that was never supplied", () => {
    const out = toBlocks(gallery(["img-1", "img-99"]), images);
    expect(oneBlock(drafted(out), "gallery").images.map((i) => i.url)).toEqual([A]);
  });

  it("appends the images the model left out", () => {
    const out = toBlocks(gallery(["img-1"]), images);

    expect(out).toHaveLength(2);
    const leftover = at(out, 1);
    expect(leftover).toMatchObject({ type: "gallery", heading: LEFTOVER_HEADING });
    if (leftover.type !== "gallery") throw new Error("expected a gallery");
    expect(leftover.images.map((i) => i.url)).toEqual([B]);
  });

  it("appends nothing when the draft already placed everything", () => {
    const out = toBlocks(gallery(["img-1", "img-2"]), images);
    expect(out).toHaveLength(1);
  });

  it("counts an image as placed wherever it was used, not only in a gallery", () => {
    const out = toBlocks(
      page([
        { kind: "gallery", heading: "Flats", imageRefs: ["img-1"] },
        {
          kind: "captioned",
          heading: "Details",
          items: [{ imageRef: "img-2", title: "Collar", description: "Two-piece." }],
        },
      ]),
      images
    );
    expect(out).toHaveLength(2);
  });

  it("keeps selection order and the admin's alt text in the appended block", () => {
    const out = toBlocks(page([{ kind: "prose", heading: "Notes", body: "Nothing placed." }]), images);

    const leftover = at(out, 1);
    if (leftover.type !== "gallery") throw new Error("expected a gallery");
    expect(leftover.images).toEqual([
      { url: A, altText: "Front flat of a wool coat" },
      { url: B, altText: undefined },
    ]);
  });

  it("appends nothing when the draft produced no blocks at all", () => {
    // An empty draft is a failed generation, and the caller reports it as one.
    // Returning a bare gallery would disguise that as a partial success.
    expect(toBlocks(page([{ kind: "nonsense" }]), images)).toEqual([]);
    expect(toBlocks(null, images)).toEqual([]);
  });
});

// ── The mapping's own edges ──────────────────────────────────────────────────
//
// The blocks above prove each section kind maps to the right block type and
// that a model cannot escape the vocabulary. What they leave is the detail
// inside each arm — how prose becomes paragraphs, what a malformed row does,
// which literals the layouts carry. Mutation testing found forty-five
// survivors in there, mostly one-character edits that produce a block which is
// still the right *type* and so passes every case above.

describe("toBlocks — prose becomes paragraphs", () => {
  const proseBlock = (body: unknown) =>
    oneBlock(toBlocks(page([{ kind: "prose", heading: "H", body }]), []), "richText");

  const texts = (body: unknown) =>
    (proseBlock(body).content.children as { children: { text: string }[] }[]).map(
      (p) => p.children[0]?.text
    );

  // A blank line is a paragraph break; a single newline is a soft wrap inside
  // one. Splitting on every newline would shred a wrapped paragraph into a
  // list of fragments.
  it("splits on a blank line", () => {
    expect(texts("First para.\n\nSecond para.")).toEqual(["First para.", "Second para."]);
  });

  it("does not split on a single newline", () => {
    expect(texts("One para\nsoft wrapped.")).toEqual(["One para\nsoft wrapped."]);
  });

  it("treats a run of blank lines as one break", () => {
    expect(texts("First.\n\n\n\nSecond.")).toEqual(["First.", "Second."]);
  });

  it("trims the whitespace around each paragraph", () => {
    expect(texts("  First.  \n\n  Second.  ")).toEqual(["First.", "Second."]);
  });

  it("gives every paragraph the paragraph type the renderer looks for", () => {
    const children = proseBlock("First.\n\nSecond.").content.children as { type: string }[];
    expect(children.map((p) => p.type)).toEqual(["paragraph", "paragraph"]);
  });

  it("puts the text in a child node rather than on the paragraph itself", () => {
    const children = proseBlock("Only.").content.children as { children: unknown[] }[];
    expect(children[0]?.children).toHaveLength(1);
  });

  // A prose section with nothing usable is dropped rather than becoming an
  // empty rich-text block that renders as a gap in the page.
  it.each(["", "   ", "\n\n\n", null, undefined, 42])("drops a prose section whose body is %j", (body) => {
    expect(toBlocks(page([{ kind: "prose", heading: "H", body }]), [])).toEqual([]);
  });
});

describe("toBlocks — the intro arm keeps only what has content", () => {
  const intro = (fields: Record<string, unknown>) =>
    toBlocks(page([{ kind: "intro", eyebrow: "E", heading: "H", body: "B", ...fields }]), []);

  it("keeps an intro that has only a heading", () => {
    expect(oneBlock(intro({ body: "" }), "pageIntro").heading).toBe("H");
  });

  it("keeps an intro that has only a body", () => {
    expect(oneBlock(intro({ heading: "" }), "pageIntro").type).toBe("pageIntro");
  });

  // Both empty is nothing to render, and an empty eyebrow is not content.
  it("drops an intro with neither a heading nor a body", () => {
    expect(intro({ heading: "", body: "", eyebrow: "Still here" })).toEqual([]);
  });
});

describe("toBlocks — layouts carry the literal the renderer switches on", () => {
  it("gives a captioned section the cards layout", () => {
    const out = toBlocks(
      page([{ kind: "captioned", heading: "H", items: [{ imageRef: A, title: "T", description: "D" }] }]),
      images
    );
    expect(oneBlock(drafted(out), "mediaShowcase").layout).toBe("cards");
  });

  it("gives a feature gallery the feature layout", () => {
    const out = toBlocks(page([{ kind: "gallery", heading: "H", imageRefs: [A], layout: "feature" }]), images);
    expect(oneBlock(drafted(out), "gallery").layout).toBe("feature");
  });

  it.each(["grid", "cards", "", null, undefined, "banner"])(
    "falls back to grid for the gallery layout %j",
    (layout) => {
      const out = toBlocks(page([{ kind: "gallery", heading: "H", imageRefs: [A], layout }]), images);
      expect(oneBlock(drafted(out), "gallery").layout).toBe("grid");
    }
  );
});

describe("toBlocks — malformed rows inside a valid section", () => {
  // Every repeatable arm reads its entries with `?.`, so a null in the middle
  // of an otherwise good list must not take the whole section down with it.
  it("survives a null entry among the specs rows", () => {
    const out = toBlocks(
      page([{ kind: "specs", heading: "H", rows: [null, { label: "Fabric", value: "Wool" }, undefined] }]),
      []
    );
    expect(oneBlock(out, "specs").rows).toEqual([{ label: "Fabric", value: "Wool" }]);
  });

  it("survives a null entry among the timeline stages", () => {
    const out = toBlocks(
      page([
        {
          kind: "timeline",
          heading: "H",
          stages: [null, { marker: "1", title: "Start", description: "D" }],
        },
      ]),
      []
    );
    expect(oneBlock(out, "timeline").stages).toHaveLength(1);
  });

  it("survives a null entry among the captioned items", () => {
    const out = toBlocks(
      page([{ kind: "captioned", heading: "H", items: [null, { imageRef: A, title: "T", description: "D" }] }]),
      images
    );
    expect(oneBlock(drafted(out), "mediaShowcase").items).toHaveLength(1);
  });

  // A row whose fields are all non-strings cleans to empty and is dropped, so
  // the section goes with it rather than rendering a blank table.
  it.each([
    [{ label: 42, value: {} }],
    [{ label: null, value: undefined }],
    [{}],
  ])("drops a specs section whose only row is %j", (row) => {
    expect(toBlocks(page([{ kind: "specs", heading: "H", rows: [row] }]), [])).toEqual([]);
  });

  it("keeps a specs row that has only a label", () => {
    const out = toBlocks(page([{ kind: "specs", heading: "H", rows: [{ label: "Fabric" }] }]), []);
    expect(oneBlock(out, "specs").rows).toEqual([{ label: "Fabric", value: "" }]);
  });

  // The mapper's own filter keeps a row with either field, but toBlocks ends by
  // passing everything through `sanitizeBlocks` — and the CMS sanitizer is
  // stricter: `cleanRows` drops a row with no label, because a value with
  // nothing naming it renders as a table cell with a blank header. The
  // stricter layer wins, which is the right way round: the mapper decides what
  // the model meant, the sanitizer decides what may be stored.
  it("drops a row with no label, because the CMS sanitizer has the final say", () => {
    const out = toBlocks(page([{ kind: "specs", heading: "H", rows: [{ value: "Wool" }] }]), []);

    // The section survives as an empty specs block rather than vanishing —
    // `sanitizeBlocks` cleans the rows out but keeps the block. Harmless,
    // because `blockHasData` reports an empty specs block as having none and
    // the editor discards it on the next save.
    expect(oneBlock(out, "specs").rows).toEqual([]);
  });

  // Same rule reached a different way: a non-string label cleans to "", which
  // then fails the sanitizer's label requirement. A number the model put in a
  // label never renders as "42".
  it("drops a row whose label was not a string", () => {
    const out = toBlocks(
      page([{ kind: "specs", heading: "H", rows: [{ label: 42, value: "Wool" }] }]),
      []
    );
    expect(oneBlock(out, "specs").rows).toEqual([]);
  });

  it("keeps a labelled row whose value was not a string, with the value emptied", () => {
    const out = toBlocks(
      page([{ kind: "specs", heading: "H", rows: [{ label: "Fabric", value: 42 }] }]),
      []
    );
    expect(oneBlock(out, "specs").rows).toEqual([{ label: "Fabric", value: "" }]);
  });

  it("trims the strings it does keep", () => {
    const out = toBlocks(
      page([{ kind: "specs", heading: "H", rows: [{ label: "  Fabric  ", value: "  Wool  " }] }]),
      []
    );
    expect(oneBlock(out, "specs").rows).toEqual([{ label: "Fabric", value: "Wool" }]);
  });
});

describe("toBlocks — a list that is not a list", () => {
  // Each repeatable arm falls back to an empty array, so a model answering
  // with a string where a list belongs drops the section instead of throwing
  // or emitting a block built from the string's characters.
  it.each(["not a list", 42, {}, null, undefined])(
    "drops a gallery whose imageRefs is %j",
    (imageRefs) => {
      expect(drafted(toBlocks(page([{ kind: "gallery", heading: "H", imageRefs }]), images))).toEqual([]);
    }
  );

  it.each(["not a list", 42, {}, null])("drops a specs section whose rows is %j", (rows) => {
    expect(toBlocks(page([{ kind: "specs", heading: "H", rows }]), [])).toEqual([]);
  });

  it.each(["not a list", 42, {}, null])("drops a captioned section whose items is %j", (items) => {
    expect(drafted(toBlocks(page([{ kind: "captioned", heading: "H", items }]), images))).toEqual([]);
  });
});

describe("toBlocks — the leftover gallery names itself", () => {
  // `drafted()` above finds this block by comparing against the exported
  // constant, which means blanking the constant would change both the code and
  // the helper together and nothing would notice. Asserted as a literal here
  // for that reason: an admin has to be able to tell this section apart from
  // one the draft chose to write.
  it("carries a heading that says what it is", () => {
    const out = toBlocks(page([{ kind: "prose", heading: "H", body: "Words." }]), images);
    const last = out.at(-1);

    expect(last?.heading).toBe("Additional images");
    expect(LEFTOVER_HEADING).toBe("Additional images");
  });
});

describe("toBlocks — a timeline stage needs only one of its fields", () => {
  const stages = (raw: unknown[]) => {
    const out = toBlocks(page([{ kind: "timeline", heading: "H", stages: raw }]), []);
    return oneBlock(out, "timeline").stages;
  };

  it.each([
    ["a marker", { marker: "01" }],
    ["a title", { title: "Toile" }],
    ["a description", { description: "First fitting." }],
  ])("keeps a stage that has only %s", (_n, stage) => {
    expect(stages([stage])).toHaveLength(1);
  });

  it("drops a stage with none of the three", () => {
    const out = toBlocks(
      page([{ kind: "timeline", heading: "H", stages: [{ marker: "", title: "", description: "" }] }]),
      []
    );
    expect(out).toEqual([]);
  });
});

describe("toBlocks — a section that is not an object", () => {
  // The loop skips anything that is not an object before touching `.kind`, so
  // a model answering with a bare string in the sections array cannot throw.
  it.each([null, undefined, "prose", 42, true])("skips the section %j", (section) => {
    expect(() => toBlocks(page([section]), [])).not.toThrow();
    expect(toBlocks(page([section]), [])).toEqual([]);
  });

  // The guard is `!section || typeof section !== "object"`, and the values
  // above do not actually exercise it: each of them yields [] whether the
  // guard runs or not, because `toBlock` either falls to its default arm or
  // throws into the surrounding catch. A FUNCTION is the shape that tells them
  // apart — truthy, not `typeof "object"`, and able to carry `kind`, `heading`
  // and `body` as own properties. Without the guard this produces a real
  // richText block from something that is not a section at all.
  it("skips a function carrying section-shaped properties", () => {
    const impostor = Object.assign(() => {}, {
      kind: "prose",
      heading: "Smuggled",
      body: "Should never render.",
    });

    expect(toBlocks(page([impostor]), [])).toEqual([]);
  });

  it("keeps the valid sections around a non-object one", () => {
    const out = toBlocks(
      page([{ kind: "prose", heading: "A", body: "First." }, "nonsense", { kind: "prose", heading: "B", body: "Second." }]),
      []
    );
    expect(out.map((b) => b.heading)).toEqual(["A", "B"]);
  });
});
