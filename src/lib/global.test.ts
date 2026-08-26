// `sanitizeGlobal` guards the site identity singleton. It runs on both render
// and save, so DEFAULT_GLOBAL must survive a null CMS field and the admin form
// must never be able to store a shape the renderer can't handle.

import { describe, expect, it } from "vitest";
import { DEFAULT_GLOBAL, sanitizeGlobal } from "./global";

describe("sanitizeGlobal", () => {
  it("returns the defaults for an empty or absent value", () => {
    for (const input of [null, undefined, {}]) {
      expect(sanitizeGlobal(input)).toEqual(DEFAULT_GLOBAL);
    }
  });

  it("never throws on hostile input", () => {
    for (const input of [0, "", "text", true, [], NaN, () => {}, new Date()]) {
      expect(() => sanitizeGlobal(input)).not.toThrow();
    }
  });

  it("always returns every key, whatever the input", () => {
    const keys = Object.keys(DEFAULT_GLOBAL).sort();
    for (const input of [null, {}, { displayName: "x" }, "nonsense"]) {
      expect(Object.keys(sanitizeGlobal(input)).sort()).toEqual(keys);
    }
  });

  it("keeps supplied strings and trims them", () => {
    const out = sanitizeGlobal({
      displayName: "  Tayler Carney  ",
      focus: "  Structural Fashion Design ",
      email: " hello@example.com ",
    });
    expect(out.displayName).toBe("Tayler Carney");
    expect(out.focus).toBe("Structural Fashion Design");
    expect(out.email).toBe("hello@example.com");
  });

  it("falls back to the default when a value is the wrong type", () => {
    const out = sanitizeGlobal({ displayName: 42, focus: null, email: {} });
    expect(out.displayName).toBe(DEFAULT_GLOBAL.displayName);
    expect(out.focus).toBe(DEFAULT_GLOBAL.focus);
    expect(out.email).toBe(DEFAULT_GLOBAL.email);
  });

  it("preserves a deliberately cleared string rather than resurrecting the default", () => {
    // An admin emptying the email field must actually empty it.
    expect(sanitizeGlobal({ email: "" }).email).toBe("");
    expect(sanitizeGlobal({ email: "   " }).email).toBe("");
  });

  describe("resumeAssetId", () => {
    it("accepts an opaque alphanumeric Hygraph id", () => {
      expect(sanitizeGlobal({ resumeAssetId: "cm3x9k2p0000108l4abcd1234" }).resumeAssetId).toBe(
        "cm3x9k2p0000108l4abcd1234"
      );
    });

    it("trims surrounding whitespace", () => {
      expect(sanitizeGlobal({ resumeAssetId: "  abc123  " }).resumeAssetId).toBe("abc123");
    });

    it("rejects anything that is not a bare alphanumeric token", () => {
      // The id is interpolated into a GraphQL variable, and a URL here would
      // mean someone pasted a link instead of picking from the Media Library.
      for (const bad of [
        "https://media.graphassets.com/abc",
        "abc-123",
        "abc_123",
        "abc 123",
        "../../etc/passwd",
        '" }) { id } }',
        42,
        null,
        {},
      ]) {
        expect(sanitizeGlobal({ resumeAssetId: bad }).resumeAssetId, String(bad)).toBe("");
      }
    });
  });

  it("is idempotent", () => {
    const once = sanitizeGlobal({
      displayName: " Name ",
      email: "a@b.com",
      linkedInHandle: "someone",
      resumeAssetId: "abc123",
    });
    expect(sanitizeGlobal(once)).toEqual(once);
  });
});
