// Portfolio ordering, project creation, and the one permanent delete in the
// app.
//
// Two properties here are load-bearing and invisible to review:
//
//   1. `updatePortfolio` must NOT publish. `portfolio` shares the SiteData
//      singleton with home, about, atelier, contact, global and seo, and
//      Hygraph publishes an *entry*, not a field — so publishing on a
//      drag-reorder would ship every other pending draft on the site. The
//      source says so at length; nothing enforced it.
//   2. `deleteProject` unpublishes before deleting, and must tolerate the
//      unpublish failing (an unpublished project is a normal case). Getting
//      that backwards means either a delete that always fails or one that
//      leaves a published ghost.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { at } from "@/test/at";

const requireAuth = vi.hoisted(() => vi.fn());
const cmsMutate = vi.hoisted(() => vi.fn());
const cmsQuery = vi.hoisted(() => vi.fn());
const auditEvent = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ requireAuth }));
vi.mock("@/lib/cms", () => ({ cmsMutate, cmsQuery }));
vi.mock("@/lib/observability", () => ({ auditEvent, reportError }));

const { createProject, deleteProject, updatePortfolio } = await import("./portfolioActions");

const DENIAL = { ok: false as const, error: "Not authorized." };

/** Every GraphQL document sent, in order, for asserting on sequence. */
const mutations = () => cmsMutate.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  requireAuth.mockReset();
  cmsMutate.mockReset();
  cmsQuery.mockReset();
  auditEvent.mockReset();
  reportError.mockReset();

  requireAuth.mockResolvedValue(null);
  cmsMutate.mockResolvedValue({ createProject: { id: "new-1", slug: "a-project" } });
  cmsQuery.mockResolvedValue({ projects: [] });
});

// ── Authorization ────────────────────────────────────────────────────────────

describe("authorization", () => {
  const actions: [name: string, call: () => Promise<unknown>][] = [
    ["updatePortfolio", () => updatePortfolio("s1", { entries: [] })],
    ["deleteProject", () => deleteProject("p1")],
    ["createProject", () => createProject({ title: "T", slug: "", description: "" })],
  ];

  it.each(actions)("%s returns the denial when not authorized", async (_n, call) => {
    requireAuth.mockResolvedValue(DENIAL);
    await expect(call()).resolves.toEqual(DENIAL);
  });

  it.each(actions)("%s touches the CMS not at all when not authorized", async (_n, call) => {
    requireAuth.mockResolvedValue(DENIAL);
    await call();
    expect(cmsMutate).not.toHaveBeenCalled();
    expect(cmsQuery).not.toHaveBeenCalled();
  });
});

// ── updatePortfolio ──────────────────────────────────────────────────────────

describe("updatePortfolio", () => {
  it("writes the sanitized config onto SiteData.portfolio", async () => {
    const result = await updatePortfolio("s1", { entries: [{ id: "a", archived: true }] });
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);

    const [, variables] = at(cmsMutate.mock.calls, 0) as [string, { id: string; data: unknown }];
    expect(variables.id).toBe("s1");
    expect(variables.data).toEqual({ portfolio: result.config });
    expect(result.config.entries).toEqual([{ id: "a", archived: true }]);
  });

  it.each([
    ["entries without an id", { entries: [{ archived: false }] }],
    ["a non-array entries value", { entries: "nope" }],
    ["a null config", null],
  ])("sanitizes away %s rather than storing it", async (_n, raw) => {
    const result = await updatePortfolio("s1", raw);
    if (!result.ok) throw new Error("expected ok");
    expect(result.config).toEqual({ entries: [] });
  });

  it("drops a duplicate id rather than storing the same project twice", async () => {
    const result = await updatePortfolio("s1", {
      entries: [{ id: "a" }, { id: "a" }, { id: "b" }],
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.config.entries.map((e) => e.id)).toEqual(["a", "b"]);
  });

  // A cover URL is rendered as an image source.
  it.each(["javascript:alert(1)", "data:text/html,<script>", "not a url", ""])(
    "refuses the unsafe coverUrl %j",
    async (coverUrl) => {
      const result = await updatePortfolio("s1", { entries: [{ id: "a", coverUrl }] });
      if (!result.ok) throw new Error("expected ok");
      expect(at(result.config.entries, 0).coverUrl).toBeUndefined();
    }
  );

  // The whole reason this action exists separately from the publish control.
  it("does NOT publish — that would ship every other pending draft on the site", async () => {
    await updatePortfolio("s1", { entries: [{ id: "a" }] });

    expect(cmsMutate).toHaveBeenCalledOnce();
    expect(mutations().join(" ")).not.toContain("publishSiteData");
    expect(mutations().join(" ")).not.toContain("publish");
  });

  it("records the write in the audit trail by field name", async () => {
    await updatePortfolio("s1", { entries: [] });
    expect(at(auditEvent.mock.calls, 0)[0]).toMatchObject({
      action: "updateDraft",
      model: "SiteData",
      entryId: "s1",
      field: "portfolio",
      outcome: "ok",
    });
  });

  it("does not claim success, or audit one, when the write failed", async () => {
    cmsMutate.mockRejectedValue(new Error("boom"));
    const result = await updatePortfolio("s1", { entries: [] });

    expect(result.ok).toBe(false);
    expect(auditEvent).not.toHaveBeenCalled();
  });
});

// ── deleteProject ────────────────────────────────────────────────────────────

describe("deleteProject", () => {
  it("refuses an empty id without touching the CMS", async () => {
    await expect(deleteProject("")).resolves.toEqual({ ok: false, error: "Missing project id." });
    expect(cmsMutate).not.toHaveBeenCalled();
  });

  it("unpublishes before deleting", async () => {
    await deleteProject("p1");

    expect(mutations()).toHaveLength(2);
    expect(at(mutations(), 0)).toContain("unpublishProject");
    expect(at(mutations(), 1)).toContain("deleteProject");
  });

  // A project that was never published is an ordinary case, not an error.
  it("still deletes when the unpublish fails", async () => {
    cmsMutate.mockRejectedValueOnce(new Error("not published")).mockResolvedValue({});

    await expect(deleteProject("p1")).resolves.toEqual({ ok: true });
    expect(at(mutations(), 1)).toContain("deleteProject");
  });

  it("reports a failed delete rather than claiming success", async () => {
    // Unpublish succeeds, delete does not.
    cmsMutate.mockResolvedValueOnce({}).mockRejectedValue(new Error("delete refused"));

    const result = await deleteProject("p1");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).not.toContain("delete refused");
    expect(auditEvent).not.toHaveBeenCalled();
  });

  // The one operation with no undo anywhere — not in the editor's stack, not
  // in the CMS. Worth being able to reconstruct after the fact.
  it("records the deletion in the audit trail", async () => {
    await deleteProject("p1");
    expect(at(auditEvent.mock.calls, 0)[0]).toMatchObject({
      action: "deleteProject",
      model: "Project",
      entryId: "p1",
      outcome: "ok",
    });
  });
});

// ── createProject ────────────────────────────────────────────────────────────

describe("createProject", () => {
  const input = (over: Partial<{ title: string; slug: string; description: string }> = {}) => ({
    title: "A Project",
    slug: "",
    description: "",
    ...over,
  });

  it.each(["", "   ", "\t"])("refuses the blank title %j", async (title) => {
    await expect(createProject(input({ title }))).resolves.toEqual({
      ok: false,
      error: "A title is required.",
    });
    expect(cmsMutate).not.toHaveBeenCalled();
  });

  // A title of only punctuation slugifies to nothing, and the project page
  // routes on slug — so there would be no URL to reach it at.
  it.each(["!!!", "---", "。。"])("refuses the unslugifiable title %j", async (title) => {
    await expect(createProject(input({ title }))).resolves.toEqual({
      ok: false,
      error: "A valid slug is required.",
    });
    expect(cmsMutate).not.toHaveBeenCalled();
  });

  it("derives the slug from the title when none is given", async () => {
    await createProject(input({ title: "  My Great Project!  " }));
    expect(at(cmsQuery.mock.calls, 0)[1]).toEqual({ slug: "my-great-project" });
  });

  it("prefers an explicit slug over the title", async () => {
    await createProject(input({ title: "My Great Project", slug: "custom-slug" }));
    expect(at(cmsQuery.mock.calls, 0)[1]).toEqual({ slug: "custom-slug" });
  });

  it("slugifies the explicit slug too", async () => {
    await createProject(input({ slug: "  Not A Slug!  " }));
    expect(at(cmsQuery.mock.calls, 0)[1]).toEqual({ slug: "not-a-slug" });
  });

  // Two projects sharing a slug would shadow each other on the route.
  it("refuses a slug that already exists, before creating anything", async () => {
    cmsQuery.mockResolvedValue({ projects: [{ id: "existing" }] });

    const result = await createProject(input({ slug: "taken" }));
    expect(result).toEqual({
      ok: false,
      error: 'A project with the slug "taken" already exists.',
    });
    expect(cmsMutate).not.toHaveBeenCalled();
  });

  it("creates, then publishes, in that order", async () => {
    await createProject(input());

    expect(mutations()).toHaveLength(2);
    expect(at(mutations(), 0)).toContain("createProject");
    expect(at(mutations(), 1)).toContain("publishProject");
  });

  it("trims what it writes", async () => {
    await createProject(input({ title: "  Spaced  ", description: "  Desc  " }));

    const [, variables] = at(cmsMutate.mock.calls, 0) as [string, { data: Record<string, string> }];
    expect(variables.data.title).toBe("Spaced");
    expect(variables.data.description).toBe("Desc");
  });

  // The content CDN lags a fresh publish, so the client appends this row
  // optimistically rather than refetching.
  it("returns the full row so the client can append it without a refetch", async () => {
    cmsMutate.mockResolvedValue({ createProject: { id: "new-1", slug: "a-project" } });

    const result = await createProject(input({ title: "A Project", description: "D" }));
    expect(result).toEqual({
      ok: true,
      project: {
        id: "new-1",
        title: "A Project",
        slug: "a-project",
        description: "D",
        archived: false,
      },
    });
  });

  it.each([
    ["no id came back", { createProject: { slug: "x" } }],
    ["no project came back", {}],
    ["a null response", null],
  ])("reports a failure when %s", async (_n, response) => {
    cmsMutate.mockResolvedValue(response);
    await expect(createProject(input())).resolves.toEqual({ ok: false, error: "Create failed." });
  });

  it("never forwards the raw CMS error", async () => {
    cmsMutate.mockRejectedValue(new Error("token scope hygraph-internal-xyz"));

    const result = await createProject(input());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).not.toContain("hygraph-internal-xyz");
  });
});
