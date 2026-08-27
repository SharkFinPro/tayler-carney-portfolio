// Asset-reference resolution, and the control-flow signal it must not eat.
//
// `resolveAssetRef` runs inside the root layout (via the Footer) and inside the
// metadata generator, which makes it one of the places AGENTS.md warns about
// most sharply: Next signals "this route must render dynamically" by *throwing*,
// so the `catch` here has to rethrow that and swallow only real failures. The
// consequence of getting it wrong is not an error — it is a route that silently
// stops being dynamic, which is exactly the failure that already happened once
// in this codebase.
//
// The naming fallback chain is the other half. It decides the visible label on
// the resume link, and every step of it is a string a visitor reads.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { at } from "@/test/at";

const cmsRead = vi.hoisted(() => vi.fn());
const rethrowIfControlFlow = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cachedReads", () => ({
  cmsRead,
  CACHE_TAGS: { siteData: "siteData", projects: "projects" },
}));
vi.mock("@/lib/nextErrors", () => ({ rethrowIfControlFlow }));

const { resolveAssetRef } = await import("./assetRef");

/** An asset payload as the CMS returns it. */
const asset = (fields: Record<string, unknown>) => ({ asset: fields });

beforeEach(() => {
  cmsRead.mockReset();
  rethrowIfControlFlow.mockReset();
  cmsRead.mockResolvedValue(asset({ url: "https://media.graphassets.com/a", fileName: "cv.pdf" }));
});

describe("resolveAssetRef — when there is nothing to resolve", () => {
  it("returns null for an unset id without reading the CMS", async () => {
    await expect(resolveAssetRef("")).resolves.toBeNull();
    expect(cmsRead).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing asset", { asset: null }],
    ["an absent asset key", {}],
    ["a null payload", null],
    ["an asset with no url", asset({ fileName: "cv.pdf" })],
    ["an asset with an empty url", asset({ url: "", fileName: "cv.pdf" })],
  ])("returns null for %s rather than a broken link", async (_name, payload) => {
    cmsRead.mockResolvedValue(payload);
    await expect(resolveAssetRef("id")).resolves.toBeNull();
  });

  // An absent asset is an ordinary condition — a reference to something since
  // deleted — and the optional chaining is what keeps it on the normal path.
  // Drop it and the same payloads throw a TypeError that the catch below
  // absorbs, returning the same null.
  //
  // Being straight about what this pins: today the two are indistinguishable
  // from outside. `rethrowIfControlFlow` only rethrows errors carrying a Next
  // `digest`, and a TypeError has none, so it returns silently and the caller
  // sees an identical result. This asserts on an internal call rather than an
  // output, which is a cost worth naming — it is also the only thing that can
  // tell the two implementations apart.
  //
  // It earns its place because the design intent is real: that catch exists
  // for genuine failures, and routing every missing asset through it means the
  // next thing added there — error reporting is the obvious candidate — starts
  // firing on a condition that is not a failure.
  it.each([
    ["a missing asset", { asset: null }],
    ["an absent asset key", {}],
    ["a null payload", null],
  ])("resolves %s without going through the failure path", async (_name, payload) => {
    cmsRead.mockResolvedValue(payload);

    await expect(resolveAssetRef("id")).resolves.toBeNull();
    expect(rethrowIfControlFlow).not.toHaveBeenCalled();
  });
});

describe("resolveAssetRef — the display-name fallback chain", () => {
  it("prefers the Media Library title", async () => {
    cmsRead.mockResolvedValue(
      asset({ url: "https://x.test/a", fileName: "final_v3_FINAL.pdf", title: "Résumé" })
    );
    await expect(resolveAssetRef("id")).resolves.toEqual({ url: "https://x.test/a", name: "Résumé" });
  });

  it.each(["", "   ", "\t\n"])("falls back to the filename when the title is %j", async (title) => {
    cmsRead.mockResolvedValue(asset({ url: "https://x.test/a", fileName: "my-resume.pdf", title }));
    const result = await resolveAssetRef("id");
    expect(result?.name).toBe("my-resume");
  });

  it("strips only the final extension", async () => {
    cmsRead.mockResolvedValue(asset({ url: "https://x.test/a", fileName: "archive.tar.gz" }));
    const result = await resolveAssetRef("id");
    expect(result?.name).toBe("archive.tar");
  });

  it("keeps a filename that has no extension", async () => {
    cmsRead.mockResolvedValue(asset({ url: "https://x.test/a", fileName: "README" }));
    const result = await resolveAssetRef("id");
    expect(result?.name).toBe("README");
  });

  it.each([
    ["a missing filename", {}],
    ["an empty filename", { fileName: "" }],
    // A name that is nothing but an extension leaves an empty base behind.
    ["a dotfile-only name", { fileName: ".pdf" }],
  ])("falls back to the caller's label for %s", async (_name, fields) => {
    cmsRead.mockResolvedValue(asset({ url: "https://x.test/a", ...fields }));
    const result = await resolveAssetRef("id", "Resume");
    expect(result?.name).toBe("Resume");
  });

  it("defaults that label to 'File' when the caller gives none", async () => {
    cmsRead.mockResolvedValue(asset({ url: "https://x.test/a" }));
    const result = await resolveAssetRef("id");
    expect(result?.name).toBe("File");
  });
});

describe("resolveAssetRef — the read itself", () => {
  it("tags the read so a SiteData write can invalidate it", async () => {
    await resolveAssetRef("asset-123");

    const [, variables, options] = at(cmsRead.mock.calls, 0) as [string, unknown, { tags: string[] }];
    expect(variables).toEqual({ id: "asset-123" });
    expect(options.tags).toContain("siteData");
  });

  // Every other test here feeds the payload in through the mock, so the query
  // text is never exercised: drop a field from it and the fixtures still
  // supply that field, and nothing fails. In production the field would simply
  // stop arriving — losing `title` silently demotes every asset to its
  // filename, which is the fallback working exactly as designed and therefore
  // invisible.
  //
  // All three fields are read by this resolver, though not all by the name:
  // `title` and `fileName` feed the display name, `url` is the returned link.
  it("asks for every field it goes on to read", async () => {
    await resolveAssetRef("asset-123");

    const [query] = at(cmsRead.mock.calls, 0) as [string];
    expect(query).toContain("asset(where: { id: $id })");
    for (const field of ["url", "fileName", "title"]) {
      expect(query).toMatch(new RegExp(`^\\s*${field}\\s*$`, "m"));
    }
  });
});

describe("resolveAssetRef — failure handling", () => {
  it("never lets a broken reference take the page down", async () => {
    cmsRead.mockRejectedValue(new Error("CMS unreachable"));
    await expect(resolveAssetRef("id")).resolves.toBeNull();
  });

  it("offers every caught error to the control-flow check first", async () => {
    const error = new Error("CMS unreachable");
    cmsRead.mockRejectedValue(error);

    await resolveAssetRef("id");

    expect(rethrowIfControlFlow).toHaveBeenCalledWith(error);
  });

  // The failure this guards against is not an exception reaching a user — it is
  // a route quietly losing its dynamic rendering because the signal was eaten.
  it("does NOT swallow a Next control-flow signal", async () => {
    const signal = new Error("DYNAMIC_SERVER_USAGE");
    cmsRead.mockRejectedValue(signal);
    rethrowIfControlFlow.mockImplementation((e: unknown) => {
      throw e;
    });

    await expect(resolveAssetRef("id")).rejects.toThrow("DYNAMIC_SERVER_USAGE");
  });
});
