// Server-only cookie helpers for the admin session. Imports `next/headers`,
// so this must never be pulled into client or Edge code — keep the pure crypto
// in `session.ts` for those callers.
import "server-only";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE_NAME,
  SESSION_TTL_MS,
  signSession,
  verifySession,
} from "@/lib/session";

export async function setSession(): Promise<void> {
  const token = await signSession(Date.now() + SESSION_TTL_MS);
  (await cookies()).set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(ADMIN_COOKIE_NAME);
}

export async function isAuthed(): Promise<boolean> {
  return verifySession((await cookies()).get(ADMIN_COOKIE_NAME)?.value);
}

/**
 * The write boundary for every Server Action.
 *
 * Returns a denial to return straight to the caller, or null to proceed:
 *
 *     const denied = await requireAuth();
 *     if (denied) return denied;
 *
 * This lived as three identical private copies in contentActions,
 * mediaActions, and portfolioActions. Since it *is* the authorization check
 * for every mutation on the site, three copies was the wrong shape — a
 * hardening change would have had to land in all three, and a fourth action
 * file would likely have grown a fourth copy. One place is also where request
 * logging or a subject claim would go.
 */
export async function requireAuth(): Promise<{ ok: false; error: string } | null> {
  return (await isAuthed()) ? null : { ok: false, error: "Not authorized." };
}
