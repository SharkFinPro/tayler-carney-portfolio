"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkAdminKey } from "@/lib/session";
import { setSession, clearSession } from "@/lib/auth";
import {
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

  const clientLimit = perClient.check(client);
  const globalLimit = global.check(GLOBAL_KEY);
  const blocked = !clientLimit.allowed ? clientLimit : !globalLimit.allowed ? globalLimit : null;

  if (blocked && !blocked.allowed) {
    // Deliberately says nothing about whether the key was right — a
    // rate-limited response must not become an oracle.
    console.warn(`[admin] rate-limited login attempt from ${client}`);
    return {
      error: `Too many attempts. Try again in ${formatRetryAfter(blocked.retryAfterMs)}.`,
    };
  }

  const key = String(formData.get("key") ?? "");

  if (!(await checkAdminKey(key))) {
    console.warn(`[admin] failed login attempt from ${client}`);
    await delay(FAILURE_DELAY_MS);
    return { error: "Incorrect key." };
  }

  // A correct key clears the budget, so a legitimate admin who fumbled their
  // password a few times is not left locked out afterwards.
  perClient.reset(client);
  console.info(`[admin] successful login from ${client}`);

  await setSession();
  redirect("/");
}

export async function logout() {
  await clearSession();
  redirect("/");
}
