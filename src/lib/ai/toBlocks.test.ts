// `toBlocks` is the trust boundary between model output and stored content.
// Model output is treated exactly like a form post from a stranger: no more
// privileged, and subject to the same sanitizer.
//
// The properties that matter:
//   - A model can never produce a block type outside the six mapped kinds.
//   - A model can never reference an image the admin didn't supply.
//   - Malformed output degrades to fewer blocks, never to a throw.

import { describe, expect, it } from "vitest";
import { toBlocks } from "./toBlocks";
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
    const out = toBlocks(page([{ kind: "gallery", heading: "Flats", imageUrls: [A, B] }]), images);
    expect(out).toHaveLength(1);
    expect(oneBlock(out, "gallery").images.map((i) => i.url)).toEqual([A, B]);
  });

  it("drops a URL the model invented", () => {
    // The single most important property here: a hallucinated asset URL must
    // never reach stored content.
    const out = toBlocks(
      page([
        {
          kind: "gallery",
          heading: "Flats",
          imageUrls: [A, "https://media.graphassets.com/does-not-exist.jpg"],
        },
      ]),
      images
    );
    expect(oneBlock(out, "gallery").images.map((i) => i.url)).toEqual([A]);
  });

  it.each([
    "https://evil.example.com/x.jpg",
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "//evil.example.com/x.jpg",
    "/local/path.jpg",
    "",
  ])("drops the off-allowlist url %j", (url) => {
    const out = toBlocks(page([{ kind: "gallery", heading: "G", imageUrls: [url] }]), images);
    // No usable image means no block at all.
    expect(out).toEqual([]);
  });

  it("uses the admin's alt text, never anything the model wrote", () => {
    const out = toBlocks(
      page([{ kind: "gallery", heading: "G", imageUrls: [A], altText: "model-written" }]),
      images
    );
    expect(oneBlock(out, "gallery").images[0]?.altText).toBe("Front flat of a wool coat");
  });

  it("drops a captioned item whose image is not allowed", () => {
    const out = toBlocks(
      page([
        {
          kind: "captioned",
          heading: "Details",
          items: [
            { imageUrl: A, title: "Collar", description: "Two-piece." },
            { imageUrl: "https://elsewhere.test/x.jpg", title: "Fake", description: "No." },
          ],
        },
      ]),
      images
    );
    const showcase = oneBlock(out, "mediaShowcase");
    expect(showcase.items).toHaveLength(1);
    expect(at(showcase.items, 0).title).toBe("Collar");
  });

  it("allows nothing at all when the admin supplied no images", () => {
    const out = toBlocks(page([{ kind: "gallery", heading: "G", imageUrls: [A] }]), []);
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
    expect(oneBlock(out, "richText").content.children).toHaveLength(2);
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
    expect(oneBlock(out, "timeline").stages).toHaveLength(1);
  });

  it("honors the gallery layout choice", () => {
    const grid = toBlocks(page([{ kind: "gallery", heading: "", imageUrls: [A], layout: "grid" }]), images);
    const feature = toBlocks(page([{ kind: "gallery", heading: "", imageUrls: [A], layout: "feature" }]), images);
    expect(grid[0]).toMatchObject({ layout: "grid" });
    expect(feature[0]).toMatchObject({ layout: "feature" });
  });

  it("falls back to grid for an unrecognized layout", () => {
    const out = toBlocks(
      page([{ kind: "gallery", heading: "", imageUrls: [A], layout: "carousel" }]),
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
    expect(new Set(out.map((b) => b.id)).size).toBe(3);
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
    expect(out.map((b) => b.heading)).toEqual(["First", "Second", "Third"]);
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
    expect(out.map((b) => b.heading)).toEqual(["Keep", "Also keep"]);
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
        { kind: "gallery", heading: "Empty", imageUrls: [] },
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
