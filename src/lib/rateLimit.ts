// In-memory sliding-window rate limiter.
//
// Scope, stated honestly: this is per-instance memory. On Vercel, concurrent
// serverless instances each hold their own window, and an instance recycling
// resets it — so a determined attacker distributed across instances gets more
// attempts than the nominal limit. It is not a substitute for a shared store
// (Upstash/Vercel KV) if this ever needs to be airtight.
//
// It is still worth having by a wide margin: the threat it addresses is an
// unthrottled loop against a single secret, and turning "unlimited guesses per
// second" into "a handful per window per instance" removes the automated attack
// entirely. Adding a shared store is a drop-in replacement for `check()`.
//
// Pure and clock-injectable so the behavior is testable without waiting.

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number };

export type RateLimiterOptions = {
  /** Attempts permitted inside the window. */
  limit: number;
  /** Sliding window length, in milliseconds. */
  windowMs: number;
  /**
   * Maximum distinct keys tracked. Prevents an attacker rotating source
   * addresses from growing the map without bound; the oldest key is evicted
   * first. Eviction can only ever *forgive* an attacker, never lock out a
   * legitimate user.
   */
  maxKeys?: number;
  /** Injectable clock, for tests. */
  now?: () => number;
};

export type RateLimiter = {
  /** Record an attempt for `key` and report whether it is permitted. */
  check: (key: string) => RateLimitResult;
  /** Forget a key — call after a success so a good login resets the budget. */
  reset: (key: string) => void;
  /** Number of keys currently tracked. Exposed for tests. */
  size: () => number;
};

const DEFAULT_MAX_KEYS = 5_000;

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = DEFAULT_MAX_KEYS,
  now = Date.now,
}: RateLimiterOptions): RateLimiter {
  // key -> timestamps of attempts still inside the window, oldest first.
  // A Map preserves insertion order, which gives eviction its ordering.
  const hits = new Map<string, number[]>();

  function prune(key: string, at: number): number[] {
    const cutoff = at - windowMs;
    const kept = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length > 0) {
      // Re-insert so this key becomes the most recently used.
      hits.delete(key);
      hits.set(key, kept);
    } else {
      hits.delete(key);
    }
    return kept;
  }

  return {
    check(key) {
      const at = now();
      const recent = prune(key, at);

      if (recent.length >= limit) {
        // Room frees up when the oldest attempt in the window expires.
        const retryAfterMs = Math.max(1, recent[0] + windowMs - at);
        return { allowed: false, retryAfterMs };
      }

      recent.push(at);
      hits.set(key, recent);

      // Evict least-recently-used keys once over budget.
      while (hits.size > maxKeys) {
        const oldest = hits.keys().next();
        if (oldest.done) break;
        hits.delete(oldest.value);
      }

      return { allowed: true, remaining: limit - recent.length };
    },

    reset(key) {
      hits.delete(key);
    },

    size() {
      return hits.size;
    },
  };
}

/**
 * Best-effort client address from proxy headers.
 *
 * `x-forwarded-for` is client-controlled in general, but on Vercel the platform
 * overwrites it at the edge, so the leftmost entry is trustworthy there. Falls
 * back to a single shared bucket when no address is available — which degrades
 * to a global limit rather than to no limit at all.
 */
export function clientKeyFromHeaders(headers: {
  get: (name: string) => string | null;
}): string {
  const candidates = [
    headers.get("x-vercel-forwarded-for"),
    headers.get("x-forwarded-for")?.split(",")[0],
    headers.get("x-real-ip"),
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }

  return "unknown";
}

/** Human-readable "try again in …" for a retry delay. */
export function formatRetryAfter(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
