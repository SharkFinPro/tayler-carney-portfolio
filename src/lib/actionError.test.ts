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

describe("toActionError — an AI provider refusing on billing", () => {
  // The verbatim body Anthropic returned when this actually happened. The
  // generic fallback fired instead, and finding the cause meant reading a
  // server log — which is the whole reason this case exists.
  const REAL = `400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CeSJETT4L6tiLJjyzWX2M"}`;

  it("says the account is out of credit, not something generic", () => {
    const message = messageFor(new Error(REAL));
    expect(message).toMatch(/out of credit|billing/i);
    // And says where the problem is not, since every other translated message
    // in this table blames the CMS.
    expect(message).toMatch(/CMS itself is fine/);
  });

  it("does not fall through to the reference-id fallback", () => {
    expect(messageFor(new Error(REAL))).not.toMatch(/\(ref [0-9A-Z]{6}\)/);
  });

  it.each([
    "Your credit balance is too low",
    "insufficient_quota",
    "insufficient quota",
    "Payment Required",
    "Request failed with status 402",
    "billing account not configured",
  ])("recognizes %j", (text) => {
    expect(messageFor(new Error(text))).toMatch(/out of credit|billing/i);
  });

  it("still lets a real permission error win", () => {
    // A token-scope failure is the far more common cause in this app, and it
    // must not be re-labelled as a billing problem.
    const message = messageFor(new Error("permission denied for this model"));
    expect(message).toMatch(/permission/i);
    expect(message).not.toMatch(/out of credit/i);
  });

  it("does not fire on an unrelated number that happens to contain 402", () => {
    const message = messageFor(new Error("entry cmb402xyz could not be updated"));
    expect(message).not.toMatch(/out of credit/i);
  });
});

describe("toActionError — a busy model", () => {
  // Verbatim from the free tier, hit repeatedly while this was being built.
  const BUSY = `{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}`;

  it("says the model is busy and that it usually clears", () => {
    const message = messageFor(new Error(BUSY));
    expect(message).toMatch(/busy/i);
    expect(message).not.toMatch(/\(ref [0-9A-Z]{6}\)/);
  });

  it("is not confused with a spent quota", () => {
    // 429 means the admin has used their allowance; 503 means they are
    // queueing for capacity. Retrying helps with one and not the other, so
    // the two must not read the same.
    const busy = messageFor(new Error(BUSY));
    const quota = messageFor(new Error("429 too many requests"));
    expect(busy).not.toBe(quota);
    expect(quota).toMatch(/rate-limiting/i);
  });

  it("does not fire on an id that happens to contain 503", () => {
    expect(messageFor(new Error("entry cm503abc could not be updated"))).not.toMatch(/busy/i);
  });
});
