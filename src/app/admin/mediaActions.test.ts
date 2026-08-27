// The Media Library actions: upload validation, the stage-aware metadata
// write, the delete, and the usage scan that warns before one.
//
// `@/lib/uploads` is deliberately NOT mocked. The whole point of that module is
// that the client-declared MIME type is forgeable, so the real leading bytes
// decide — and that matters more here than almost anywhere else in the app,
// because next.config.ts sets `dangerouslyAllowSVG`. Mocking the validator
// would leave the one check standing between a stolen session and a stored
// SVG asserted only against a stub of itself.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { at } from "@/test/at";

const requireAuth = vi.hoisted(() => vi.fn());
const cmsMutate = vi.hoisted(() => vi.fn());
const cmsUpload = vi.hoisted(() => vi.fn());
const cmsQueryAuthed = vi.hoisted(() => vi.fn());
const getAssets = vi.hoisted(() => vi.fn());
const getAssetById = vi.hoisted(() => vi.fn());
const auditEvent = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ requireAuth }));
vi.mock("@/lib/cms", () => ({ cmsMutate, cmsUpload, cmsQueryAuthed }));
vi.mock("@/lib/getAssets", () => ({ getAssets, getAssetById }));
vi.mock("@/lib/observability", () => ({ auditEvent, reportError }));

const {
  deleteAsset,
  fetchAssets,
  findAssetUsage,
  publishAsset,
  unpublishAsset,
  updateAsset,
  uploadAsset,
} = await import("./mediaActions");

const DENIAL = { ok: false as const, error: "Not authorized." };

// Real leading bytes, so the real sniffer has something honest to read.
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
// "RIFF", four length bytes the sniffer skips, then "WEBP".
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const SVG = [...new TextEncoder().encode("<svg xmlns=")];
const HTML = [...new TextEncoder().encode("<!DOCTYPE html>")];

/** A File whose *bytes* are `head`, regardless of the type it claims to be. */
function fileOf(head: number[], name = "photo.png", type = "image/png"): File {
  // Pad past the 16 bytes the action slices, so short signatures still sniff.
  const bytes = new Uint8Array([...head, ...new Array(32).fill(0)]);
  return new File([bytes], name, { type });
}

function form(file: unknown, fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  if (file !== undefined) fd.set("file", file as Blob);
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** The GraphQL documents sent, in order. */
const mutations = () => cmsMutate.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  for (const m of [
    requireAuth,
    cmsMutate,
    cmsUpload,
    cmsQueryAuthed,
    getAssets,
    getAssetById,
    auditEvent,
    reportError,
  ]) {
    m.mockReset();
  }

  requireAuth.mockResolvedValue(null);
  cmsMutate.mockResolvedValue({});
  cmsUpload.mockResolvedValue({ id: "asset-1" });
  getAssets.mockResolvedValue([]);
  getAssetById.mockResolvedValue({ id: "asset-1", size: 1234, status: "draft" });
  cmsQueryAuthed.mockResolvedValue({ projects: [], siteDatas: [{}] });
});

// ── Authorization ────────────────────────────────────────────────────────────

describe("authorization", () => {
  const actions: [name: string, call: () => Promise<unknown>][] = [
    ["fetchAssets", () => fetchAssets()],
    ["updateAsset", () => updateAsset("a1", { title: "t" }, false)],
    ["publishAsset", () => publishAsset("a1")],
    ["unpublishAsset", () => unpublishAsset("a1")],
    ["deleteAsset", () => deleteAsset("a1")],
    ["uploadAsset", () => uploadAsset(form(fileOf(PNG)))],
    ["findAssetUsage", () => findAssetUsage(["https://x.test/a.png"])],
  ];

  it.each(actions)("%s returns the denial when not authorized", async (_n, call) => {
    requireAuth.mockResolvedValue(DENIAL);
    await expect(call()).resolves.toEqual(DENIAL);
  });

  it.each(actions)("%s touches nothing when not authorized", async (_n, call) => {
    requireAuth.mockResolvedValue(DENIAL);
    await call();
    expect(cmsMutate).not.toHaveBeenCalled();
    expect(cmsUpload).not.toHaveBeenCalled();
    expect(cmsQueryAuthed).not.toHaveBeenCalled();
    expect(getAssets).not.toHaveBeenCalled();
  });
});

// ── Upload validation ────────────────────────────────────────────────────────

describe("uploadAsset — what may be stored", () => {
  it.each([undefined, "just a string", 42])("refuses a non-file %j", async (value) => {
    await expect(uploadAsset(form(value))).resolves.toEqual({
      ok: false,
      error: "No file provided.",
    });
    expect(cmsUpload).not.toHaveBeenCalled();
  });

  // next.config.ts sets dangerouslyAllowSVG, which makes a stored SVG genuinely
  // dangerous rather than merely unsupported. The declared type is irrelevant —
  // these all claim to be PNGs.
  it.each([
    ["an SVG", SVG],
    ["an HTML document", HTML],
    ["a plain-text file", [...new TextEncoder().encode("hello there")]],
    ["a zip/office file", [0x50, 0x4b, 0x03, 0x04]],
  ])("refuses %s even when it claims to be a PNG", async (_n, head) => {
    const result = await uploadAsset(form(fileOf(head, "innocent.png", "image/png")));

    expect(result).toEqual({
      ok: false,
      error: "That file type isn't supported. Upload a JPEG, PNG, WebP, or PDF.",
    });
    expect(cmsUpload).not.toHaveBeenCalled();
  });

  it("refuses an empty file", async () => {
    const result = await uploadAsset(form(new File([], "empty.png", { type: "image/png" })));
    expect(result).toEqual({ ok: false, error: "That file is empty." });
    expect(cmsUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["PNG", PNG],
    ["JPEG", JPEG],
    ["PDF", PDF],
    // WebP is the only two-part signature — "RIFF", four size bytes, "WEBP" —
    // so it is the one most likely to break on a refactor of the sniffer.
    ["WebP", WEBP],
  ])("accepts a real %s", async (_n, head) => {
    const result = await uploadAsset(form(fileOf(head)));
    expect(result.ok).toBe(true);
    expect(cmsUpload).toHaveBeenCalledOnce();
  });

  // The stored name must reflect the bytes, not the claim — otherwise a PDF
  // lands in the library called `.png` and every consumer misreads it.
  it("forces the extension to match the sniffed type", async () => {
    await uploadAsset(form(fileOf(PDF, "resume.png", "image/png")));

    const uploaded = at(cmsUpload.mock.calls, 0)[0] as File;
    expect(uploaded.name).toMatch(/\.pdf$/);
    expect(uploaded.type).toBe("application/pdf");
  });

  it.each([
    ["../../etc/passwd.png", "a directory traversal"],
    ["C:\\Windows\\evil.png", "a Windows path"],
  ])("strips %j — %s", async (name) => {
    await uploadAsset(form(fileOf(PNG, name, "image/png")));

    const uploaded = at(cmsUpload.mock.calls, 0)[0] as File;
    expect(uploaded.name).not.toContain("/");
    expect(uploaded.name).not.toContain("\\");
    expect(uploaded.name).not.toContain("..");
  });
});

describe("uploadAsset — after the bytes are accepted", () => {
  it("writes no metadata mutation when neither title nor alt text was given", async () => {
    await uploadAsset(form(fileOf(PNG)));
    expect(mutations().filter((m) => m.includes("updateAsset"))).toHaveLength(0);
  });

  const metadataWrite = () =>
    cmsMutate.mock.calls.find((c) => String(c[0]).includes("updateAsset"));

  it.each([
    [{ title: "A name" }, { title: "A name" }],
    [{ altText: "A description" }, { altText: "A description" }],
    [{ title: " A ", altText: " B " }, { title: "A", altText: "B" }],
  ])("writes %j as %j", async (fields, expected) => {
    await uploadAsset(form(fileOf(PNG), fields as Record<string, string>));

    expect((metadataWrite()?.[1] as { data: unknown }).data).toEqual(expected);
  });

  // Whitespace-only fields are not metadata, and the write is skipped
  // entirely rather than sent as an empty update.
  it("writes nothing when every field is whitespace", async () => {
    await uploadAsset(form(fileOf(PNG), { title: "   " }));

    expect(metadataWrite()).toBeUndefined();
  });

  // A draft image dropped on a page would not display for visitors, and a
  // non-technical editor should not have to know the draft/published split.
  it("publishes the asset and reports it as published", async () => {
    const result = await uploadAsset(form(fileOf(PNG)));
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);

    expect(mutations().some((m) => m.includes("publishAsset"))).toBe(true);
    expect(result.asset.status).toBe("published");
  });

  it("reports a readable failure when the asset never loads", async () => {
    getAssetById.mockResolvedValue(null);
    await expect(uploadAsset(form(fileOf(PNG)))).resolves.toEqual({
      ok: false,
      error: "Upload succeeded but the asset could not be loaded.",
    });
  });

  it("polls until ingestion populates the size", async () => {
    vi.useFakeTimers();
    try {
      getAssetById
        .mockResolvedValueOnce({ id: "asset-1", size: null })
        .mockResolvedValueOnce({ id: "asset-1", size: null })
        .mockResolvedValue({ id: "asset-1", size: 999 });

      const pending = uploadAsset(form(fileOf(PNG)));
      await vi.advanceTimersByTimeAsync(750 * 3);
      const result = await pending;

      if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
      expect(result.asset.size).toBe(999);
      // Exactly three: the initial read plus two polls. Pinning the count
      // rather than "more than one" catches a loop that polls the wrong
      // number of times as well as one that stops polling entirely.
      expect(getAssetById).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  // The poll is bounded at 12 attempts, and falling through with an unpopulated
  // size is the deliberate end of that bound rather than an oversight — the
  // alternative is hanging the editor on a CMS that never finishes ingesting.
  // Pinned because it is the behaviour nobody would notice changing: the action
  // still reports success, just with an asset the gallery cannot size.
  it("gives up after a bounded number of polls rather than waiting forever", async () => {
    vi.useFakeTimers();
    try {
      getAssetById.mockResolvedValue({ id: "asset-1", size: null });

      const pending = uploadAsset(form(fileOf(PNG)));
      await vi.advanceTimersByTimeAsync(750 * 20);
      const result = await pending;

      if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
      expect(result.asset.size).toBeNull();
      // The initial read plus the 12 bounded retries, and no more.
      expect(getAssetById).toHaveBeenCalledTimes(13);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never forwards the raw CMS error", async () => {
    cmsUpload.mockRejectedValue(new Error("token scope hygraph-internal-xyz"));

    const result = await uploadAsset(form(fileOf(PNG)));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).not.toContain("hygraph-internal-xyz");
  });
});

// ── Metadata, publish state, delete ──────────────────────────────────────────

describe("updateAsset", () => {
  it("nulls a cleared field rather than writing an empty string", async () => {
    await updateAsset("a1", { title: "  ", altText: "" }, false);

    const [, variables] = at(cmsMutate.mock.calls, 0) as [string, { data: Record<string, unknown> }];
    expect(variables.data).toEqual({ title: null, altText: null });
  });

  it("trims what it writes", async () => {
    await updateAsset("a1", { title: "  A Name  ", altText: "  Alt  " }, false);
    const [, variables] = at(cmsMutate.mock.calls, 0) as [string, { data: Record<string, unknown> }];
    expect(variables.data).toEqual({ title: "A Name", altText: "Alt" });
  });

  // Stage-aware on purpose: editing metadata must never silently publish an
  // asset the editor had deliberately kept as a draft.
  it("does not publish a draft-only asset", async () => {
    await updateAsset("a1", { title: "x" }, false);
    expect(mutations().some((m) => m.includes("publishAsset"))).toBe(false);
  });

  it("re-publishes one that was already published", async () => {
    await updateAsset("a1", { title: "x" }, true);
    expect(mutations().some((m) => m.includes("publishAsset"))).toBe(true);
  });
});

describe("publishAsset / unpublishAsset", () => {
  it("publishes the asset it was given", async () => {
    await expect(publishAsset("a1")).resolves.toEqual({ ok: true });

    expect(at(mutations(), 0)).toContain("publishAsset");
    expect(at(cmsMutate.mock.calls, 0)[1]).toEqual({ id: "a1" });
  });

  it("unpublishes the asset it was given", async () => {
    await expect(unpublishAsset("a1")).resolves.toEqual({ ok: true });

    expect(at(mutations(), 0)).toContain("unpublishAsset");
    expect(at(cmsMutate.mock.calls, 0)[1]).toEqual({ id: "a1" });
  });

  // These two are the manual controls in the gallery, so a permission failure
  // here is the case AGENTS.md calls out as "not a code bug" — it has to read
  // as something the operator can act on rather than as a raw GraphQL string.
  it.each([
    ["publishAsset", () => publishAsset("a1")],
    ["unpublishAsset", () => unpublishAsset("a1")],
    ["updateAsset", () => updateAsset("a1", { title: "x" }, false)],
  ])("%s never forwards the raw CMS error", async (_n, call) => {
    cmsMutate.mockRejectedValue(new Error("permission denied: token scope hygraph-internal-xyz"));

    const result = (await call()) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(result.error).not.toContain("hygraph-internal-xyz");
    expect(result.error).toContain("permission");
  });
});

describe("deleteAsset", () => {
  it("unpublishes before deleting", async () => {
    await deleteAsset("a1");

    expect(mutations()).toHaveLength(2);
    expect(at(mutations(), 0)).toContain("unpublishAsset");
    expect(at(mutations(), 1)).toContain("deleteAsset");
  });

  it("still deletes when the asset was not published", async () => {
    cmsMutate.mockRejectedValueOnce(new Error("not published")).mockResolvedValue({});

    await expect(deleteAsset("a1")).resolves.toEqual({ ok: true });
    expect(at(mutations(), 1)).toContain("deleteAsset");
  });

  // Deleting can silently break any page still referencing the asset, and the
  // usage warning is only advisory — so the deletion itself is recorded.
  it("records the deletion in the audit trail", async () => {
    await deleteAsset("a1");
    expect(at(auditEvent.mock.calls, 0)[0]).toMatchObject({
      action: "deleteAsset",
      model: "Asset",
      entryId: "a1",
      outcome: "ok",
    });
  });

  it("does not audit a delete that failed", async () => {
    cmsMutate.mockResolvedValueOnce({}).mockRejectedValue(new Error("refused"));

    const result = await deleteAsset("a1");
    expect(result.ok).toBe(false);
    expect(auditEvent).not.toHaveBeenCalled();
  });
});

// ── Usage scan ───────────────────────────────────────────────────────────────

describe("findAssetUsage", () => {
  const URL_A = "https://media.graphassets.com/aaa";

  it.each([[[]], [[""]], [[null as unknown as string]]])(
    "answers %j without querying anything",
    async (urls) => {
      await expect(findAssetUsage(urls)).resolves.toEqual({ ok: true, used: [] });
      expect(cmsQueryAuthed).not.toHaveBeenCalled();
    }
  );

  it("names a project by title when its layout references the asset", async () => {
    cmsQueryAuthed.mockResolvedValue({
      projects: [{ title: "Flats", slug: "flats", projectPage: [{ image: { url: URL_A } }] }],
      siteDatas: [{}],
    });

    await expect(findAssetUsage([URL_A])).resolves.toEqual({ ok: true, used: ["Flats"] });
  });

  it.each([
    [{ title: "  ", slug: "the-slug" }, "the-slug"],
    [{ title: "", slug: "" }, "Untitled project"],
  ])("falls back to %j -> %j", async (fields, expected) => {
    cmsQueryAuthed.mockResolvedValue({
      projects: [{ ...fields, projectPage: [URL_A] }],
      siteDatas: [{}],
    });

    await expect(findAssetUsage([URL_A])).resolves.toEqual({ ok: true, used: [expected] });
  });

  it.each([
    ["atelier", "Atelier"],
    ["about", "About"],
    ["contact", "Contact"],
    ["home", "Home"],
  ])("labels the %j layout as %j", async (field, label) => {
    cmsQueryAuthed.mockResolvedValue({
      projects: [],
      siteDatas: [{ [field]: { nested: { deep: [URL_A] } } }],
    });

    await expect(findAssetUsage([URL_A])).resolves.toEqual({ ok: true, used: [label] });
  });

  // Layouts store plain URL strings, so the match is exact by design — a
  // substring match would report false usage for every asset sharing a prefix.
  it.each([
    `${URL_A}/thumbnail`,
    `${URL_A}?w=100`,
    URL_A.slice(0, -1),
    `prefix${URL_A}`,
  ])("does not count the merely-similar url %j", async (stored) => {
    cmsQueryAuthed.mockResolvedValue({
      projects: [{ title: "Flats", projectPage: [stored] }],
      siteDatas: [{}],
    });

    await expect(findAssetUsage([URL_A])).resolves.toEqual({ ok: true, used: [] });
  });

  it("reports every surface that uses the asset", async () => {
    cmsQueryAuthed.mockResolvedValue({
      projects: [{ title: "Flats", projectPage: [URL_A] }],
      siteDatas: [{ about: [URL_A], home: [URL_A] }],
    });

    const result = await findAssetUsage([URL_A]);
    if (!result.ok) throw new Error("expected ok");
    expect(result.used).toEqual(["Flats", "About", "Home"]);
  });

  it("survives a CMS with no SiteData row at all", async () => {
    cmsQueryAuthed.mockResolvedValue({ projects: [], siteDatas: [] });
    await expect(findAssetUsage([URL_A])).resolves.toEqual({ ok: true, used: [] });
  });

  // A warning that crashes is worse than no warning: the delete it guards is
  // permanent, so this path must degrade to "nothing found" rather than throw.
  it.each([
    ["an absent projects key", { siteDatas: [{}] }],
    ["a null projects value", { projects: null, siteDatas: [{}] }],
    ["an empty response", {}],
    ["a null response", null],
  ])("survives %s", async (_n, payload) => {
    cmsQueryAuthed.mockResolvedValue(payload);
    await expect(findAssetUsage([URL_A])).resolves.toEqual({ ok: true, used: [] });
  });

  it("never forwards the raw CMS error", async () => {
    cmsQueryAuthed.mockRejectedValue(new Error("token scope hygraph-internal-xyz"));

    const result = await findAssetUsage([URL_A]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).not.toContain("hygraph-internal-xyz");
  });
});

// ── fetchAssets ──────────────────────────────────────────────────────────────

describe("fetchAssets", () => {
  it("hands back what the library holds", async () => {
    getAssets.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
    await expect(fetchAssets()).resolves.toEqual({ ok: true, assets: [{ id: "a1" }, { id: "a2" }] });
  });

  it("never forwards the raw CMS error", async () => {
    getAssets.mockRejectedValue(new Error("token scope hygraph-internal-xyz"));

    const result = await fetchAssets();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).not.toContain("hygraph-internal-xyz");
  });
});
