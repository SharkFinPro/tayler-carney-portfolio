// `sanitizeSeo` feeds `generateMetadata()` in the root layout. A shape it
// returns wrong becomes a wrong <title> or a missing description on every page
// at once, so the defaults and the keyword coercion are worth pinning down.

import { describe, expect, it } from "vitest";
import { DEFAULT_SEO, SEO_PAGE_KEYS, pageMetadata, sanitizeSeo } from "./seo";
import { splitLeaves, stringLeaves } from "@/test/leaves";

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

describe("per-page metadata", () => {
  it("seeds every route with the copy it used to hardcode", () => {
    // Search results must be unchanged until an admin edits them.
    expect(DEFAULT_SEO.pages.about.description).toMatch(/The designer behind the archive/);
    expect(DEFAULT_SEO.pages.portfolio.description).toMatch(/A working archive/);
    expect(DEFAULT_SEO.pages.atelier.description).toMatch(/Inside the studio/);
    expect(DEFAULT_SEO.pages.contact.description).toMatch(/Get in touch/);
  });

  it("always returns an entry for every key, whatever is stored", () => {
    for (const input of [null, {}, { pages: null }, { pages: "nope" }, { pages: { about: 5 } }]) {
      const out = sanitizeSeo(input);
      for (const key of SEO_PAGE_KEYS) {
        expect(out.pages[key], `${JSON.stringify(input)} / ${key}`).toBeDefined();
        expect(typeof out.pages[key].title).toBe("string");
        expect(typeof out.pages[key].description).toBe("string");
      }
    }
  });

  it("keeps an edited override and trims it", () => {
    const out = sanitizeSeo({ pages: { about: { title: "  Me  ", description: " Hello. " } } });
    expect(out.pages.about).toEqual({ title: "Me", description: "Hello." });
  });

  it("leaves the other routes on their defaults when one is edited", () => {
    const out = sanitizeSeo({ pages: { about: { title: "Me", description: "Hello." } } });
    expect(out.pages.contact).toEqual(DEFAULT_SEO.pages.contact);
  });

  it("ignores an unrecognized key rather than carrying it forward", () => {
    // A renamed route shouldn't leave debris in the stored JSON forever.
    const out = sanitizeSeo({ pages: { about: { title: "Me" }, oldRoute: { title: "Gone" } } });
    expect(Object.keys(out.pages).sort()).toEqual([...SEO_PAGE_KEYS].sort());
  });

  it("is idempotent", () => {
    const once = sanitizeSeo({ pages: { about: { title: "Me", description: "Hi" } } });
    expect(sanitizeSeo(once)).toEqual(once);
  });
});

describe("pageMetadata", () => {
  it("uses the per-page values when set", () => {
    const seo = sanitizeSeo({ pages: { about: { title: "Me", description: "About me." } } });
    expect(pageMetadata(seo, "about")).toEqual({ title: "Me", description: "About me." });
  });

  it("falls back to the site description rather than emitting an empty one", () => {
    // An empty <meta name="description"> is worse for search than a generic one.
    const seo = sanitizeSeo({ description: "Site-wide.", pages: { home: { description: "" } } });
    expect(pageMetadata(seo, "home").description).toBe("Site-wide.");
  });

  it("falls back to the default title when cleared", () => {
    const seo = sanitizeSeo({ pages: { contact: { title: "", description: "d" } } });
    expect(pageMetadata(seo, "contact").title).toBe(DEFAULT_SEO.pages.contact.title);
  });

  it("returns a usable result for every route key", () => {
    const seo = sanitizeSeo(null);
    for (const key of SEO_PAGE_KEYS) {
      const meta = pageMetadata(seo, key);
      expect(meta.title, key).toBeTruthy();
      expect(meta.description, key).toBeTruthy();
    }
  });
});

describe("sanitizeSeo — keywords", () => {
  it("keeps a keyword that contains a comma", () => {
    // The reason the Settings form sends an array rather than a joined string:
    // splitting on "," tears this one in two, silently, after the field has
    // stopped being the admin's to look at.
    const out = sanitizeSeo({ keywords: ["structural design, menswear", "tailoring"] });
    expect(out.keywords).toEqual(["structural design, menswear", "tailoring"]);
  });

  it("trims and drops blanks from an array", () => {
    expect(sanitizeSeo({ keywords: ["  a  ", "", "   ", "b"] }).keywords).toEqual(["a", "b"]);
  });

  it("still splits a legacy comma-joined string, so stored values keep loading", () => {
    expect(sanitizeSeo({ keywords: "a, b ,c" }).keywords).toEqual(["a", "b", "c"]);
  });

  it("falls back to the defaults when keywords is neither", () => {
    for (const raw of [null, undefined, 42, {}]) {
      expect(sanitizeSeo({ keywords: raw }).keywords).toEqual(DEFAULT_SEO.keywords);
    }
  });
});

// ── The defaults themselves ──────────────────────────────────────────────────
//
// The same circularity home.ts and global.ts had: every assertion above
// compares sanitizeSeo's output to DEFAULT_SEO, the constant the production
// code fills gaps from, so blanking a default changes both sides at once.
// These describe what a fresh install actually serves to a crawler.

describe("DEFAULT_SEO — what a fresh install tells search engines", () => {
  // The home page's description is deliberately blank: the site-wide
  // description already covers it, and repeating it would duplicate the meta
  // description across two URLs.
  const INTENTIONALLY_EMPTY = new Set(["pages.home.description"]);
  const { required: REQUIRED, empty: EMPTY } = splitLeaves(
  DEFAULT_SEO,
  INTENTIONALLY_EMPTY
);

  it("has leaves left to check after the exclusions, so it.each is not empty", () => {
    expect(REQUIRED.length).toBeGreaterThan(15);
  });

  it.each(REQUIRED)("%s is not blank", (_p, value) => {
    expect(value.trim()).not.toBe("");
  });

  it.each(EMPTY)("%s stays empty on purpose", (path) => {
    expect(stringLeaves(DEFAULT_SEO).find(([p]) => p === path)?.[1]).toBe("");
  });

  it("ships keywords rather than an empty list", () => {
    expect(DEFAULT_SEO.keywords.length).toBeGreaterThan(0);
  });

  // The template is interpolated with the page title, so it has to carry the
  // placeholder or every page title collapses to the same string.
  it("gives the title template a %s placeholder to fill", () => {
    expect(DEFAULT_SEO.titleTemplate).toContain("%s");
  });

  it.each(["home", "portfolio", "atelier", "about", "contact"] as const)(
    "gives the %s page a title",
    (page) => {
      expect(DEFAULT_SEO.pages[page].title.trim()).not.toBe("");
    }
  );
});
