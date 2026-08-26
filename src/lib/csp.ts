// Content Security Policy.
//
// The policy is built here, as a pure function of a per-request nonce, rather
// than as a literal in next.config.ts. Two reasons:
//
//   1. A nonce is only meaningful if it is different on every response, which
//      means the policy has to be assembled per request — in middleware, not at
//      build time.
//   2. It is the one security control in this codebase whose failure mode is
//      silent. A policy that accidentally allows `'unsafe-inline'` looks
//      identical to one that doesn't until someone lands an XSS. Building it
//      here makes it a plain module with a test suite, like the sanitizers.
//
// What the nonce buys: without it, `script-src` needs `'unsafe-inline'` to let
// Next's own hydration scripts run — and `'unsafe-inline'` cannot distinguish
// Next's inline script from an injected one, so the whole directive stops
// defending against the attack it exists for.

/** Bytes of entropy per nonce. The CSP spec asks for at least 128 bits. */
const NONCE_BYTES = 16;

/**
 * A fresh base64 nonce.
 *
 * Web Crypto only — this runs in middleware, on the Edge runtime, where
 * `node:crypto` and `Buffer` are not a safe assumption. (Same constraint that
 * keeps `session.ts` free of Node built-ins.)
 */
export function createNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The full policy for one response.
 *
 * `dev` relaxes exactly two things, both of which are Next's development
 * machinery rather than anything this app does:
 *   - `'unsafe-eval'`, which React Refresh and the dev bundler need.
 *   - `ws:` in `connect-src`, for the HMR socket.
 */
export function contentSecurityPolicy(nonce: string, { dev = false } = {}): string {
  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    // Scripts loaded by an already-trusted script inherit trust, which is what
    // lets Next's nonce'd bootstrap pull in its own chunks. In a browser that
    // understands it, this also makes the host allowlist below dead weight —
    // it stays for older browsers, which ignore 'strict-dynamic' instead.
    "'strict-dynamic'",
    "https://va.vercel-scripts.com",
    ...(dev ? ["'unsafe-eval'"] : []),
  ].join(" ");

  const connect = [
    "'self'",
    "https://vitals.vercel-insights.com",
    "https://*.graphassets.com",
    ...(dev ? ["ws:"] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    // data: covers the crop preview in MediaUploader, which reads the chosen
    // file as a data URL specifically so it does not need blob:.
    "img-src 'self' https: data:",
    "media-src 'self' https://*.graphassets.com",
    `script-src ${script}`,
    // Styles keep 'unsafe-inline'. React writes the `style` prop as an inline
    // attribute and framer-motion animates through it, so a nonce cannot cover
    // them — and CSP has no equivalent of 'strict-dynamic' for style
    // attributes. The exposure is restyling, not code execution.
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connect}`,
    "font-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    // Nothing here is ever framed or submits a form off-site.
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
