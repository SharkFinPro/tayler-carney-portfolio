// robots.txt.
//
// Small, and every line of it is a claim made to crawlers rather than to a
// reader — which is why nothing here fails visibly. A lost `disallow` gets the
// admin login indexed; a sitemap directive emitted relative is invalid and
// quietly ignored, so the sitemap stops being announced while the file still
// looks correct.

import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("what crawlers may visit", () => {
  it("allows the site", () => {
    expect(robots().rules).toMatchObject({ userAgent: "*", allow: "/" });
  });

  // Both forms on purpose: a single "/admin" is matched as a prefix by most
  // crawlers, but "most" is doing real work in that sentence.
  it("disallows the admin surface, as both a path and a subtree", () => {
    const { disallow } = robots().rules as { disallow: string[] };

    expect(disallow).toContain("/admin");
    expect(disallow).toContain("/admin/");
  });
});

describe("the sitemap directive", () => {
  it("announces the sitemap when the site URL is known", () => {
    vi.stubEnv("WEBSITE_URL", "https://example.test");
    expect(robots().sitemap).toBe("https://example.test/sitemap.xml");
  });

  it.each([
    "https://example.test/",
    "https://example.test//",
  ])("does not double the slash for the configured url %j", (url) => {
    vi.stubEnv("WEBSITE_URL", url);
    expect(robots().sitemap).not.toContain("//sitemap.xml");
  });

  // Omitted entirely rather than emitted relative: a relative sitemap
  // directive is invalid, so it is worse than saying nothing at all.
  it.each([undefined, "", "   "])(
    "omits the directive rather than emitting a relative one when the url is %j",
    (url) => {
      vi.stubEnv("WEBSITE_URL", url as string);

      const result = robots();
      expect(result.sitemap).toBeUndefined();
      expect("sitemap" in result).toBe(false);
    }
  );
});
