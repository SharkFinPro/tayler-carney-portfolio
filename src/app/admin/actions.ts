"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkAdminKey } from "@/lib/session";
import { setSession, clearSession } from "@/lib/auth";
import {
  checkTiered,
  clientKeyFromHeaders,
  createRateLimiter,
  formatRetryAfter,
} from "@/lib/rateLimit";

// The whole security of the admin surface is one shared secret, and until now
// it could be guessed at network speed, indefinitely, leaving no trace.
//
// Two limiters, deliberately:
//   perClient — the normal case, so one attacker cannot grind away.
//   global    — a backstop for a distributed attempt, and for the "unknown"
//               bucket when no client address is available. Set generously
//               enough that real people are never caught by it.
const perClient = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });
const global = createRateLimiter({ limit: 60, windowMs: 15 * 60 * 1000 });

const GLOBAL_KEY = "__all__";

// Failed attempts are slowed down as well as counted. This costs an attacker
// far more than it costs the one person who mistypes their key.
const FAILURE_DELAY_MS = 400;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function login(_prev: { error?: string } | undefined, formData: FormData) {
  const client = clientKeyFromHeaders(await headers());

  // Tiered, not both-at-once: the backstop is only consulted for a request
  // that already passed the per-client check. See `checkTiered` for why the
  // other order hands one attacker a lockout of the real admin.
  const limit = checkTiered(perClient, client, global, GLOBAL_KEY);

  if (!limit.allowed) {
    // Deliberately says nothing about whether the key was right — a
    // rate-limited response must not become an oracle.
    console.warn(`[admin] rate-limited login attempt from ${client}`);
    return {
      error: `Too many attempts. Try again in ${formatRetryAfter(limit.retryAfterMs)}.`,
    };
  }

  const key = String(formData.get("key") ?? "");

  if (!(await checkAdminKey(key))) {
    console.warn(`[admin] failed login attempt from ${client}`);
    await delay(FAILURE_DELAY_MS);
    return { error: "Incorrect key." };
  }

  // A correct key clears this client's budget, so a legitimate admin who
  // fumbled their password a few times is not left locked out afterwards. The
  // global backstop is deliberately NOT reset: one success does not say
  // anything about attempts from other addresses, which is the only thing that
  // can fill it now that it is only consulted for requests that passed the
  // per-client check.
  perClient.reset(client);
  console.info(`[admin] successful login from ${client}`);

  await setSession();
  redirect("/");
}

export async function logout() {
  await clearSession();
  redirect("/");
}
