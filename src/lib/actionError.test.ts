import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toActionError } from "./actionError";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const messageFor = (error: unknown) =>
  toActionError(error, "test", "Couldn't save that.").error;

describe("toActionError — nothing internal leaks", () => {
  // These are the shapes Hygraph actually returns. None of the identifiers in
  // them should ever reach a browser.
  const leaky = [
    `field 'projectPage' is not defined by type 'ProjectUpdateInput'`,
    `Cannot query field "atelier" on type "SiteData"`,
    `variable '$data' of type 'SiteDataUpdateInput!' used in position expecting type 'ProjectUpdateInput!'`,
    `unauthorized: token 'abc123def456' lacks scope mutation:Asset:delete`,
    `https://eu-west-2.cdn.hygraph.com/v2/ckxyz/master returned 500`,
  ];

  it.each(leaky)("redacts %#", (raw) => {
    const message = messageFor(new Error(raw));
    // Nothing verbatim from the CMS survives.
    expect(message).not.toContain(raw);
    for (const secret of [
      "projectPage",
      "SiteDataUpdateInput",
      "abc123def456",
      "hygraph.com",
      "ckxyz",
    ]) {
      expect(message).not.toContain(secret);
    }
  });

  it("still logs the full error server-side", () => {
    const error = new Error("field 'projectPage' is not defined");
    toActionError(error, "updateBlockLayout", "Couldn't save that.");
    expect(console.error).toHaveBeenCalledOnce();
    // The original object is passed through, not a stringified copy.
    expect(vi.mocked(console.error).mock.calls[0]).toContain(error);
  });

  it("tags the log line with the action context", () => {
    toActionError(new Error("boom"), "updateBlockLayout", "Couldn't save that.");
    expect(String(vi.mocked(console.error).mock.calls[0][0])).toContain(
      "[action:updateBlockLayout]"
    );
  });
});

describe("toActionError — correlation id", () => {
  it("puts a reference in the message for unrecognized errors", () => {
    expect(messageFor(new Error("something entirely novel"))).toMatch(/\(ref [0-9A-Z]{6}\)/);
  });

  it("uses the same id in the message and the log", () => {
    const message = messageFor(new Error("novel failure"));
    const id = message.match(/\(ref ([0-9A-Z]{6})\)/)?.[1];
    expect(id).toBeTruthy();
    expect(String(vi.mocked(console.error).mock.calls[0][0])).toContain(id!);
  });

  it("issues a different id per call", () => {
    const ids = new Set(
      Array.from({ length: 25 }, () => messageFor(new Error("x")).match(/ref (\w+)/)?.[1])
    );
    // Not a strict uniqueness guarantee, but collisions should be rare.
    expect(ids.size).toBeGreaterThan(20);
  });
});

describe("toActionError — actionable translations", () => {
  it.each([
    ["permission denied on model Project", /permission/i],
    ["Not authorized to perform this action", /permission/i],
    ["403 forbidden", /permission/i],
    ["429 too many requests", /rate-limiting/i],
    ["fetch failed", /Couldn't reach the CMS/i],
    ["connect ECONNREFUSED 1.2.3.4:443", /Couldn't reach the CMS/i],
    ["request timed out", /took too long/i],
    ["Document not found", /no longer exists/i],
    ["Body exceeded 1mb limit", /too large/i],
  ])("translates %j into something actionable", (raw, expected) => {
    expect(messageFor(new Error(raw))).toMatch(expected);
  });

  it("does not append a correlation id to a recognized error", () => {
    // The translated message is already actionable; a ref number would be noise.
    expect(messageFor(new Error("permission denied"))).not.toMatch(/\(ref/);
  });

  it("explains permission errors as a token-scope problem, not a bug", () => {
    // AGENTS.md is explicit that this is the most common real cause.
    const message = messageFor(new Error("unauthorized"));
    expect(message).toMatch(/scope/i);
    expect(message).toMatch(/update and publish/i);
  });
});

describe("toActionError — robustness", () => {
  it.each([
    ["a bare string", "just a string"],
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["a plain object", { message: "nope" }],
  ])("handles %s without throwing", (_label, thrown) => {
    expect(() => toActionError(thrown, "test", "Couldn't save that.")).not.toThrow();
    expect(toActionError(thrown, "test", "Couldn't save that.").ok).toBe(false);
  });

  it("always reports ok:false", () => {
    expect(toActionError(new Error("x"), "test", "f").ok).toBe(false);
  });

  it("uses the supplied fallback verb for unrecognized errors", () => {
    expect(toActionError(new Error("novel"), "test", "Couldn't delete that.").error).toContain(
      "Couldn't delete that."
    );
  });
});
