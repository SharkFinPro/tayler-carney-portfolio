// A three-line delegation, tested for one reason: the fallback label it passes
// is a string a visitor reads. When the resume asset has no Media Library
// title and no usable filename, "Resume" is what ends up on the link — and
// nothing else in the codebase pins that.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { at } from "@/test/at";

const resolveAssetRef = vi.hoisted(() => vi.fn());
vi.mock("@/lib/assetRef", () => ({ resolveAssetRef }));

const { resolveResumeAsset } = await import("./resume");

// Without this, the `mock.calls[0]` assertion below reads whichever test ran
// first rather than this one. That is precisely the order-dependence the
// determinism CI job exists to catch — and it caught this one, on the very
// next PR after the job was added.
beforeEach(() => {
  resolveAssetRef.mockReset();
});

describe("resolveResumeAsset", () => {
  it("resolves the id with 'Resume' as the visible fallback", async () => {
    resolveAssetRef.mockResolvedValue({ url: "https://x.test/cv.pdf", name: "CV" });

    await expect(resolveResumeAsset("asset-1")).resolves.toEqual({
      url: "https://x.test/cv.pdf",
      name: "CV",
    });
    expect(at(resolveAssetRef.mock.calls, 0)).toEqual(["asset-1", "Resume"]);
  });

  it("passes a missing asset through rather than inventing one", async () => {
    resolveAssetRef.mockResolvedValue(null);
    await expect(resolveResumeAsset("gone")).resolves.toBeNull();
  });
});
