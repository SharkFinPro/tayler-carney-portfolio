// `sanitizeGlobal` guards the site identity singleton. It runs on both render
// and save, so DEFAULT_GLOBAL must survive a null CMS field and the admin form
// must never be able to store a shape the renderer can't handle.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_GLOBAL,
  DEFAULT_NAV,
  MAX_NAV_ITEMS,
  normalizeHandle,
  sanitizeGlobal,
  sanitizeNav,
} from "./global";

describe("sanitizeGlobal", () => {
  it("returns the defaults for an empty or absent value", () => {
    for (const input of [null, undefined, {}]) {
      expect(sanitizeGlobal(input)).toEqual(DEFAULT_GLOBAL);
    }
  });

  it("never throws on hostile input", () => {
    for (const input of [0, "", "text", true, [], NaN, () => {}, new Date()]) {
      expect(() => sanitizeGlobal(input)).not.toThrow();
    }
  });

  it("always returns every key, whatever the input", () => {
    const keys = Object.keys(DEFAULT_GLOBAL).sort();
    for (const input of [null, {}, { displayName: "x" }, "nonsense"]) {
      expect(Object.keys(sanitizeGlobal(input)).sort()).toEqual(keys);
    }
  });

  it("keeps supplied strings and trims them", () => {
    const out = sanitizeGlobal({
      displayName: "  Tayler Carney  ",
      focus: "  Structural Fashion Design ",
      email: " hello@example.com ",
    });
    expect(out.displayName).toBe("Tayler Carney");
    expect(out.focus).toBe("Structural Fashion Design");
    expect(out.email).toBe("hello@example.com");
  });

  it("falls back to the default when a value is the wrong type", () => {
    const out = sanitizeGlobal({ displayName: 42, focus: null, email: {} });
    expect(out.displayName).toBe(DEFAULT_GLOBAL.displayName);
    expect(out.focus).toBe(DEFAULT_GLOBAL.focus);
    expect(out.email).toBe(DEFAULT_GLOBAL.email);
  });

  it("preserves a deliberately cleared string rather than resurrecting the default", () => {
    // An admin emptying the email field must actually empty it.
    expect(sanitizeGlobal({ email: "" }).email).toBe("");
    expect(sanitizeGlobal({ email: "   " }).email).toBe("");
  });

  describe("resumeAssetId", () => {
    it("accepts an opaque alphanumeric Hygraph id", () => {
      expect(sanitizeGlobal({ resumeAssetId: "cm3x9k2p0000108l4abcd1234" }).resumeAssetId).toBe(
        "cm3x9k2p0000108l4abcd1234"
      );
    });

    it("trims surrounding whitespace", () => {
      expect(sanitizeGlobal({ resumeAssetId: "  abc123  " }).resumeAssetId).toBe("abc123");
    });

    it("rejects anything that is not a bare alphanumeric token", () => {
      // The id is interpolated into a GraphQL variable, and a URL here would
      // mean someone pasted a link instead of picking from the Media Library.
      for (const bad of [
        "https://media.graphassets.com/abc",
        "abc-123",
        "abc_123",
        "abc 123",
        "../../etc/passwd",
        '" }) { id } }',
        42,
        null,
        {},
      ]) {
        expect(sanitizeGlobal({ resumeAssetId: bad }).resumeAssetId, String(bad)).toBe("");
      }
    });
  });

  it("is idempotent", () => {
    const once = sanitizeGlobal({
      displayName: " Name ",
      email: "a@b.com",
      linkedInHandle: "someone",
      resumeAssetId: "abc123",
    });
    expect(sanitizeGlobal(once)).toEqual(once);
  });
});

describe("normalizeHandle", () => {
  it("keeps a bare username unchanged", () => {
    expect(normalizeHandle("taylercarney")).toBe("taylercarney");
    expect(normalizeHandle("tayler-carney")).toBe("tayler-carney");
    expect(normalizeHandle("tayler.carney_01")).toBe("tayler.carney_01");
  });

  it("strips a leading @", () => {
    expect(normalizeHandle("@taylercarney")).toBe("taylercarney");
    expect(normalizeHandle("@@taylercarney")).toBe("taylercarney");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeHandle("  taylercarney  ")).toBe("taylercarney");
  });

  it.each([
    // The realistic mistake: pasting the whole profile URL into a field whose
    // hint says "the part after linkedin.com/in/".
    ["https://www.linkedin.com/in/taylercarney", "taylercarney"],
    ["https://linkedin.com/in/taylercarney", "taylercarney"],
    ["http://www.linkedin.com/in/taylercarney/", "taylercarney"],
    ["www.linkedin.com/in/taylercarney", "taylercarney"],
    ["linkedin.com/in/taylercarney", "taylercarney"],
    ["https://instagram.com/taylercarney", "taylercarney"],
    ["https://www.instagram.com/taylercarney/", "taylercarney"],
    ["https://instagram.com/taylercarney?hl=en", "taylercarney"],
  ])("reduces %j to the bare handle", (input, expected) => {
    expect(normalizeHandle(input)).toBe(expected);
  });

  it("drops values that still are not a username", () => {
    // Better to hide the link than render one that 404s.
    for (const bad of ["   ", "two words", "https://", "@", "//", 42, null, {}, []]) {
      expect(normalizeHandle(bad), String(bad)).toBe("");
    }
  });

  it("takes the last path segment of any slashed value", () => {
    // Consequence of the URL-paste handling, and the right call: whatever the
    // shape of the pasted link, the trailing segment is the username.
    expect(normalizeHandle("a/b/c/")).toBe("c");
    expect(normalizeHandle("some.site/u/name")).toBe("name");
  });

  it("is idempotent", () => {
    const once = normalizeHandle("https://www.linkedin.com/in/taylercarney/");
    expect(normalizeHandle(once)).toBe(once);
  });

  it("is applied by sanitizeGlobal", () => {
    const out = sanitizeGlobal({
      linkedInHandle: "https://www.linkedin.com/in/taylercarney",
      instagramHandle: "@taylercarney",
    });
    expect(out.linkedInHandle).toBe("taylercarney");
    expect(out.instagramHandle).toBe("taylercarney");
  });

  it("leaves an empty handle empty, so the render guards hide the channel", () => {
    const out = sanitizeGlobal({ linkedInHandle: "", instagramHandle: "   " });
    expect(out.linkedInHandle).toBe("");
    expect(out.instagramHandle).toBe("");
  });
});

describe("sanitizeNav", () => {
  it("keeps well-formed entries in order", () => {
    const items = [
      { label: "Work", href: "/portfolio" },
      { label: "Studio", href: "/atelier" },
    ];
    expect(sanitizeNav(items)).toEqual(items);
  });

  it("trims labels and hrefs", () => {
    expect(sanitizeNav([{ label: "  Work  ", href: "  /portfolio  " }])).toEqual([
      { label: "Work", href: "/portfolio" },
    ]);
  });

  it("drops half-filled rows rather than rendering a dead link", () => {
    const out = sanitizeNav([
      { label: "Work", href: "/portfolio" },
      { label: "No link" },
      { href: "/orphan" },
      { label: "  ", href: "/blank" },
      {},
      null,
      "nonsense",
    ]);
    expect(out).toEqual([{ label: "Work", href: "/portfolio" }]);
  });

  it("rejects unsafe and off-site-by-accident hrefs", () => {
    for (const href of ["javascript:alert(1)", "data:text/html,x", "//evil.com", "vbscript:x"]) {
      expect(sanitizeNav([{ label: "Bad", href }]), href).toEqual([]);
    }
  });

  it("allows the link shapes an editor would reasonably use", () => {
    for (const href of ["/", "/portfolio", "#studio", "https://example.com", "mailto:a@b.com"]) {
      expect(sanitizeNav([{ label: "L", href }]), href).toHaveLength(1);
    }
  });

  it("caps the list so the header layout can't be broken from the CMS", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `P${i}`, href: `/p${i}` }));
    expect(sanitizeNav(many)).toHaveLength(MAX_NAV_ITEMS);
  });

  it("falls back to the defaults only when the value is missing or not a list", () => {
    for (const bad of [null, undefined, "nope", 42, {}]) {
      expect(sanitizeNav(bad), String(bad)).toEqual(DEFAULT_NAV);
    }
  });

  it("honors a deliberately emptied list", () => {
    // Distinct from "absent": an admin may legitimately want no nav at all,
    // and resurrecting the defaults would make that impossible.
    expect(sanitizeNav([])).toEqual([]);
  });

  it("is idempotent", () => {
    const once = sanitizeNav([{ label: " A ", href: " /a " }, { label: "", href: "/b" }]);
    expect(sanitizeNav(once)).toEqual(once);
  });

  it("is applied by sanitizeGlobal", () => {
    const out = sanitizeGlobal({ navItems: [{ label: "Only", href: "/only" }] });
    expect(out.navItems).toEqual([{ label: "Only", href: "/only" }]);
  });

  it("leaves the seed nav matching what the components used to hardcode", () => {
    // The rendered menu must be unchanged until an admin edits it.
    expect(DEFAULT_NAV.map((i) => i.href)).toEqual([
      "/",
      "/portfolio",
      "/atelier",
      "/about",
      "/contact",
    ]);
  });
});
