// `sanitizeSeo` feeds `generateMetadata()` in the root layout. A shape it
// returns wrong becomes a wrong <title> or a missing description on every page
// at once, so the defaults and the keyword coercion are worth pinning down.

import { describe, expect, it } from "vitest";
import { DEFAULT_SEO, sanitizeSeo } from "./seo";

describe("sanitizeSeo", () => {
  it("returns the defaults for an empty or absent value", () => {
    for (const input of [null, undefined, {}]) {
      expect(sanitizeSeo(input)).toEqual(DEFAULT_SEO);
    }
  });

  it("never throws on hostile input", () => {
    for (const input of [0, "", "text", true, [], NaN, () => {}, new Date()]) {
      expect(() => sanitizeSeo(input)).not.toThrow();
    }
  });

  it("always returns every key", () => {
    const keys = Object.keys(DEFAULT_SEO).sort();
    for (const input of [null, {}, { title: "x" }, "nonsense"]) {
      expect(Object.keys(sanitizeSeo(input)).sort()).toEqual(keys);
    }
  });

  it("keeps and trims supplied copy", () => {
    const out = sanitizeSeo({ title: "  My Site  ", ogDescription: " Shared. " });
    expect(out.title).toBe("My Site");
    expect(out.ogDescription).toBe("Shared.");
  });

  it("falls back per-field, not all-or-nothing", () => {
    const out = sanitizeSeo({ title: "Only the title is set" });
    expect(out.title).toBe("Only the title is set");
    expect(out.description).toBe(DEFAULT_SEO.description);
    expect(out.ogTitle).toBe(DEFAULT_SEO.ogTitle);
  });

  it("preserves the %s placeholder in the title template", () => {
    expect(sanitizeSeo({ titleTemplate: "%s · Studio" }).titleTemplate).toBe("%s · Studio");
  });

  describe("keywords", () => {
    it("accepts an array and trims each entry", () => {
      expect(sanitizeSeo({ keywords: ["  a ", "b", " c"] }).keywords).toEqual(["a", "b", "c"]);
    });

    it("accepts the comma-separated string the settings form edits", () => {
      expect(sanitizeSeo({ keywords: "a, b ,  c " }).keywords).toEqual(["a", "b", "c"]);
    });

    it("drops blank entries from either shape", () => {
      expect(sanitizeSeo({ keywords: ["a", "", "   ", "b"] }).keywords).toEqual(["a", "b"]);
      expect(sanitizeSeo({ keywords: "a,,  ,b," }).keywords).toEqual(["a", "b"]);
    });

    it("drops non-string entries from an array", () => {
      expect(sanitizeSeo({ keywords: ["a", 5, null, {}, "b"] }).keywords).toEqual(["a", "b"]);
    });

    it("yields an empty list when the admin clears the field", () => {
      // Distinct from "absent" — clearing must not resurrect the defaults.
      expect(sanitizeSeo({ keywords: "" }).keywords).toEqual([]);
      expect(sanitizeSeo({ keywords: [] }).keywords).toEqual([]);
    });

    it("falls back to the defaults only when keywords is absent or the wrong type", () => {
      expect(sanitizeSeo({}).keywords).toEqual(DEFAULT_SEO.keywords);
      expect(sanitizeSeo({ keywords: 42 }).keywords).toEqual(DEFAULT_SEO.keywords);
      expect(sanitizeSeo({ keywords: null }).keywords).toEqual(DEFAULT_SEO.keywords);
    });
  });

  it("is idempotent, including the string→array keyword coercion", () => {
    const once = sanitizeSeo({ title: "T", keywords: "a, b" });
    expect(sanitizeSeo(once)).toEqual(once);
    expect(once.keywords).toEqual(["a", "b"]);
  });
});
