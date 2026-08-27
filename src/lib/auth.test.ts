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

// Only the two crypto functions are stubbed; ADMIN_COOKIE_NAME and
// SESSION_TTL_MS come through real. Hardcoding them here instead would make
// this suite self-consistent rather than correct: because auth.ts reads them
// from this module, a copy in the mock would silently become the value under
// test, and changing the real TTL would leave these assertions passing against
// a number that no longer exists anywhere else.
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./session")>()),
  signSession,
  verifySession,
}));

const { ADMIN_COOKIE_NAME, SESSION_TTL_MS } = await import("./session");
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
    expect(name).toBe(ADMIN_COOKIE_NAME);
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
    expect(cookieOptions().maxAge).toBe(SESSION_TTL_MS / 1000);
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

  // The signed expiry is the real boundary: verifySession compares it against
  // the clock, so it — not the cookie's maxAge, which is a separate line and a
  // browser-side hint — is what decides how long a stolen token stays usable.
  //
  // Frozen clock rather than `expiry > before`, which would pass for any
  // positive offset at all: real milliseconds elapse across the awaits, so
  // `Date.now() + 1`, or dropping the TTL term entirely, would satisfy it while
  // turning a seven-day session into a one-millisecond one.
  it("signs an expiry exactly one TTL ahead", async () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      await setSession();

      expect(at(signSession.mock.calls, 0)[0]).toBe(now + SESSION_TTL_MS);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("clearSession", () => {
  it("deletes the session cookie", async () => {
    await clearSession();
    expect(del).toHaveBeenCalledWith(ADMIN_COOKIE_NAME);
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
