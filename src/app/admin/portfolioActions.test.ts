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
const cmsQueryAuthed = vi.hoisted(() => vi.fn());
const auditEvent = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ requireAuth }));
vi.mock("@/lib/cms", () => ({ cmsMutate, cmsQueryAuthed }));
vi.mock("@/lib/observability", () => ({ auditEvent, reportError }));

const { createProject, deleteProject, updatePortfolio } = await import("./portfolioActions");

const DENIAL = { ok: false as const, error: "Not authorized." };

/** Every GraphQL document sent, in order, for asserting on sequence. */
const mutations = () => cmsMutate.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  requireAuth.mockReset();
  cmsMutate.mockReset();
  cmsQueryAuthed.mockReset();
  auditEvent.mockReset();
  reportError.mockReset();

  requireAuth.mockResolvedValue(null);
  cmsMutate.mockResolvedValue({ createProject: { id: "new-1", slug: "a-project" } });
  cmsQueryAuthed.mockResolvedValue({ projects: [] });
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
    expect(cmsQueryAuthed).not.toHaveBeenCalled();
  });
});

// ── updatePortfolio ──────────────────────────────────────────────────────────

describe("updatePortfolio", () => {
  /** What was actually handed to the CMS, independent of what was returned. */
  const persisted = () => {
    const [, variables] = at(cmsMutate.mock.calls, 0) as [string, { id: string; data: { portfolio: unknown } }];
    return variables;
  };

  it("addresses the right entry and field", async () => {
    await updatePortfolio("s1", { entries: [{ id: "a", archived: true }] });

    expect(persisted().id).toBe("s1");
    expect(persisted().data).toEqual({ portfolio: { entries: [{ id: "a", archived: true }] } });
  });

  // These assert against the value handed to `cmsMutate`, compared with a
  // literal — deliberately NOT against the action's own return value. The
  // production code computes the sanitized config once and uses it for both,
  // so comparing the two to each other passes no matter what is persisted:
  // a regression that wrote `rawConfig` while still returning `config` would
  // be invisible. What is stored is the half that matters.
  it.each([
    ["entries without an id", { entries: [{ archived: false }] }],
    ["a non-array entries value", { entries: "nope" }],
    ["a null config", null],
    ["a string", "not a config"],
  ])("persists nothing for %s", async (_n, raw) => {
    await updatePortfolio("s1", raw);
    expect(persisted().data.portfolio).toEqual({ entries: [] });
  });

  it("persists a de-duplicated entry list", async () => {
    await updatePortfolio("s1", { entries: [{ id: "a" }, { id: "a" }, { id: "b" }] });

    expect(persisted().data.portfolio).toEqual({
      entries: [
        { id: "a", archived: false },
        { id: "b", archived: false },
      ],
    });
  });

  // A cover URL is rendered as an image source, so an unsafe one must not
  // reach storage — again asserted on what was written, not what came back.
  it.each(["javascript:alert(1)", "data:text/html,<script>", "not a url", ""])(
    "never persists the unsafe coverUrl %j",
    async (coverUrl) => {
      const result = await updatePortfolio("s1", { entries: [{ id: "a", coverUrl }] });
      if (!result.ok) throw new Error("expected ok");

      expect(persisted().data.portfolio).toEqual({ entries: [{ id: "a", archived: false }] });
      expect(at(result.config.entries, 0).coverUrl).toBeUndefined();
    }
  );

  // The same values, checked for anywhere in the written payload rather than
  // just the entry. The empty string is left out of this one on purpose: it is
  // a substring of every string, so `not.toContain("")` can never hold and the
  // case would have to be skipped — which is how it was written before, and
  // meant that row quietly asserted less than the others.
  it.each(["javascript:alert(1)", "data:text/html,<script>", "not a url"])(
    "leaves no trace of the unsafe coverUrl %j anywhere in the write",
    async (coverUrl) => {
      await updatePortfolio("s1", { entries: [{ id: "a", coverUrl }] });

      expect(JSON.stringify(persisted().data)).not.toContain(coverUrl);
    }
  );

  it("keeps a safe coverUrl, so the sanitizer is not simply dropping everything", async () => {
    await updatePortfolio("s1", {
      entries: [{ id: "a", coverUrl: "https://media.graphassets.com/x.png", coverAlt: " A hat " }],
    });

    expect(persisted().data.portfolio).toEqual({
      entries: [
        {
          id: "a",
          archived: false,
          coverUrl: "https://media.graphassets.com/x.png",
          coverAlt: "A hat",
        },
      ],
    });
  });

  // The whole reason this action exists separately from the publish control.
  it("does NOT publish — that would ship every other pending draft on the site", async () => {
    await updatePortfolio("s1", { entries: [{ id: "a" }] });

    expect(cmsMutate).toHaveBeenCalledOnce();
    // Positive as well as negative: pinning that the one mutation is the draft
    // write means the negative below cannot pass by the call disappearing.
    expect(at(mutations(), 0)).toContain("updateSiteData");
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
    expect(at(cmsQueryAuthed.mock.calls, 0)[1]).toEqual({ slug: "my-great-project" });
  });

  it("prefers an explicit slug over the title", async () => {
    await createProject(input({ title: "My Great Project", slug: "custom-slug" }));
    expect(at(cmsQueryAuthed.mock.calls, 0)[1]).toEqual({ slug: "custom-slug" });
  });

  it("slugifies the explicit slug too", async () => {
    await createProject(input({ slug: "  Not A Slug!  " }));
    expect(at(cmsQueryAuthed.mock.calls, 0)[1]).toEqual({ slug: "not-a-slug" });
  });

  // Two projects sharing a slug would shadow each other on the route.
  it("refuses a slug that already exists, before creating anything", async () => {
    cmsQueryAuthed.mockResolvedValue({ projects: [{ id: "existing" }] });

    const result = await createProject(input({ slug: "taken" }));
    expect(result).toEqual({
      ok: false,
      error: 'A project with the slug "taken" already exists.',
    });
    expect(cmsMutate).not.toHaveBeenCalled();
  });

  // The check must read the DRAFT stage through the mutation token. Reading
  // the public/PUBLISHED stage made an unpublished project's slug look free,
  // and this action creates and publishes as two separate calls — so a publish
  // that throws leaves a draft behind whose slug the next attempt would not
  // see. Asserting the stage explicitly, because a query that merely *works*
  // would still be wrong.
  it("looks for existing slugs at the DRAFT stage", async () => {
    await createProject(input({ slug: "a-project" }));

    const [query] = at(cmsQueryAuthed.mock.calls, 0) as [string];
    expect(query).toContain("stage: DRAFT");
  });

  it("refuses a slug held by a project that was never published", async () => {
    // Exactly what the old public-token read could not see.
    cmsQueryAuthed.mockResolvedValue({ projects: [{ id: "unpublished-draft" }] });

    const result = await createProject(input({ title: "A Project" }));

    expect(result).toEqual({
      ok: false,
      error: 'A project with the slug "a-project" already exists.',
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

  // The CMS is the authority on the stored slug — it may normalise or
  // de-duplicate what it was sent. Every other fixture here happens to echo
  // back exactly the locally-derived slug, which makes the two sources
  // indistinguishable; this one deliberately differs so the returned row is
  // pinned to what the CMS said rather than to what we asked for.
  it("reports the slug the CMS stored, not the one that was requested", async () => {
    cmsMutate.mockResolvedValue({ createProject: { id: "new-9", slug: "a-project-2" } });

    const result = await createProject(input({ title: "A Project" }));
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);

    expect(result.project.slug).toBe("a-project-2");
    // …while the duplicate check still used the locally-derived slug.
    expect(at(cmsQueryAuthed.mock.calls, 0)[1]).toEqual({ slug: "a-project" });
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

  // A failure during the duplicate check must abandon the create, not fall
  // through it — otherwise an unreachable CMS becomes a duplicate slug.
  it("creates nothing when the duplicate check itself fails", async () => {
    cmsQueryAuthed.mockRejectedValue(new Error("fetch failed"));

    const result = await createProject(input());
    expect(result.ok).toBe(false);
    expect(cmsMutate).not.toHaveBeenCalled();
  });
});
