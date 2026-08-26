// getSiteData runs inside the ROOT LAYOUT — in generateMetadata, NavBar, and
// Footer. That is outside app/error.tsx, so an uncaught throw here skips the
// designed error page and renders Next's unstyled crash screen on every route
// at once. These tests pin down that a CMS failure degrades to defaults.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GLOBAL } from "@/lib/global";
import { DEFAULT_SEO } from "@/lib/seo";

const cmsQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cms", () => ({ cmsQuery }));

// Imported after the mock is registered.
const { default: getSiteData } = await import("./SiteData");

beforeEach(() => {
  cmsQuery.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getSiteData — happy path", () => {
  it("returns the entry's sanitized content", async () => {
    cmsQuery.mockResolvedValue({
      siteDatas: [
        {
          id: "site-1",
          global: { displayName: "  Tayler Carney  ", email: "hi@example.com" },
          seo: { title: "Portfolio" },
        },
      ],
    });

    const data = await getSiteData();
    expect(data.id).toBe("site-1");
    expect(data.global.displayName).toBe("Tayler Carney");
    expect(data.global.email).toBe("hi@example.com");
    expect(data.seo.title).toBe("Portfolio");
    // Unset fields still come back filled from the defaults.
    expect(data.seo.ogTitle).toBe(DEFAULT_SEO.ogTitle);
  });
});

describe("getSiteData — degradation", () => {
  it("falls back to defaults when the CMS request rejects", async () => {
    cmsQuery.mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));

    const data = await getSiteData();
    expect(data.global).toEqual(DEFAULT_GLOBAL);
    expect(data.seo).toEqual(DEFAULT_SEO);
    expect(data.id).toBe("");
  });

  it("never throws, whatever the CMS layer does", async () => {
    const failures: unknown[] = [
      new Error("network"),
      new TypeError("Failed to parse URL"),
      "a bare string rejection",
      undefined,
    ];

    for (const failure of failures) {
      cmsQuery.mockRejectedValueOnce(failure);
      await expect(getSiteData()).resolves.toBeTruthy();
    }
  });

  it("logs the failure rather than swallowing it silently", async () => {
    cmsQuery.mockRejectedValue(new Error("boom"));
    await getSiteData();
    // The page still renders, so this log is the only outage signal.
    expect(console.error).toHaveBeenCalled();
  });

  it("handles an empty CMS response (no SiteData entry exists yet)", async () => {
    cmsQuery.mockResolvedValue({ siteDatas: [] });
    const data = await getSiteData();
    expect(data.global).toEqual(DEFAULT_GLOBAL);
    expect(data.id).toBe("");
  });

  it("handles a malformed CMS response", async () => {
    for (const response of [null, undefined, {}, { siteDatas: null }, "nonsense"]) {
      cmsQuery.mockResolvedValueOnce(response);
      const data = await getSiteData();
      expect(data.global).toEqual(DEFAULT_GLOBAL);
    }
  });

  it("coerces a non-string id rather than passing it through", async () => {
    cmsQuery.mockResolvedValue({ siteDatas: [{ id: 42, global: null, seo: null }] });
    expect((await getSiteData()).id).toBe("");
  });
});
