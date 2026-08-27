// The session cookie, and the write boundary every Server Action calls.
//
// session.ts already covers the crypto. What is untested is the cookie the
// signed token is put into — and the attributes on that cookie are the whole
// difference between a session that cannot be read by script or sent
// cross-site and one that can. None of them are visible in a passing app:
// dropping `httpOnly`, or flipping `secure` off in production, changes nothing
// an admin would notice while changing everything an attacker would.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { at } from "@/test/at";

const cookies = vi.hoisted(() => vi.fn());
const signSession = vi.hoisted(() => vi.fn());
const verifySession = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ cookies }));
vi.mock("@/lib/session", () => ({
  ADMIN_COOKIE_NAME: "admin_session",
  SESSION_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  signSession,
  verifySession,
}));

const { clearSession, isAuthed, requireAuth, setSession } = await import("./auth");

const set = vi.fn();
const del = vi.fn();
const get = vi.fn();

/** The options object `cookies().set` was called with. */
const cookieOptions = () =>
  at(set.mock.calls, 0)[2] as {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
    path?: string;
    maxAge?: number;
  };

beforeEach(() => {
  for (const m of [cookies, signSession, verifySession, set, del, get]) m.mockReset();

  cookies.mockResolvedValue({ set, delete: del, get });
  signSession.mockResolvedValue("signed-token");
  verifySession.mockResolvedValue(true);
  get.mockReturnValue({ value: "existing-token" });

  vi.stubEnv("NODE_ENV", "production");
});

describe("setSession — the cookie attributes", () => {
  it("stores the signed token under the session cookie name", async () => {
    await setSession();

    const [name, value] = at(set.mock.calls, 0);
    expect(name).toBe("admin_session");
    expect(value).toBe("signed-token");
  });

  // Script must not be able to read it: an XSS that can read the cookie is a
  // session takeover rather than a defacement.
  it("is httpOnly", async () => {
    await setSession();
    expect(cookieOptions().httpOnly).toBe(true);
  });

  // The admin surface is state-changing and CSRF has no other defence here.
  it("is sameSite strict", async () => {
    await setSession();
    expect(cookieOptions().sameSite).toBe("strict");
  });

  it("covers the whole site rather than one path", async () => {
    await setSession();
    expect(cookieOptions().path).toBe("/");
  });

  it("expires with the token rather than living forever", async () => {
    await setSession();
    expect(cookieOptions().maxAge).toBe((7 * 24 * 60 * 60 * 1000) / 1000);
  });

  // The one attribute that is deliberately conditional. Off in development so
  // http://localhost works; a regression that made it unconditional would be
  // invisible in production and break every local login.
  it("is secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await setSession();
    expect(cookieOptions().secure).toBe(true);
  });

  it.each(["development", "test"])("is not secure in %s, so localhost works", async (env) => {
    vi.stubEnv("NODE_ENV", env);
    await setSession();
    expect(cookieOptions().secure).toBe(false);
  });

  it("signs an expiry in the future", async () => {
    const before = Date.now();
    await setSession();

    const expiry = at(signSession.mock.calls, 0)[0] as number;
    expect(expiry).toBeGreaterThan(before);
  });
});

describe("clearSession", () => {
  it("deletes the session cookie", async () => {
    await clearSession();
    expect(del).toHaveBeenCalledWith("admin_session");
  });
});

describe("isAuthed", () => {
  it("verifies the token the request carried", async () => {
    get.mockReturnValue({ value: "the-token" });

    await expect(isAuthed()).resolves.toBe(true);
    expect(verifySession).toHaveBeenCalledWith("the-token");
  });

  it.each([undefined, null])("verifies undefined when there is no cookie (%j)", async (cookie) => {
    get.mockReturnValue(cookie);
    verifySession.mockResolvedValue(false);

    await expect(isAuthed()).resolves.toBe(false);
    expect(verifySession).toHaveBeenCalledWith(undefined);
  });

  it("reports what the verifier said, rather than that a cookie existed", async () => {
    get.mockReturnValue({ value: "a-forged-token" });
    verifySession.mockResolvedValue(false);

    await expect(isAuthed()).resolves.toBe(false);
  });
});

describe("requireAuth — the write boundary", () => {
  it("returns null to mean proceed", async () => {
    verifySession.mockResolvedValue(true);
    await expect(requireAuth()).resolves.toBeNull();
  });

  // The shape matters: callers do `if (denied) return denied`, so this has to
  // be both truthy and a value an action can return unchanged.
  it("returns a returnable denial when the session does not verify", async () => {
    verifySession.mockResolvedValue(false);
    await expect(requireAuth()).resolves.toEqual({ ok: false, error: "Not authorized." });
  });

  it("says nothing about why, which would be an oracle", async () => {
    verifySession.mockResolvedValue(false);

    const denied = await requireAuth();
    expect(JSON.stringify(denied)).not.toMatch(/expired|signature|token|cookie/i);
  });
});
