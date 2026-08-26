// Next.js uses thrown errors as internal control flow. `redirect()` and
// `notFound()` work by throwing, and the App Router marks a route as
// dynamically rendered by throwing a DynamicServerError out of the render pass
// when it encounters a `no-store` fetch.
//
// That makes a bare `catch` around a CMS read genuinely dangerous: it doesn't
// just swallow network failures, it swallows the framework's own signals. A
// caught DynamicServerError means the route never gets marked dynamic, and a
// caught NEXT_REDIRECT means a redirect silently doesn't happen.
//
// These are identified by their `digest`, which is the documented, stable
// surface — as opposed to importing from `next/dist/...` internals.

const CONTROL_FLOW_DIGESTS = [
  // Thrown to bail out of static rendering (a no-store fetch, cookies(), etc.).
  "DYNAMIC_SERVER_USAGE",
  // redirect() / permanentRedirect(); carries the target appended after a ';'.
  "NEXT_REDIRECT",
  // notFound(). Newer Next versions use the NEXT_HTTP_ERROR_FALLBACK form.
  "NEXT_NOT_FOUND",
  "NEXT_HTTP_ERROR_FALLBACK",
  // Suspense bail-out during prerender.
  "BAILOUT_TO_CLIENT_SIDE_RENDERING",
];

/**
 * Whether `error` is one of Next's control-flow signals rather than a genuine
 * failure. Anything matching must be re-thrown, never handled.
 */
export function isNextControlFlowError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;

  return CONTROL_FLOW_DIGESTS.some((d) => digest === d || digest.startsWith(`${d};`));
}

/**
 * Re-throw Next's control-flow errors, returning normally for anything a
 * caller may legitimately handle. Call this first inside any `catch` that
 * wraps a render-path CMS read.
 */
export function rethrowIfControlFlow(error: unknown): void {
  if (isNextControlFlowError(error)) throw error;
}
