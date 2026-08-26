import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toActionError } from "./actionError";
import { at } from "@/test/at";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const messageFor = (error: unknown) =>
  toActionError(error, "test", "Couldn't save that.").error;

/**
 * The structured record `reportError` wrote. Errors go to the log as one JSON
 * line now, so these assertions check fields rather than a string prefix.
 */
function logged(): Record<string, unknown> {
  const calls = vi.mocked(console.error).mock.calls;
  return JSON.parse(String(at(at(calls, calls.length - 1), 0)));
}

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
    // The raw CMS text is redacted from the *response*, not from the log —
    // whoever is debugging still needs it.
    toActionError(new Error("field 'projectPage' is not defined"), "updateBlockLayout", "Couldn't save that.");
    expect(console.error).toHaveBeenCalledOnce();
    expect(logged().error).toMatchObject({
      message: "field 'projectPage' is not defined",
    });
  });

  it("tags the record with the action context and scope", () => {
    toActionError(new Error("boom"), "updateBlockLayout", "Couldn't save that.");
    expect(logged()).toMatchObject({
      scope: "server-action",
      context: "updateBlockLayout",
    });
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
    expect(String(at(at(vi.mocked(console.error).mock.calls, 0), 0))).toContain(id!);
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

describe("toActionError — partial writes", () => {
  /** Mirrors PublishFailedError from contentActions without importing a "use server" module. */
  function publishFailed() {
    const e = new Error(
      "Your change was saved as a draft, but publishing it failed, so visitors still see the previous version. Try saving again."
    );
    e.name = "PublishFailedError";
    return e;
  }

  it("passes the partial-write message through verbatim", () => {
    // update+publish are two mutations with no transaction available, so a
    // half-applied write is real. Reporting it as a flat failure would have the
    // admin believe nothing saved — and the next publish would then ship an
    // edit they thought was discarded.
    const message = messageFor(publishFailed());
    expect(message).toMatch(/saved as a draft/);
    expect(message).toMatch(/publishing it failed/);
  });

  it("does not append a correlation id to it", () => {
    expect(messageFor(publishFailed())).not.toMatch(/\(ref/);
  });

  it("does not let a generic translation swallow it", () => {
    // The word "failed" appears in the message; it must not be reinterpreted.
    expect(messageFor(publishFailed())).not.toMatch(/Couldn’t save that\.$/);
  });

  it("still logs it server-side", () => {
    toActionError(publishFailed(), "updateBlockLayout", "Couldn't save that.");
    expect(console.error).toHaveBeenCalledOnce();
  });
});
