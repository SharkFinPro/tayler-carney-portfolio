// `sanitizeSeo` feeds `generateMetadata()` in the root layout. A shape it
// returns wrong becomes a wrong <title> or a missing description on every page
// at once, so the defaults and the keyword coercion are worth pinning down.

import { describe, expect, it } from "vitest";
import { DEFAULT_SEO, SEO_PAGE_KEYS, pageMetadata, sanitizeSeo } from "./seo";

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
