import { describe, expect, it } from "vitest";
import { isNextControlFlowError, rethrowIfControlFlow } from "./nextErrors";

/** Shape Next attaches its control-flow digests to. */
const withDigest = (digest: string) => Object.assign(new Error("control flow"), { digest });

describe("isNextControlFlowError", () => {
  it.each([
    "DYNAMIC_SERVER_USAGE",
    "NEXT_REDIRECT",
    "NEXT_NOT_FOUND",
    "NEXT_HTTP_ERROR_FALLBACK",
    "BAILOUT_TO_CLIENT_SIDE_RENDERING",
  ])("recognizes %s", (digest) => {
    expect(isNextControlFlowError(withDigest(digest))).toBe(true);
  });

  it.each([
    // redirect() appends its target after a semicolon.
    "NEXT_REDIRECT;replace;/admin/login;307;",
    // notFound() in newer Next versions.
    "NEXT_HTTP_ERROR_FALLBACK;404",
  ])("recognizes the parameterized form %s", (digest) => {
    expect(isNextControlFlowError(withDigest(digest))).toBe(true);
  });

  it("does not treat a real failure as control flow", () => {
    expect(isNextControlFlowError(new Error("fetch failed"))).toBe(false);
    expect(isNextControlFlowError(new TypeError("bad url"))).toBe(false);
  });

  it("does not match a digest that merely starts with the same letters", () => {
    // Next's own error digests are opaque hashes; one must not be mistaken for
    // a control-flow signal just because of a shared prefix.
    expect(isNextControlFlowError(withDigest("NEXT_REDIRECTION_SERVICE"))).toBe(false);
    expect(isNextControlFlowError(withDigest("DYNAMIC_SERVER_USAGE_LIKE"))).toBe(false);
  });

  it("ignores a non-string digest", () => {
    expect(isNextControlFlowError(Object.assign(new Error("x"), { digest: 42 }))).toBe(false);
    expect(isNextControlFlowError(Object.assign(new Error("x"), { digest: null }))).toBe(false);
  });

  it("handles non-object throws without breaking", () => {
    for (const thrown of [null, undefined, "a string", 42, true]) {
      expect(isNextControlFlowError(thrown)).toBe(false);
    }
  });
});

describe("rethrowIfControlFlow", () => {
  it("re-throws control-flow errors untouched", () => {
    const error = withDigest("DYNAMIC_SERVER_USAGE");
    expect(() => rethrowIfControlFlow(error)).toThrow(error);
  });

  it("returns quietly for a genuine failure the caller may handle", () => {
    expect(() => rethrowIfControlFlow(new Error("ECONNREFUSED"))).not.toThrow();
  });
});
