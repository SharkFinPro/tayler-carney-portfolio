// The content write boundary: authorization, the two field whitelists, and the
// promise that nothing reaches the CMS unsanitized.
//
// AGENTS.md calls out that middleware does not protect /admin — every Server
// Action re-verifies for itself — which makes "does this action actually check"
// a property worth asserting rather than reading. The whitelists matter for the
// same reason twice over: `model` is interpolated directly into the mutation
// string, so the check is the only thing standing between a caller-supplied
// string and a GraphQL document.
//
// Only three modules are mocked — auth, cms, observability — because everything
// else in the file is pure. In particular `actionError` is NOT mocked: whether
// a raw Hygraph message reaches the browser is exactly what these tests are
// for, so the real translation table has to run.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { at } from "@/test/at";

const requireAuth = vi.hoisted(() => vi.fn());
const cmsMutate = vi.hoisted(() => vi.fn());
const cmsQueryAuthed = vi.hoisted(() => vi.fn());
const auditEvent = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ requireAuth }));
vi.mock("@/lib/cms", () => ({ cmsMutate, cmsQueryAuthed }));
vi.mock("@/lib/observability", () => ({ auditEvent, reportError }));

const {
  getPublishState,
  publishContent,
  updateBlockLayout,
  updateContentField,
  updateGlobal,
  updateHome,
  updateSeo,
} = await import("./contentActions");

const DENIAL = { ok: false as const, error: "Not authorized." };

/** The `data` argument of the first mutation — what actually got written. */
const writtenData = () => at(cmsMutate.mock.calls, 0)[1] as { data: Record<string, unknown> };

/** The GraphQL document of the first mutation, for the interpolation checks. */
const writtenQuery = () => at(cmsMutate.mock.calls, 0)[0] as string;

beforeEach(() => {
  requireAuth.mockReset();
  cmsMutate.mockReset();
  cmsQueryAuthed.mockReset();
  auditEvent.mockReset();
  reportError.mockReset();

  // Authorized by default; the denial suite opts out.
  requireAuth.mockResolvedValue(null);
  cmsMutate.mockResolvedValue({});
  cmsQueryAuthed.mockResolvedValue({ entry: { updatedAt: "2026-01-02T00:00:00Z", documentInStages: [] } });
});

// ── Authorization ────────────────────────────────────────────────────────────

describe("authorization", () => {
  // Every exported action, so a new one cannot be added without either
  // checking auth or failing here.
  const actions: [name: string, call: () => Promise<unknown>][] = [
    ["updateContentField", () => updateContentField("Project", "p1", "title", "x")],
    ["updateGlobal", () => updateGlobal("s1", { displayName: "x" })],
    ["updateSeo", () => updateSeo("s1", { title: "x" })],
    ["updateHome", () => updateHome("s1", { heroTitle: "x" })],
    ["updateBlockLayout", () => updateBlockLayout("Project", "p1", "projectPage", [])],
    ["getPublishState", () => getPublishState("Project", "p1")],
    ["publishContent", () => publishContent("Project", "p1")],
  ];

  it.each(actions)("%s returns the denial when not authorized", async (_name, call) => {
    requireAuth.mockResolvedValue(DENIAL);
    await expect(call()).resolves.toEqual(DENIAL);
  });

  it.each(actions)("%s touches the CMS not at all when not authorized", async (_name, call) => {
    requireAuth.mockResolvedValue(DENIAL);
    await call();
    expect(cmsMutate).not.toHaveBeenCalled();
    expect(cmsQueryAuthed).not.toHaveBeenCalled();
  });
});

// ── The inline-field whitelist ───────────────────────────────────────────────

describe("updateContentField — the editable-field whitelist", () => {
  it.each(["title", "description"])("writes the whitelisted field %j", async (field) => {
    await expect(updateContentField("Project", "p1", field, "value")).resolves.toEqual({ ok: true });
    expect(writtenData().data).toEqual({ [field]: "value" });
  });

  it.each([
    // Fields that exist on the model but are deliberately not inline-editable.
    "slug",
    "projectPage",
    // A relation, which AGENTS.md notes is never inline-editable.
    "coverImage",
    // Nonsense.
    "__proto__",
    "",
  ])("refuses the non-whitelisted field %j without touching the CMS", async (field) => {
    await expect(updateContentField("Project", "p1", field, "value")).resolves.toEqual({
      ok: false,
      error: `Field "${field}" is not editable.`,
    });
    expect(cmsMutate).not.toHaveBeenCalled();
  });

  it.each(["SiteData", "Asset", "User", "Project ", "project"])(
    "refuses the unlisted model %j — the model is interpolated into the mutation",
    async (model) => {
      const result = await updateContentField(model, "id", "title", "value");
      expect(result).toEqual({ ok: false, error: 'Field "title" is not editable.' });
      expect(cmsMutate).not.toHaveBeenCalled();
    }
  );

  it("never lets a rejected model reach the GraphQL document", async () => {
    await updateContentField("Project { id } evil", "id", "title", "v");
    expect(cmsMutate).not.toHaveBeenCalled();
  });

  it("interpolates only the whitelisted model on the accepted path", async () => {
    await updateContentField("Project", "p1", "title", "v");
    expect(writtenQuery()).toContain("ProjectUpdateInput");
    expect(writtenQuery()).toContain("updateProject");
  });

  it("accepts a string list, which the nav-style fields use", async () => {
    await expect(updateContentField("Project", "p1", "title", ["a", "b"])).resolves.toEqual({ ok: true });
    expect(writtenData().data).toEqual({ title: ["a", "b"] });
  });
});

// ── The block-layout whitelist ───────────────────────────────────────────────

describe("updateBlockLayout — the layout-field whitelist", () => {
  it("writes Project.projectPage", async () => {
    const result = await updateBlockLayout("Project", "p1", "projectPage", []);
    expect(result).toEqual({ ok: true, blocks: [] });
    expect(writtenData().data).toEqual({ projectPage: [] });
  });

  it.each(["atelier", "about", "contact"])("writes SiteData.%s", async (field) => {
    await expect(updateBlockLayout("SiteData", "s1", field, [])).resolves.toEqual({ ok: true, blocks: [] });
    expect(writtenData().data).toEqual({ [field]: [] });
  });

  // The whitelist is per-model, not a flat set. A SiteData field addressed on
  // Project would otherwise build a mutation for a field that model lacks.
  it.each(["atelier", "about", "contact"])(
    "refuses SiteData's %j when addressed on Project",
    async (field) => {
      await expect(updateBlockLayout("Project", "p1", field, [])).resolves.toEqual({
        ok: false,
        error: `Field "${field}" is not editable.`,
      });
      expect(cmsMutate).not.toHaveBeenCalled();
    }
  );

  it("refuses Project's projectPage when addressed on SiteData", async () => {
    await expect(updateBlockLayout("SiteData", "s1", "projectPage", [])).resolves.toEqual({
      ok: false,
      error: 'Field "projectPage" is not editable.',
    });
    expect(cmsMutate).not.toHaveBeenCalled();
  });

  it.each(["Asset", "", "SiteDatas"])("refuses the unlisted model %j", async (model) => {
    await expect(updateBlockLayout(model, "id", "about", [])).resolves.toEqual({
      ok: false,
      error: 'Field "about" is not editable.',
    });
    expect(cmsMutate).not.toHaveBeenCalled();
  });
});

// ── Sanitize-before-write ────────────────────────────────────────────────────

describe("nothing reaches the CMS unsanitized", () => {
  it("drops unknown block types rather than storing them", async () => {
    const hostile = [
      { id: "a", type: "richText", content: { children: [] } },
      { id: "b", type: "<script>alert(1)</script>" },
      { id: "c", type: "definitelyNotABlock", heading: "x" },
    ];

    const result = await updateBlockLayout("Project", "p1", "projectPage", hostile);
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);

    const stored = writtenData().data.projectPage as unknown[];
    // Whatever survived, none of it is the garbage that went in.
    expect(stored).toEqual(result.blocks);
    for (const block of stored as { type: string }[]) {
      expect(["<script>alert(1)</script>", "definitelyNotABlock"]).not.toContain(block.type);
    }
  });

  it.each([null, undefined, "a string", 42, { not: "an array" }])(
    "turns the non-array layout %j into an empty array",
    async (raw) => {
      const result = await updateBlockLayout("Project", "p1", "projectPage", raw);
      expect(result).toEqual({ ok: true, blocks: [] });
      expect(writtenData().data).toEqual({ projectPage: [] });
    }
  );

  it("writes the sanitized global, not the raw input", async () => {
    const result = await updateGlobal("s1", { displayName: "  Spaced  ", bogusKey: "dropped" });
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);

    expect(result.global.displayName).toBe("Spaced");
    expect(writtenData().data.global).toEqual(result.global);
    expect(writtenData().data.global).not.toHaveProperty("bogusKey");
  });

  it.each([
    ["updateGlobal", updateGlobal, "global"],
    ["updateSeo", updateSeo, "seo"],
    ["updateHome", updateHome, "home"],
  ] as const)("%s survives a hostile payload and still writes an object", async (_n, action, field) => {
    const result = await action("s1", { __proto__: { polluted: true }, nested: { deep: [1, 2] } });
    expect(result.ok).toBe(true);
    expect(writtenData().data[field]).toBeTypeOf("object");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

// ── Publishing ───────────────────────────────────────────────────────────────

describe("the publishable-model whitelist", () => {
  it.each(["Asset", "asset", "", "SiteDataa"])("getPublishState refuses %j", async (model) => {
    await expect(getPublishState(model, "id")).resolves.toEqual({
      ok: false,
      error: `"${model}" is not publishable.`,
    });
    expect(cmsQueryAuthed).not.toHaveBeenCalled();
  });

  it.each(["Asset", "asset", ""])("publishContent refuses %j", async (model) => {
    await expect(publishContent(model, "id")).resolves.toEqual({
      ok: false,
      error: `"${model}" is not publishable.`,
    });
    expect(cmsMutate).not.toHaveBeenCalled();
  });
});

describe("getPublishState", () => {
  it("reports a never-published entry as pending", async () => {
    cmsQueryAuthed.mockResolvedValue({ entry: { updatedAt: "2026-01-02T00:00:00Z", documentInStages: [] } });
    await expect(getPublishState("Project", "p1")).resolves.toEqual({
      ok: true,
      state: { pending: true, publishedAt: null },
    });
  });

  it("reports a draft newer than the published copy as pending", async () => {
    cmsQueryAuthed.mockResolvedValue({
      entry: {
        updatedAt: "2026-02-02T00:00:00Z",
        documentInStages: [{ updatedAt: "2026-01-01T00:00:00Z" }],
      },
    });
    const result = await getPublishState("Project", "p1");
    expect(result).toEqual({ ok: true, state: { pending: true, publishedAt: "2026-01-01T00:00:00Z" } });
  });

  it("reports an entry published since its last edit as not pending", async () => {
    cmsQueryAuthed.mockResolvedValue({
      entry: {
        updatedAt: "2026-01-01T00:00:00Z",
        documentInStages: [{ updatedAt: "2026-02-02T00:00:00Z" }],
      },
    });
    const result = await getPublishState("Project", "p1");
    expect(result).toEqual({ ok: true, state: { pending: false, publishedAt: "2026-02-02T00:00:00Z" } });
  });

  // An entry Hygraph returns without an `updatedAt`. Treating the missing
  // timestamp as "no pending draft" is the safe direction: the alternative
  // offers a publish button for changes that may not exist.
  it("treats a missing draft timestamp as nothing pending", async () => {
    cmsQueryAuthed.mockResolvedValue({
      entry: { documentInStages: [{ updatedAt: "2026-02-02T00:00:00Z" }] },
    });
    await expect(getPublishState("Project", "p1")).resolves.toEqual({
      ok: true,
      state: { pending: false, publishedAt: "2026-02-02T00:00:00Z" },
    });
  });

  it("reports a vanished entry rather than throwing", async () => {
    cmsQueryAuthed.mockResolvedValue({ entry: null });
    await expect(getPublishState("Project", "p1")).resolves.toEqual({
      ok: false,
      error: "That entry no longer exists.",
    });
  });

  it("lowercases only the first letter to build the query field", async () => {
    await getPublishState("SiteData", "s1");
    expect(at(cmsQueryAuthed.mock.calls, 0)[0]).toContain("siteData(where:");
  });
});

describe("publishContent", () => {
  it("reports the state the CMS actually holds rather than assuming success", async () => {
    cmsQueryAuthed.mockResolvedValue({
      entry: { updatedAt: "2026-01-01T00:00:00Z", documentInStages: [{ updatedAt: "2026-02-02T00:00:00Z" }] },
    });
    const result = await publishContent("Project", "p1");
    expect(result).toEqual({ ok: true, state: { pending: false, publishedAt: "2026-02-02T00:00:00Z" } });
  });

  it("says the draft was saved when publishing is what failed", async () => {
    cmsMutate.mockRejectedValue(new Error("publish exploded"));
    const result = await publishContent("Project", "p1");
    if (result.ok) throw new Error("expected a failure");

    // The distinction that matters: not "nothing was saved", which would lead
    // the admin to believe their edit was discarded.
    expect(result.error).toContain("saved as a draft");
    expect(result.error).toContain("publishing it failed");
    expect(result.error).not.toContain("publish exploded");
  });
});

// ── Error translation ────────────────────────────────────────────────────────

describe("CMS errors never reach the browser verbatim", () => {
  it("translates a Hygraph permission failure into something actionable", async () => {
    cmsMutate.mockRejectedValue(
      new Error("field 'projectPage' is not defined: permission denied on model Project")
    );
    const result = await updateBlockLayout("Project", "p1", "projectPage", []);
    if (result.ok) throw new Error("expected a failure");

    expect(result.error).toContain("permission");
    expect(result.error).not.toContain("projectPage");
    expect(result.error).not.toContain("model Project");
  });

  it("falls back to a generic message plus a correlation id", async () => {
    cmsMutate.mockRejectedValue(new Error("Внутренняя ошибка: token scope xyz-secret"));
    const result = await updateGlobal("s1", {});
    if (result.ok) throw new Error("expected a failure");

    expect(result.error).not.toContain("xyz-secret");
    expect(result.error).toMatch(/\(ref [0-9A-Z]{6}\)$/);
  });

  // Every write path, so a new action cannot quietly forward a raw CMS string.
  // The secret below is the shape that actually leaks in practice: Hygraph
  // names token scopes and internal field paths in its error text.
  const SECRET = "token scope hygraph-internal-xyz";

  it.each([
    ["updateContentField", () => updateContentField("Project", "p1", "title", "v")],
    ["updateGlobal", () => updateGlobal("s1", {})],
    ["updateSeo", () => updateSeo("s1", {})],
    ["updateHome", () => updateHome("s1", {})],
    ["updateBlockLayout", () => updateBlockLayout("Project", "p1", "projectPage", [])],
  ])("%s swallows the raw CMS text", async (_name, call) => {
    cmsMutate.mockRejectedValue(new Error(SECRET));
    const result = (await call()) as { ok: boolean; error?: string };

    expect(result.ok).toBe(false);
    expect(result.error).not.toContain(SECRET);
    expect(result.error).not.toContain("hygraph-internal-xyz");
  });

  it("getPublishState swallows the raw CMS text too", async () => {
    cmsQueryAuthed.mockRejectedValue(new Error(SECRET));
    const result = await getPublishState("Project", "p1");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).not.toContain("hygraph-internal-xyz");
    expect(result.error).toMatch(/\(ref [0-9A-Z]{6}\)$/);
  });

  it("logs the full detail server-side under the id it showed the admin", async () => {
    cmsMutate.mockRejectedValue(new Error("token scope xyz-secret"));
    const result = await updateGlobal("s1", {});
    if (result.ok) throw new Error("expected a failure");

    const shownId = /\(ref ([0-9A-Z]{6})\)$/.exec(result.error)?.[1];
    const logged = at(reportError.mock.calls, 0)[0] as { correlationId: string; scope: string };
    expect(logged.correlationId).toBe(shownId);
    expect(logged.scope).toBe("server-action");
  });
});

// ── Audit trail ──────────────────────────────────────────────────────────────

describe("the audit trail records field names, never values", () => {
  it("records a successful draft write", async () => {
    await updateContentField("Project", "p1", "title", "Some Secret Title");

    const event = at(auditEvent.mock.calls, 0)[0] as Record<string, unknown>;
    expect(event).toMatchObject({
      action: "updateDraft",
      model: "Project",
      entryId: "p1",
      field: "title",
      outcome: "ok",
    });
  });

  it("never puts the written value in the audit record", async () => {
    const secret = "the-content-body-nobody-should-log";
    await updateGlobal("s1", { displayName: secret });

    const serialized = JSON.stringify(auditEvent.mock.calls);
    expect(serialized).not.toContain(secret);
  });

  it("records a failed write as failed", async () => {
    cmsMutate.mockRejectedValue(new Error("nope"));
    await updateContentField("Project", "p1", "title", "x");

    expect(at(auditEvent.mock.calls, 0)[0]).toMatchObject({ action: "updateDraft", outcome: "failed" });
  });

  it("records a failed publish as failed, before the error is translated", async () => {
    cmsMutate.mockRejectedValue(new Error("nope"));
    await publishContent("Project", "p1");

    expect(at(auditEvent.mock.calls, 0)[0]).toMatchObject({ action: "publish", outcome: "failed" });
  });
});
