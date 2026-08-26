// The admin bypass is the load-bearing decision here. AGENTS.md records a
// deliberate choice not to revalidate on write, because the read CDN lags a
// write and a refetch would clobber the optimistic editor UI. Caching visitor
// reads is only safe while admins keep reading fresh — otherwise an editor
// could load a stale page and save it back over a newer version.

import { beforeEach, describe, expect, it, vi } from "vitest";

const isAuthed = vi.hoisted(() => vi.fn());
const cmsQuery = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ isAuthed }));
vi.mock("@/lib/cms", () => ({ cmsQuery }));

const { CACHE_TAGS, CONTENT_TTL, cmsRead } = await import("./cachedReads");

const QUERY = "query Test { siteDatas { id } }";

beforeEach(() => {
  isAuthed.mockReset();
  cmsQuery.mockReset();
  cmsQuery.mockResolvedValue({ siteDatas: [] });
});

describe("cmsRead — visitors", () => {
  beforeEach(() => isAuthed.mockResolvedValue(false));

  it("reads through the cache with the supplied tags", async () => {
    await cmsRead(QUERY, {}, { tags: [CACHE_TAGS.siteData] });

    expect(cmsQuery).toHaveBeenCalledWith(QUERY, {}, {
      tags: ["site-data"],
      revalidate: CONTENT_TTL,
    });
  });

  it("applies the default TTL when none is given", async () => {
    await cmsRead(QUERY);
    expect(cmsQuery.mock.calls[0][2].revalidate).toBe(CONTENT_TTL);
  });

  it("honors an explicit TTL", async () => {
    await cmsRead(QUERY, {}, { revalidate: 5 });
    expect(cmsQuery.mock.calls[0][2].revalidate).toBe(5);
  });

  it("passes variables through, so per-slug entries key separately", async () => {
    await cmsRead(QUERY, { slug: "wool-coat" }, { tags: [CACHE_TAGS.project("wool-coat")] });

    expect(cmsQuery.mock.calls[0][1]).toEqual({ slug: "wool-coat" });
    expect(cmsQuery.mock.calls[0][2].tags).toEqual(["project:wool-coat"]);
  });

  it("returns the response body unchanged", async () => {
    cmsQuery.mockResolvedValue({ siteDatas: [{ id: "abc" }] });
    await expect(cmsRead(QUERY)).resolves.toEqual({ siteDatas: [{ id: "abc" }] });
  });
});

describe("cmsRead — admins", () => {
  beforeEach(() => isAuthed.mockResolvedValue(true));

  it("bypasses the cache entirely", async () => {
    await cmsRead(QUERY, {}, { tags: [CACHE_TAGS.siteData] });

    // No third argument at all, which cms.ts maps to `no-store` — the exact
    // behavior that existed before caching was introduced.
    expect(cmsQuery).toHaveBeenCalledWith(QUERY, {});
    expect(cmsQuery.mock.calls[0]).toHaveLength(2);
  });

  it("bypasses regardless of the options passed", async () => {
    await cmsRead(QUERY, { slug: "x" }, { tags: ["t"], revalidate: 3600 });
    expect(cmsQuery.mock.calls[0]).toHaveLength(2);
  });
});

describe("CACHE_TAGS", () => {
  it("namespaces per-project tags so one project's invalidation is precise", () => {
    expect(CACHE_TAGS.project("wool-coat")).toBe("project:wool-coat");
    expect(CACHE_TAGS.project("a")).not.toBe(CACHE_TAGS.project("b"));
  });

  it("keeps the collection tag distinct from any single project", () => {
    expect(CACHE_TAGS.projects).toBe("projects");
    expect(CACHE_TAGS.project("projects")).not.toBe(CACHE_TAGS.projects);
  });
});

describe("TTL", () => {
  it("is short enough that a visitor sees an edit promptly", () => {
    expect(CONTENT_TTL).toBeLessThanOrEqual(300);
    expect(CONTENT_TTL).toBeGreaterThan(0);
  });
});
