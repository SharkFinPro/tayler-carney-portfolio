// Login and logout.
//
// The whole security of the admin surface is one shared secret, so this file
// is where the properties that make guessing it expensive live — and every one
// of them is invisible in a working app. A limiter that stopped limiting, a
// failure that stopped being delayed, or a rate-limited response that started
// distinguishing a wrong key from a throttled one all look exactly like a
// login form that works.
//
// `@/lib/rateLimit` is deliberately NOT mocked: the limiters *are* the property
// under test, and a stub of them would assert only that a stub was called.
//
// That makes module state the problem. Unlike the AI actions, whose budgets are
// keyed per client, this module also keeps a GLOBAL backstop under a constant
// key — so distinct client addresses do not isolate one test from another, and
// the ~50 allowed attempts this file makes would creep toward its 60-per-15-min
// budget and start failing tests for reasons that have nothing to do with what
// they assert. Each test therefore imports the module fresh, which gives it
// both limiters empty. That is also what keeps the file order-independent.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { at } from "@/test/at";

const headers = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn());
const checkAdminKey = vi.hoisted(() => vi.fn());
const setSession = vi.hoisted(() => vi.fn());
const clearSession = vi.hoisted(() => vi.fn());
const auditEvent = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ headers }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/session", () => ({ checkAdminKey }));
vi.mock("@/lib/auth", () => ({ setSession, clearSession }));
vi.mock("@/lib/observability", () => ({ auditEvent }));

/** A fresh copy of the module, with both rate limiters empty. */
async function load() {
  vi.resetModules();
  return import("./actions");
}

const form = (key: unknown) => {
  const fd = new FormData();
  if (key !== undefined) fd.set("key", key as string);
  return fd;
};

const useClient = (ip = "192.0.2.10") => {
  headers.mockResolvedValue(new Headers({ "x-forwarded-for": ip }));
};

beforeEach(() => {
  for (const m of [headers, redirect, checkAdminKey, setSession, clearSession, auditEvent]) {
    m.mockReset();
  }
  checkAdminKey.mockResolvedValue(false);
  useClient();
  vi.useFakeTimers();
});

afterEach(() => {
  // Fake timers are global to the worker, so leaving them installed would
  // reach past this file.
  vi.useRealTimers();
});

/** Run one login attempt and let the deliberate failure delay elapse. */
async function attempt(login: (p: undefined, f: FormData) => Promise<{ error?: string }>, key = "wrong") {
  const pending = login(undefined, form(key));
  await vi.advanceTimersByTimeAsync(1000);
  return pending;
}

describe("a correct key", () => {
  beforeEach(() => checkAdminKey.mockResolvedValue(true));

  it("sets the session and sends the admin on", async () => {
    const { login } = await load();
    await attempt(login, "right");

    expect(setSession).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("is not slowed down the way a failure is", async () => {
    const { login } = await load();
    // No timer advance: a success must settle on its own.
    await login(undefined, form("right"));

    expect(setSession).toHaveBeenCalledOnce();
  });

  it("records the success without recording the key", async () => {
    const { login } = await load();
    await attempt(login, "the-actual-secret");

    expect(at(auditEvent.mock.calls, 0)[0]).toMatchObject({ action: "login", outcome: "ok" });
    expect(JSON.stringify(auditEvent.mock.calls)).not.toContain("the-actual-secret");
  });
});

describe("a wrong key", () => {
  it("says only that it was incorrect", async () => {
    const { login } = await load();

    await expect(attempt(login)).resolves.toEqual({ error: "Incorrect key." });
    expect(setSession).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("treats an empty key as wrong rather than throwing", async () => {
    const { login } = await load();
    await expect(attempt(login, "")).resolves.toEqual({ error: "Incorrect key." });
  });

  // No `key` field at all — a hand-rolled POST rather than the form. The
  // action must coerce the missing value rather than hand `null` to the
  // comparison.
  it("treats an absent key field as wrong rather than throwing", async () => {
    const { login } = await load();

    // Not via `attempt`: its default parameter would substitute a key back in
    // for an explicit `undefined`, which is the opposite of what is under test.
    const pending = login(undefined, new FormData());
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toEqual({ error: "Incorrect key." });
    expect(at(checkAdminKey.mock.calls, 0)[0]).toBe("");
  });

  // A file upload posted into the key field: `FormData.get` returns a File,
  // and String()-ing it must not throw on the way to a rejection.
  it("treats a non-string key as wrong rather than throwing", async () => {
    const { login } = await load();

    const fd = new FormData();
    fd.set("key", new File(["x"], "key.txt", { type: "text/plain" }));
    const pending = login(undefined, fd);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toEqual({ error: "Incorrect key." });
  });

  // Costs an attacker far more than it costs the one person who mistypes.
  it("is delayed before it answers", async () => {
    const { login } = await load();

    let settled = false;
    const pending = login(undefined, form("wrong")).then((r) => {
      settled = true;
      return r;
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(400);
    await pending;
    expect(settled).toBe(true);
  });

  it("records the reason without recording the key", async () => {
    const { login } = await load();
    await attempt(login, "the-actual-secret");

    expect(at(auditEvent.mock.calls, 0)[0]).toMatchObject({
      action: "login",
      outcome: "failed",
      extra: { reason: "wrong-key" },
    });
    expect(JSON.stringify(auditEvent.mock.calls)).not.toContain("the-actual-secret");
  });
});

describe("the per-client budget", () => {
  it("stops answering after five attempts from one address", async () => {
    const { login } = await load();

    for (let i = 0; i < 5; i++) {
      await expect(attempt(login)).resolves.toEqual({ error: "Incorrect key." });
    }

    const sixth = await attempt(login);
    expect(sixth.error).toContain("Too many attempts");
    // The key was never even checked on the sixth.
    expect(checkAdminKey).toHaveBeenCalledTimes(5);
  });

  // A rate-limited response must not become an oracle: if throttling only
  // happened for wrong keys, being throttled would itself confirm a right one.
  it("throttles a correct key just the same, and does not log it in", async () => {
    const { login } = await load();
    for (let i = 0; i < 5; i++) await attempt(login);

    checkAdminKey.mockResolvedValue(true);
    const throttled = await attempt(login, "right");

    expect(throttled.error).toContain("Too many attempts");
    expect(setSession).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("gives the same answer whether the key was right or wrong", async () => {
    const { login } = await load();
    for (let i = 0; i < 5; i++) await attempt(login);

    checkAdminKey.mockResolvedValue(true);
    const withRight = (await attempt(login, "right")).error;
    checkAdminKey.mockResolvedValue(false);
    const withWrong = (await attempt(login, "wrong")).error;

    expect(withRight).toBe(withWrong);
  });

  it("budgets each address separately", async () => {
    const { login } = await load();

    useClient("198.51.100.1");
    for (let i = 0; i < 5; i++) await attempt(login);
    expect((await attempt(login)).error).toContain("Too many attempts");

    useClient("198.51.100.2");
    expect((await attempt(login)).error).toBe("Incorrect key.");
  });

  // So an admin who fumbled their key a few times is not left locked out.
  it("is cleared by a success", async () => {
    const { login } = await load();

    for (let i = 0; i < 4; i++) await attempt(login);

    checkAdminKey.mockResolvedValue(true);
    await attempt(login, "right");

    // Back to a full budget: five more wrong attempts are still answered.
    checkAdminKey.mockResolvedValue(false);
    for (let i = 0; i < 5; i++) {
      await expect(attempt(login)).resolves.toEqual({ error: "Incorrect key." });
    }
  });

  it("records a throttled attempt as rate-limited, not as a wrong key", async () => {
    const { login } = await load();
    for (let i = 0; i < 5; i++) await attempt(login);
    auditEvent.mockClear();

    await attempt(login);

    expect(at(auditEvent.mock.calls, 0)[0]).toMatchObject({
      action: "login",
      outcome: "failed",
      extra: { reason: "rate-limited" },
    });
  });
});

describe("the global backstop", () => {
  // Consulted only for requests that already passed the per-client check, so
  // filling it genuinely requires many distinct addresses. The other order —
  // spending the shared budget on every request — lets one attacker who has
  // burned their own budget drain the backstop in about a second and lock out
  // the real admin, turning the anti-brute-force measure into a denial of
  // service against the account it protects.
  it("is not spent by a client who has already exhausted their own budget", async () => {
    const { login } = await load();

    // One address burns its five, then keeps hammering. The hammering has to
    // exceed the backstop's own 60-per-15-minutes budget for this to prove
    // anything: at 45 total requests the reversed order still has slots left
    // and the assertion below passes either way. 5 + 70 does not.
    useClient("203.0.113.1");
    for (let i = 0; i < 5; i++) await attempt(login);
    for (let i = 0; i < 70; i++) await attempt(login);

    // A different address is still served, which it would not be if those 70
    // already-blocked requests had each cost a slot in the shared budget.
    useClient("203.0.113.2");
    expect((await attempt(login)).error).toBe("Incorrect key.");
  });
});

describe("logout", () => {
  it("clears the session and sends the visitor home", async () => {
    const { logout } = await load();
    await logout();

    expect(clearSession).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
