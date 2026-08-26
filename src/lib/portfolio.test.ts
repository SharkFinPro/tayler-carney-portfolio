// `orderProjects` merges the CMS project list with the editorial order/archive
// config. Two properties matter operationally: a project the config has never
// seen must still appear (it just lands at the end), and an archived project
// must be flagged so the public filters can drop it. Getting either wrong
// silently hides finished work from the portfolio.

import { describe, expect, it } from "vitest";
import {
  EMPTY_PORTFOLIO,
  orderProjects,
  sanitizePortfolio,
  slugify,
} from "./portfolio";
import { at } from "@/test/at";

const COVER = "https://media.graphassets.com/cover.jpg";
const p = (id: string) => ({ id, slug: id, title: id.toUpperCase() });

describe("sanitizePortfolio", () => {
  it("returns an empty config for anything that is not an object with entries", () => {
    for (const input of [null, undefined, 0, "", "entries", [], true, { entries: "no" }]) {
      expect(sanitizePortfolio(input)).toEqual(EMPTY_PORTFOLIO);
    }
  });

  it("never throws on hostile input", () => {
    for (const input of [NaN, Infinity, () => {}, new Date(), { entries: [null, 0, "", []] }]) {
      expect(() => sanitizePortfolio(input)).not.toThrow();
    }
  });

  it("drops entries with no id", () => {
    const out = sanitizePortfolio({
      entries: [{ id: "a" }, { archived: true }, { id: "" }, null, { id: "b" }],
    });
    expect(out.entries.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("collapses duplicate ids to the first occurrence", () => {
    const out = sanitizePortfolio({
      entries: [
        { id: "a", archived: false },
        { id: "a", archived: true },
        { id: "b" },
      ],
    });
    expect(out.entries).toHaveLength(2);
    expect(out.entries[0]).toMatchObject({ id: "a", archived: false });
  });

  it("treats archived as strictly boolean true", () => {
    const out = sanitizePortfolio({
      entries: [
        { id: "a", archived: true },
        { id: "b", archived: "true" },
        { id: "c", archived: 1 },
        { id: "d" },
      ],
    });
    expect(out.entries.map((e) => e.archived)).toEqual([true, false, false, false]);
  });

  it("keeps an absolute https cover url and its alt", () => {
    const out = sanitizePortfolio({
      entries: [{ id: "a", coverUrl: COVER, coverAlt: "  A wool coat  " }],
    });
    expect(out.entries[0]).toMatchObject({ coverUrl: COVER, coverAlt: "A wool coat" });
  });

  it("rejects cover urls that are safe as links but not loadable by next/image", () => {
    // isSafeUrl permits these; a cover image must still be absolute http(s).
    for (const coverUrl of ["/local/path.jpg", "#anchor", "mailto:a@b.com", "javascript:alert(1)"]) {
      const out = sanitizePortfolio({ entries: [{ id: "a", coverUrl }] });
      expect(at(out.entries, 0).coverUrl, coverUrl).toBeUndefined();
    }
  });

  it("omits coverAlt when it is blank rather than storing an empty string", () => {
    const out = sanitizePortfolio({ entries: [{ id: "a", coverUrl: COVER, coverAlt: "   " }] });
    expect(at(out.entries, 0).coverUrl).toBe(COVER);
    expect(at(out.entries, 0).coverAlt).toBeUndefined();
  });

  it("is idempotent", () => {
    const raw = { entries: [{ id: "a", archived: true, coverUrl: COVER, coverAlt: "x" }] };
    const once = sanitizePortfolio(raw);
    expect(sanitizePortfolio(once)).toEqual(once);
  });
});

describe("orderProjects", () => {
  it("applies the configured order", () => {
    const out = orderProjects(
      [p("a"), p("b"), p("c")],
      sanitizePortfolio({ entries: [{ id: "c" }, { id: "a" }, { id: "b" }] })
    );
    expect(out.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });

  it("appends projects the config has never seen, in CMS order, after known ones", () => {
    // The regression that matters: a newly created project must not vanish.
    const out = orderProjects(
      [p("new1"), p("known"), p("new2")],
      sanitizePortfolio({ entries: [{ id: "known" }] })
    );
    expect(out.map((x) => x.id)).toEqual(["known", "new1", "new2"]);
  });

  it("marks unknown projects as un-archived", () => {
    const out = orderProjects([p("fresh")], EMPTY_PORTFOLIO);
    expect(out).toEqual([expect.objectContaining({ id: "fresh", archived: false })]);
  });

  it("carries the archived flag through", () => {
    const out = orderProjects(
      [p("a"), p("b")],
      sanitizePortfolio({ entries: [{ id: "a", archived: true }, { id: "b" }] })
    );
    expect(out.find((x) => x.id === "a")?.archived).toBe(true);
    expect(out.find((x) => x.id === "b")?.archived).toBe(false);
  });

  it("ignores config entries for projects that no longer exist", () => {
    const out = orderProjects(
      [p("a")],
      sanitizePortfolio({ entries: [{ id: "deleted" }, { id: "a" }] })
    );
    expect(out.map((x) => x.id)).toEqual(["a"]);
  });

  it("attaches cover art only when the config supplies it", () => {
    const out = orderProjects(
      [p("a"), p("b")],
      sanitizePortfolio({ entries: [{ id: "a", coverUrl: COVER, coverAlt: "alt" }, { id: "b" }] })
    );
    expect(out[0]).toMatchObject({ coverUrl: COVER, coverAlt: "alt" });
    expect(at(out, 1).coverUrl).toBeUndefined();
  });

  it("preserves the original project fields", () => {
    const out = orderProjects([{ id: "a", slug: "coat", title: "Coat" }], EMPTY_PORTFOLIO);
    expect(out[0]).toMatchObject({ id: "a", slug: "coat", title: "Coat" });
  });

  it("handles an empty project list", () => {
    expect(orderProjects([], sanitizePortfolio({ entries: [{ id: "a" }] }))).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const projects = [p("b"), p("a")];
    const snapshot = structuredClone(projects);
    orderProjects(projects, sanitizePortfolio({ entries: [{ id: "a" }, { id: "b" }] }));
    expect(projects).toEqual(snapshot);
  });
});

describe("slugify", () => {
  it.each([
    ["Structural Wool Coat", "structural-wool-coat"],
    ["  Padded   Jacket  ", "padded-jacket"],
    ["A/W '24 — Look 3", "a-w-24-look-3"],
    ["Déjà vu", "d-j-vu"],
    ["already-a-slug", "already-a-slug"],
    ["---leading and trailing---", "leading-and-trailing"],
    ["!!!", ""],
    ["", ""],
  ])("slugify(%j) === %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("is idempotent", () => {
    const once = slugify("A/W '24 — Look 3");
    expect(slugify(once)).toBe(once);
  });

  it("never emits a leading or trailing hyphen", () => {
    for (const input of ["  x  ", "--x--", "!!x!!", "x!", "!x"]) {
      const s = slugify(input);
      expect(s.startsWith("-"), input).toBe(false);
      expect(s.endsWith("-"), input).toBe(false);
    }
  });
});
