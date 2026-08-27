// The base-URL normalizer, which exists because both of its callers got the
// same two cases wrong in the same way.
//
// Every assertion below is a regression test: `robots.ts` and `sitemap.ts`
// each used `(process.env.WEBSITE_URL ?? "").replace(/\/$/, "")`, which strips
// exactly one trailing slash and does not trim.
//
// The case that actually reaches production is a trailing newline, not typed
// spaces. `validateEnv` checks a trimmed *copy* of WEBSITE_URL and never
// rewrites `process.env`, so a value ending in "\n" — a secret mounted from a
// file, or a `.env` line with a stray newline — satisfies the build's env
// assertion and then arrives here intact. The old strip did not match it, so
// robots advertised a sitemap URL with a newline inside it, and every sitemap
// entry carried one too.

import { describe, expect, it } from "vitest";
import { siteBaseUrl } from "./siteUrl";

describe("siteBaseUrl", () => {
  it("leaves a well-formed origin alone", () => {
    expect(siteBaseUrl("https://example.test")).toBe("https://example.test");
  });

  it.each([
    ["https://example.test/", "https://example.test"],
    ["https://example.test//", "https://example.test"],
    ["https://example.test///", "https://example.test"],
  ])("strips every trailing slash from %j", (raw, expected) => {
    expect(siteBaseUrl(raw)).toBe(expected);
  });

  // The shapes deploy tooling actually produces, first.
  it.each([
    ["https://example.test\n", "https://example.test"],
    ["https://example.test/\n", "https://example.test"],
    ["https://example.test\r\n", "https://example.test"],
    ["  https://example.test  ", "https://example.test"],
    ["\thttps://example.test\n", "https://example.test"],
    ["  https://example.test/  ", "https://example.test"],
  ])("trims surrounding whitespace from %j", (raw, expected) => {
    expect(siteBaseUrl(raw)).toBe(expected);
  });

  // Spelled out because it is the one that shipped: the old single-slash strip
  // left the newline in place, so this is what robots.txt advertised.
  it("does not leave a newline inside the advertised sitemap URL", () => {
    const base = siteBaseUrl("https://example.test\n");
    expect(`${base}/sitemap.xml`).toBe("https://example.test/sitemap.xml");
    expect(`${base}/sitemap.xml`).not.toMatch(/\s/);
  });

  // The load-bearing case. Callers branch on truthiness to decide whether they
  // know their own address, so a present-but-unusable value has to come back
  // empty or it is treated as a real origin.
  it.each([undefined, "", "   ", "\t\n", "/", "//"])(
    "reports %j as unknown rather than as an origin",
    (raw) => {
      expect(siteBaseUrl(raw)).toBe("");
      expect(Boolean(siteBaseUrl(raw))).toBe(false);
    }
  );

  it("keeps a path prefix, for a site served from a subdirectory", () => {
    expect(siteBaseUrl("https://example.test/portfolio/")).toBe("https://example.test/portfolio");
  });

  it("never leaves a result that would double a separator", () => {
    for (const raw of ["https://example.test", "https://example.test/", "https://example.test//"]) {
      expect(`${siteBaseUrl(raw)}/sitemap.xml`).toBe("https://example.test/sitemap.xml");
    }
  });
});
