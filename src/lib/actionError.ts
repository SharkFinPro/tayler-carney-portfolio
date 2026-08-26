// Error boundary for Server Actions.
//
// Every admin action used to end with `e instanceof Error ? e.message : "…"`,
// and cms.ts builds that message by joining Hygraph's GraphQL errors verbatim.
// Those strings routinely name internal field paths, model names, and token
// permission scopes — none of which should reach a browser.
//
// The fix is not just redaction. A raw GraphQL error is also useless to the
// person reading it: "field 'projectPage' is not defined by type
// ProjectUpdateInput" tells a non-technical editor nothing they can act on.
// So known failure shapes are translated into a sentence that says what to do,
// and everything else falls back to a generic message plus a correlation id
// that ties the UI back to the server log.

import { reportError } from "@/lib/observability";

export type SafeError = { ok: false; error: string };

/**
 * Thrown when a draft write succeeded but publishing it did not.
 *
 * Saving is two sequential mutations — `updateDraft` then `publishEntry` in
 * contentActions.ts — with no transaction available through the Hygraph API,
 * so a partial application is genuinely possible: the draft holds the new
 * content while the published entry still holds the old. Reporting that as a
 * flat failure is actively misleading — the admin believes nothing was saved,
 * and the next successful publish of that entry then ships an edit they
 * thought had been discarded.
 *
 * Defined here rather than beside `publishEntry` because a `"use server"`
 * module may only export async functions; exporting a class from one fails the
 * build.
 */
export class PublishFailedError extends Error {
  constructor(cause: unknown) {
    super(
      "Your change was saved as a draft, but publishing it failed, so visitors still see the previous version. Try saving again."
    );
    this.name = "PublishFailedError";
    this.cause = cause;
  }
}

/** Short, roughly-unique token linking a UI message to a server log line. */
function correlationId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

type Translation = { match: RegExp; message: string };

// Ordered: the first match wins, so put the specific patterns first.
const TRANSLATIONS: Translation[] = [
  {
    // Hygraph's permission failures. By far the most common real-world cause,
    // and the one AGENTS.md warns is "not a code bug".
    // `authori[sz]ed` unprefixed so it catches "unauthorized", "not
    // authorized", and "unauthorised" alike.
    match: /permission|authori[sz]ed|forbidden|access denied|\b401\b|\b403\b/i,
    message:
      "The CMS token doesn't have permission for that. Its scope may have changed — check the token still allows update and publish on this model.",
  },
  {
    match: /rate limit|too many requests|429/i,
    message: "The CMS is rate-limiting requests right now. Wait a moment and try again.",
  },
  {
    // Network-shaped failures: the CMS is unreachable rather than refusing.
    match: /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|network|socket hang up/i,
    message: "Couldn't reach the CMS. Check your connection and try again.",
  },
  {
    match: /timeout|timed out/i,
    message: "The CMS took too long to respond. Try again in a moment.",
  },
  {
    // A document that vanished between load and save.
    match: /not found|does not exist|no such/i,
    message: "That item no longer exists in the CMS — it may have been deleted in another tab.",
  },
  {
    match: /payload too large|413|body exceeded/i,
    message: "That file is too large to upload. Try a smaller image.",
  },
];

/**
 * Convert a thrown value into a message that is safe to show and useful to act
 * on, logging the full detail server-side under a correlation id.
 *
 * @param error    the caught value
 * @param context  what was being attempted, e.g. "updateBlockLayout" — server log only
 * @param fallback verb-appropriate generic message, e.g. "Couldn't save that."
 */
export function toActionError(error: unknown, context: string, fallback: string): SafeError {
  const id = correlationId();
  const raw = error instanceof Error ? error.message : String(error);

  // The full error, including the raw CMS text, stays on the server — now as a
  // structured record rather than a free-form line, so it can be filtered by
  // scope and correlated with the reference shown in the UI.
  reportError({ scope: "server-action", context, error, correlationId: id });

  // A partial write already carries an accurate, actionable message of its own
  // — it says the draft saved but publishing didn't, which none of the generic
  // translations below could convey.
  if (error instanceof Error && error.name === "PublishFailedError") {
    return { ok: false, error: error.message };
  }

  const translation = TRANSLATIONS.find((t) => t.match.test(raw));
  if (translation) {
    return { ok: false, error: translation.message };
  }

  // Nothing recognized: say so plainly and give the operator the log key
  // rather than leaking whatever the CMS happened to say.
  return { ok: false, error: `${fallback} (ref ${id})` };
}

/** Exposed for tests — the translation table should stay in sync with reality. */
export const __TRANSLATIONS_FOR_TEST = TRANSLATIONS;
