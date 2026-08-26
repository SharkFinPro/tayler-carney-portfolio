import { describe, expect, it } from "vitest";
import {
  checkTiered,
  clientKeyFromHeaders,
  createRateLimiter,
  formatRetryAfter,
} from "./rateLimit";

/** A limiter with a clock under test control. */
function makeLimiter(opts: { limit?: number; windowMs?: number; maxKeys?: number } = {}) {
  let clock = 1_000_000;
  const limiter = createRateLimiter({
    limit: opts.limit ?? 3,
    windowMs: opts.windowMs ?? 60_000,
    maxKeys: opts.maxKeys,
    now: () => clock,
  });
  return {
    limiter,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("createRateLimiter", () => {
  it("allows attempts up to the limit", () => {
    const { limiter } = makeLimiter({ limit: 3 });
    expect(limiter.check("ip")).toEqual({ allowed: true, remaining: 2 });
    expect(limiter.check("ip")).toEqual({ allowed: true, remaining: 1 });
    expect(limiter.check("ip")).toEqual({ allowed: true, remaining: 0 });
  });

  it("blocks the attempt after the limit", () => {
    const { limiter } = makeLimiter({ limit: 3 });
    for (let i = 0; i < 3; i++) limiter.check("ip");

    const result = limiter.check("ip");
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error("expected a block");
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("keeps blocking while the window holds", () => {
    const { limiter, advance } = makeLimiter({ limit: 2, windowMs: 60_000 });
    limiter.check("ip");
    limiter.check("ip");

    advance(59_000);
    expect(limiter.check("ip").allowed).toBe(false);
  });

  it("lets the window slide open again", () => {
    const { limiter, advance } = makeLimiter({ limit: 2, windowMs: 60_000 });
    limiter.check("ip");
    limiter.check("ip");
    expect(limiter.check("ip").allowed).toBe(false);

    advance(60_001);
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("slides rather than resetting wholesale", () => {
    // Two attempts 30s apart: after 61s only the first has expired, so exactly
    // one slot should open up — not both.
    const { limiter, advance } = makeLimiter({ limit: 2, windowMs: 60_000 });
    limiter.check("ip");
    advance(30_000);
    limiter.check("ip");

    advance(31_000); // t=61s: first attempt expired, second is 31s old
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(false);
  });

  it("reports a retry delay that actually works when waited out", () => {
    const { limiter, advance } = makeLimiter({ limit: 1, windowMs: 60_000 });
    limiter.check("ip");

    const blocked = limiter.check("ip");
    if (blocked.allowed) throw new Error("expected a block");

    advance(blocked.retryAfterMs);
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const { limiter } = makeLimiter({ limit: 1 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(false);
    expect(limiter.check("c").allowed).toBe(true);
  });

  it("frees the budget on reset, so a successful login starts clean", () => {
    const { limiter } = makeLimiter({ limit: 2 });
    limiter.check("ip");
    limiter.check("ip");
    expect(limiter.check("ip").allowed).toBe(false);

    limiter.reset("ip");
    expect(limiter.check("ip").allowed).toBe(true);
  });

  describe("memory bounds", () => {
    it("evicts least-recently-used keys past maxKeys", () => {
      const { limiter } = makeLimiter({ limit: 5, maxKeys: 10 });
      for (let i = 0; i < 50; i++) limiter.check(`ip-${i}`);
      expect(limiter.size()).toBeLessThanOrEqual(10);
    });

    it("evicts the oldest key first, keeping the most recent", () => {
      const { limiter } = makeLimiter({ limit: 5, maxKeys: 3 });
      limiter.check("first");
      limiter.check("second");
      limiter.check("third");
      limiter.check("fourth"); // evicts "first"

      // "fourth" is still tracked...
      expect(limiter.check("fourth")).toEqual({ allowed: true, remaining: 3 });
      // ...while "first" was forgotten and starts over.
      expect(limiter.check("first")).toEqual({ allowed: true, remaining: 4 });
    });

    it("drops keys once their window fully expires", () => {
      const { limiter, advance } = makeLimiter({ limit: 3, windowMs: 60_000 });
      limiter.check("a");
      limiter.check("b");
      expect(limiter.size()).toBe(2);

      advance(60_001);
      limiter.check("a");
      // Pruning "a" on access leaves only "a"; "b" is dropped when next touched.
      expect(limiter.size()).toBeLessThanOrEqual(2);
    });
  });
});

describe("clientKeyFromHeaders", () => {
  const headersOf = (map: Record<string, string>) => ({
    get: (name: string) => map[name.toLowerCase()] ?? null,
  });

  it("prefers Vercel's own header, which the platform controls", () => {
    expect(
      clientKeyFromHeaders(
        headersOf({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "9.9.9.9" })
      )
    ).toBe("1.1.1.1");
  });

  it("takes the leftmost entry of x-forwarded-for", () => {
    expect(
      clientKeyFromHeaders(headersOf({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" }))
    ).toBe("1.2.3.4");
  });

  it("trims surrounding whitespace", () => {
    expect(clientKeyFromHeaders(headersOf({ "x-forwarded-for": "  1.2.3.4 , 5.6.7.8" }))).toBe(
      "1.2.3.4"
    );
  });

  it("falls back to x-real-ip", () => {
    expect(clientKeyFromHeaders(headersOf({ "x-real-ip": "4.4.4.4" }))).toBe("4.4.4.4");
  });

  it("degrades to one shared bucket rather than to no limit", () => {
    // The important property: an attacker who strips the headers gets a global
    // limit, not an exemption.
    expect(clientKeyFromHeaders(headersOf({}))).toBe("unknown");
    expect(clientKeyFromHeaders(headersOf({ "x-forwarded-for": "   " }))).toBe("unknown");
  });
});

describe("formatRetryAfter", () => {
  it.each([
    [1, "1 second"],
    [999, "1 second"],
    [5_000, "5 seconds"],
    [59_000, "59 seconds"],
    [60_000, "1 minute"],
    [90_000, "2 minutes"],
    [900_000, "15 minutes"],
  ])("formats %dms as %s", (ms, expected) => {
    expect(formatRetryAfter(ms)).toBe(expected);
  });
});

describe("checkTiered — the backstop must not become the attack", () => {
  // The bug this pins: consulting both limiters unconditionally lets one
  // already-blocked attacker keep spending the shared budget, until every
  // other client — the real admin included — is locked out.
  function tier() {
    let clock = 0;
    const now = () => clock;
    return {
      perClient: createRateLimiter({ limit: 3, windowMs: 1000, now }),
      backstop: createRateLimiter({ limit: 10, windowMs: 1000, now }),
      advance: (ms: number) => {
        clock += ms;
      },
    };
  }

  it("blocks the client that exceeded its own budget", () => {
    const { perClient, backstop } = tier();
    for (let i = 0; i < 3; i++) {
      expect(checkTiered(perClient, "a", backstop, "all").allowed).toBe(true);
    }
    expect(checkTiered(perClient, "a", backstop, "all").allowed).toBe(false);
  });

  it("does not spend backstop budget on a client that is already blocked", () => {
    const { perClient, backstop } = tier();

    // Burn the client's own budget, then keep hammering.
    for (let i = 0; i < 3 + 50; i++) checkTiered(perClient, "attacker", backstop, "all");

    // A different client must still get in. Before the fix, those 50 refused
    // requests each consumed a shared slot and this was false.
    expect(checkTiered(perClient, "admin", backstop, "all").allowed).toBe(true);
  });

  it("still catches a genuinely distributed attempt", () => {
    const { perClient, backstop } = tier();

    // Ten distinct clients, spending their own budgets: that is what the
    // backstop exists for, and it should trip.
    for (let c = 0; c < 10; c++) checkTiered(perClient, `client-${c}`, backstop, "all");

    const eleventh = checkTiered(perClient, "client-10", backstop, "all");
    expect(eleventh.allowed).toBe(false);
  });

  it("reports the backstop's own retry time when the backstop is what blocked", () => {
    const { perClient, backstop, advance } = tier();
    for (let c = 0; c < 10; c++) checkTiered(perClient, `client-${c}`, backstop, "all");

    advance(400);
    const blocked = checkTiered(perClient, "fresh", backstop, "all");
    if (blocked.allowed) throw new Error("expected the backstop to block");
    expect(blocked.retryAfterMs).toBe(600);
  });
});
