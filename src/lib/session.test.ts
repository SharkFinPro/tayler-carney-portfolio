// The admin session is the entire authorization boundary of the site: every
// Server Action gates on `isAuthed()`, which is a thin cookie wrapper around
// `verifySession`. This module is pure Web Crypto with no `next/headers`
// import, so it can be tested directly with no mocking.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_COOKIE_NAME,
  SESSION_TTL_MS,
  checkAdminKey,
  signSession,
  verifySession,
} from "./session";

const KEY = "correct-horse-battery-staple";

beforeEach(() => {
  process.env.ADMIN_KEY = KEY;
});

afterEach(() => {
  delete process.env.ADMIN_KEY;
});

describe("constants", () => {
  it("names the cookie and sets a 7-day TTL", () => {
    expect(ADMIN_COOKIE_NAME).toBe("admin_session");
    expect(SESSION_TTL_MS).toBe(1000 * 60 * 60 * 24 * 7);
  });
});

describe("checkAdminKey", () => {
  it("accepts the configured key", async () => {
    await expect(checkAdminKey(KEY)).resolves.toBe(true);
  });

  it("rejects a wrong key", async () => {
    await expect(checkAdminKey("nope")).resolves.toBe(false);
  });

  it("rejects a key that only differs in the last character", async () => {
    await expect(checkAdminKey(KEY.slice(0, -1) + "X")).resolves.toBe(false);
  });

  it("rejects an empty submission", async () => {
    await expect(checkAdminKey("")).resolves.toBe(false);
  });

  it("rejects everything when ADMIN_KEY is unset", async () => {
    delete process.env.ADMIN_KEY;
    await expect(checkAdminKey(KEY)).resolves.toBe(false);
    await expect(checkAdminKey("")).resolves.toBe(false);
  });

  it("compares equal-length digests so the key length never leaks", async () => {
    // Both a much shorter and a much longer guess must fail the same way —
    // the comparison happens on two SHA-256 hex digests, not the raw strings.
    await expect(checkAdminKey("x")).resolves.toBe(false);
    await expect(checkAdminKey(KEY + "-and-then-some-more-padding")).resolves.toBe(false);
  });
});

describe("signSession / verifySession", () => {
  it("round-trips a freshly signed token", async () => {
    const token = await signSession(Date.now() + SESSION_TTL_MS);
    await expect(verifySession(token)).resolves.toBe(true);
  });

  it("emits the documented <expiry>.<sig> shape", async () => {
    const expiry = Date.now() + SESSION_TTL_MS;
    const token = await signSession(expiry);
    const [head, sig] = token.split(".");
    expect(head).toBe(String(expiry));
    // SHA-256 hex digest.
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects an expired token", async () => {
    const token = await signSession(Date.now() - 1);
    await expect(verifySession(token)).resolves.toBe(false);
  });

  it("rejects a token whose signature was tampered with", async () => {
    const token = await signSession(Date.now() + SESSION_TTL_MS);
    const [expiry, sig] = token.split(".");
    if (!expiry || !sig) throw new Error(`Malformed session token: ${token}`);
    const flipped = sig[0] === "a" ? "b" : "a";
    await expect(verifySession(`${expiry}.${flipped}${sig.slice(1)}`)).resolves.toBe(false);
  });

  it("rejects a token whose expiry was extended without re-signing", async () => {
    // The obvious forgery: take a real token and push the expiry out.
    const token = await signSession(Date.now() + 1000);
    const sig = token.split(".")[1];
    const far = Date.now() + SESSION_TTL_MS * 52;
    await expect(verifySession(`${far}.${sig}`)).resolves.toBe(false);
  });

  it("rejects a token signed under a different ADMIN_KEY", async () => {
    const token = await signSession(Date.now() + SESSION_TTL_MS);
    process.env.ADMIN_KEY = "a-rotated-key";
    await expect(verifySession(token)).resolves.toBe(false);
  });

  it("rejects malformed input", async () => {
    await expect(verifySession(undefined)).resolves.toBe(false);
    await expect(verifySession("")).resolves.toBe(false);
    await expect(verifySession("no-dot-here")).resolves.toBe(false);
    await expect(verifySession(".")).resolves.toBe(false);
    await expect(verifySession("NaN.deadbeef")).resolves.toBe(false);
    await expect(verifySession("Infinity.deadbeef")).resolves.toBe(false);
  });

  it("rejects every token once ADMIN_KEY is unset", async () => {
    const token = await signSession(Date.now() + SESSION_TTL_MS);
    delete process.env.ADMIN_KEY;
    await expect(verifySession(token)).resolves.toBe(false);
  });
});
