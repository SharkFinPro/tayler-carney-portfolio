// Edge-safe, dependency-free admin session crypto.
// HMAC-signed "<expiryMs>.<sig>" token. No Node `crypto` or `next/headers`
// imports, so this module also works in Edge middleware. Constant-time
// compares avoid timing leaks.

export const ADMIN_COOKIE_NAME = "admin_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

async function hmac(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function checkAdminKey(submitted: string): Promise<boolean> {
  const expected = process.env.ADMIN_KEY;
  if (!expected || !submitted) return false;
  // Compare equal-length HMACs so the comparison never leaks the key length.
  const [a, b] = await Promise.all([hmac(submitted, expected), hmac(expected, expected)]);
  return timingSafeEqual(a, b);
}

export async function signSession(expiry: number): Promise<string> {
  return `${expiry}.${await hmac(String(expiry), process.env.ADMIN_KEY || "")}`;
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token || !process.env.ADMIN_KEY) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const expiry = Number(token.slice(0, dot));
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  return timingSafeEqual(token.slice(dot + 1), await hmac(String(expiry), process.env.ADMIN_KEY));
}
