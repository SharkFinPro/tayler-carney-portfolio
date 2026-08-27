// `sanitizeHome` backs the homepage singleton. Beyond the usual default-and-
// coerce contract, it is the only sanitizer that validates hrefs on save, so
// the unsafe-scheme cases below are the security-relevant ones.

import { describe, expect, it } from "vitest";
import { DEFAULT_HOME, sanitizeHome } from "./home";
import { at } from "@/test/at";
import { splitLeaves, stringLeaves } from "@/test/leaves";

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

// ── The defaults themselves ──────────────────────────────────────────────────
//
// Everything above asserts sanitizeHome's *behaviour* by comparing its output
// to DEFAULT_HOME — which is the same constant the production code fills gaps
// from. That is circular for the constant's own contents: blank out
// DEFAULT_HOME.hero.headline and both sides of every `toEqual` change together,
// so the suite stays green while a fresh install renders an empty headline.
//
// Mutation testing put a number on it. Of 51 mutants surviving in this file,
// all 51 were edits to these literals — 42 strings blanked, 7 objects emptied,
// 2 arrays emptied — and not one test noticed.
//
// The cases below assert *properties* of the defaults rather than copying them
// out, so they cannot go stale as the copy is edited, and they do not need
// updating when someone rewords a headline. What they pin is that a default is
// present at all, which is the part that matters: DEFAULT_HOME is what a fresh
// install and every cleared field render.
//
// The trade-off is worth naming. Stryker's string mutator only ever blanks a
// literal, so "present but wrong" — a typo in a headline, a mislabelled stat —
// is invisible to both these tests and the mutation score. The routes and
// button labels below are pinned exactly for that reason; the prose is not,
// because a test asserting the copy would fail every time someone edited it,
// which is a different way of testing nothing.

// The only two defaults that are deliberately empty: an unset hero image, and
// its alt text. `archive.imageUrl` is asserted separately below to stay that
// way, since a non-empty default there would put a broken image on every fresh
// install.
const INTENTIONALLY_EMPTY = new Set(["archive.imageUrl", "archive.imageAlt"]);

const { required: REQUIRED, empty: EMPTY } = splitLeaves(
  DEFAULT_HOME,
  INTENTIONALLY_EMPTY
);

describe("DEFAULT_HOME — what a fresh install renders", () => {
  it("has leaves left to check after the exclusions, so it.each is not empty", () => {
    expect(REQUIRED.length).toBeGreaterThan(30);
  });

  it.each(REQUIRED)(
    "%s is not blank",
    (_path, value) => {
      expect(value.trim()).not.toBe("");
    }
  );

  it.each(EMPTY)("%s stays empty, so nothing broken renders", (path) => {
    const leaf = stringLeaves(DEFAULT_HOME).find(([p]) => p === path);
    expect(leaf, `${path} is not a leaf of DEFAULT_HOME at all`).toBeDefined();
    expect(leaf?.[1]).toBe("");
  });
});

describe("DEFAULT_HOME — the links", () => {
  // These are navigation targets on the homepage of a fresh install, and
  // `safeHref` cannot save a blank one — because the fallback it would reach
  // for IS the default. `safeHref(missing, d.archive.buttonHref)` rejects the
  // missing value correctly (isSafeUrl("") is false) and then returns the
  // default, so if the default is itself blank the guard has nothing better to
  // hand back and a blank href ships. Only pinning the default prevents that.
  it.each([
    ["hero.primaryCta.href", "/portfolio"],
    ["hero.secondaryCta.href", "/about"],
    ["archive.buttonHref", "/about"],
  ])("%s points at %s", (path, expected) => {
    expect(stringLeaves(DEFAULT_HOME).find(([p]) => p === path)?.[1]).toBe(expected);
  });

  // Matched by title rather than by position: the order of the cards on the
  // homepage is a content decision someone may reasonably change, and a
  // reshuffle should not fail a test about where the links point.
  it.each([
    ["Portfolio", "/portfolio"],
    ["Atelier", "/atelier"],
    ["About", "/about"],
  ])("the %s destination points at %s", (title, expected) => {
    const card = DEFAULT_HOME.destinations.find((d) => d.title === title);
    expect(card, `no destination titled ${title}`).toBeDefined();
    expect(card?.href).toBe(expected);
  });

  it("gives every link a label to click", () => {
    expect(DEFAULT_HOME.hero.primaryCta.label.trim()).not.toBe("");
    expect(DEFAULT_HOME.hero.secondaryCta.label.trim()).not.toBe("");
    expect(DEFAULT_HOME.archive.buttonLabel.trim()).not.toBe("");
  });
});

describe("DEFAULT_HOME — the repeatable sections", () => {
  // `sanitizeHome` drops a stat with neither key nor value and a destination
  // with neither title nor description. A default list of empty objects would
  // therefore survive sanitizing as an empty list, and the homepage would
  // render the section headings with nothing under them.
  it("ships hero stats rather than an empty row of them", () => {
    expect(DEFAULT_HOME.hero.stats.length).toBeGreaterThan(0);
  });

  it.each(DEFAULT_HOME.hero.stats.map((s, i) => [i, s] as const))(
    "stat %i has both a key and a value",
    (_i, stat) => {
      expect(stat.key?.trim()).not.toBe("");
      expect(stat.value?.trim()).not.toBe("");
    }
  );

  it("ships destinations rather than an empty list", () => {
    expect(DEFAULT_HOME.destinations.length).toBeGreaterThan(0);
  });

  it.each(DEFAULT_HOME.destinations.map((d, i) => [i, d] as const))(
    "destination %i survives its own sanitizer",
    (_i, dest) => {
      // The filter keeps a card only if it has a title or a description.
      expect(Boolean(dest.title?.trim() || dest.description?.trim())).toBe(true);
    }
  );

  it("survives being passed through the sanitizer unchanged", () => {
    // Worth being precise about what this one does and does not say. It is
    // circular with respect to the constant's *contents* — blank a default and
    // both sides change together, exactly like the tests above it — so it
    // contributes nothing to the property the rest of this block exists for.
    //
    // What it does pin is the sanitizer: the defaults are a fixed point of the
    // validator that produces them, so nothing in them is silently dropped on
    // the first save of an untouched homepage. A field the sanitizer stopped
    // carrying, or a row its filter started rejecting, fails here.
    expect(sanitizeHome(DEFAULT_HOME)).toEqual(DEFAULT_HOME);
    expect(sanitizeHome(DEFAULT_HOME).destinations).toHaveLength(
      DEFAULT_HOME.destinations.length
    );
    expect(sanitizeHome(DEFAULT_HOME).hero.stats).toHaveLength(DEFAULT_HOME.hero.stats.length);
  });
});
