// `sanitizeHome` backs the homepage singleton. Beyond the usual default-and-
// coerce contract, it is the only sanitizer that validates hrefs on save, so
// the unsafe-scheme cases below are the security-relevant ones.

import { describe, expect, it } from "vitest";
import { DEFAULT_HOME, sanitizeHome } from "./home";
import { at } from "@/test/at";

const UNSAFE = ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,<script>", "vbscript:x"];

describe("sanitizeHome", () => {
  it("returns the defaults for an empty or absent value", () => {
    for (const input of [null, undefined, {}]) {
      expect(sanitizeHome(input)).toEqual(DEFAULT_HOME);
    }
  });

  it("never throws on hostile input", () => {
    for (const input of [0, "", "text", true, [], NaN, () => {}, new Date(), { hero: "no" }]) {
      expect(() => sanitizeHome(input)).not.toThrow();
    }
  });

  it("fills in a whole missing section from the defaults", () => {
    const out = sanitizeHome({ exploreTitle: "Sections" });
    expect(out.exploreTitle).toBe("Sections");
    expect(out.hero).toEqual(DEFAULT_HOME.hero);
    expect(out.archive).toEqual(DEFAULT_HOME.archive);
  });

  it("merges a partial hero rather than discarding the rest of it", () => {
    const out = sanitizeHome({ hero: { headline: "New headline" } });
    expect(out.hero.headline).toBe("New headline");
    expect(out.hero.eyebrow).toBe(DEFAULT_HOME.hero.eyebrow);
    expect(out.hero.stats).toEqual(DEFAULT_HOME.hero.stats);
  });

  describe("href safety", () => {
    it.each(UNSAFE)("rewrites an unsafe primary CTA href (%s) to the default", (href) => {
      const out = sanitizeHome({ hero: { primaryCta: { label: "Go", href } } });
      expect(out.hero.primaryCta.href).toBe(DEFAULT_HOME.hero.primaryCta.href);
      // The label is still honored — only the href is rejected.
      expect(out.hero.primaryCta.label).toBe("Go");
    });

    it.each(UNSAFE)("rewrites an unsafe archive button href (%s) to the default", (href) => {
      expect(sanitizeHome({ archive: { buttonHref: href } }).archive.buttonHref).toBe(
        DEFAULT_HOME.archive.buttonHref
      );
    });

    it.each(UNSAFE)("rewrites an unsafe destination href (%s) to '/'", (href) => {
      const out = sanitizeHome({ destinations: [{ title: "T", href }] });
      expect(at(out.destinations, 0).href).toBe("/");
    });

    it("keeps hrefs that are actually safe", () => {
      for (const href of ["/portfolio", "#section", "https://example.com", "mailto:a@b.com"]) {
        const out = sanitizeHome({ hero: { primaryCta: { label: "L", href } } });
        expect(out.hero.primaryCta.href, href).toBe(href);
      }
    });
  });

  describe("hero stats", () => {
    it("keeps rows with either a key or a value", () => {
      const out = sanitizeHome({ hero: { stats: [{ key: "Year", value: "2027" }, { key: "Solo" }, { value: "Only" }] } });
      expect(out.hero.stats).toEqual([
        { key: "Year", value: "2027" },
        { key: "Solo", value: "" },
        { key: "", value: "Only" },
      ]);
    });

    it("drops fully blank rows", () => {
      const out = sanitizeHome({ hero: { stats: [{ key: "A", value: "1" }, {}, null, { key: "", value: "" }] } });
      expect(out.hero.stats).toEqual([{ key: "A", value: "1" }]);
    });

    it("yields an empty list when the admin clears every row", () => {
      expect(sanitizeHome({ hero: { stats: [] } }).hero.stats).toEqual([]);
    });

    it("falls back to the defaults when stats is not an array", () => {
      expect(sanitizeHome({ hero: { stats: "none" } }).hero.stats).toEqual(DEFAULT_HOME.hero.stats);
    });
  });

  describe("destinations", () => {
    it("keeps cards with a title or a description", () => {
      const out = sanitizeHome({
        destinations: [{ title: "Portfolio", href: "/portfolio" }, { description: "Just prose" }],
      });
      expect(out.destinations).toHaveLength(2);
    });

    it("drops cards with neither", () => {
      const out = sanitizeHome({ destinations: [{ ref: "Sec. 01", tag: "x" }, { title: "Keep" }] });
      expect(out.destinations.map((d) => d.title)).toEqual(["Keep"]);
    });

    it("normalizes size to the two allowed values", () => {
      const out = sanitizeHome({
        destinations: [
          { title: "a", size: "primary" },
          { title: "b", size: "secondary" },
          { title: "c", size: "enormous" },
          { title: "d" },
        ],
      });
      expect(out.destinations.map((d) => d.size)).toEqual([
        "primary",
        "secondary",
        "secondary",
        "secondary",
      ]);
    });
  });

  it("is idempotent", () => {
    const once = sanitizeHome({
      hero: { headline: "H", stats: [{ key: "k", value: "v" }] },
      destinations: [{ title: "T", href: "/portfolio", size: "primary" }],
    });
    expect(sanitizeHome(once)).toEqual(once);
  });
});

describe("archive.imageUrl", () => {
  // Previously the one URL in this module that went through plain str(), so an
  // unsafe scheme could be persisted here while the sibling buttonHref rejected it.
  it.each(UNSAFE)("rejects an unsafe scheme (%s)", (imageUrl) => {
    expect(sanitizeHome({ archive: { imageUrl } }).archive.imageUrl).toBe(
      DEFAULT_HOME.archive.imageUrl
    );
  });

  it("rejects a protocol-relative URL", () => {
    expect(sanitizeHome({ archive: { imageUrl: "//evil.com/x.jpg" } }).archive.imageUrl).toBe(
      DEFAULT_HOME.archive.imageUrl
    );
  });

  it("keeps a real asset URL", () => {
    const imageUrl = "https://media.graphassets.com/abc.jpg";
    expect(sanitizeHome({ archive: { imageUrl } }).archive.imageUrl).toBe(imageUrl);
  });

  it("keeps the empty default, so an unset image stays unset", () => {
    expect(sanitizeHome({ archive: { imageUrl: "" } }).archive.imageUrl).toBe("");
  });
});
