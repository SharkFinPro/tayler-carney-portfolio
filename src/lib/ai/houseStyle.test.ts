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
