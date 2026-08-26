// Structured error reporting and an audit trail for content mutations.
//
// Before this, the only error reporting in the codebase was two `console.error`
// calls. On Vercel those land in a log stream nobody watches, as free-form text
// that can't be filtered — so the first signal that an admin's saves had started
// failing would be someone noticing the site looked wrong.
//
// ## Why structured logs rather than an SDK
//
// The obvious move is to install Sentry. That is a real dependency, a config
// file, a build plugin, and an account — a decision with ongoing cost that
// belongs to whoever maintains this, not to the change that noticed the gap.
//
// So the default is a single-line JSON record on stdout. That is immediately
// useful: Vercel's log viewer, `vercel logs`, and any drain can all filter on
// `event` and `level` rather than grepping prose. And `setErrorReporter` is the
// seam — wiring Sentry later means one call in instrumentation, with every
// call site already in place.

/** Where a failure came from. Filterable, so keep the set small and stable. */
export type ErrorScope =
  | "route" // a page or layout render
  | "root-layout" // the global-error boundary
  | "server-action"
  | "cms"
  | "ai";

export type ErrorReport = {
  scope: ErrorScope;
  /** Specific operation — the action name, the route, the query. */
  context: string;
  error: unknown;
  /** Ties a log line to the reference shown in the UI. */
  correlationId?: string;
  /** Anything else worth filtering on later. Must not contain secrets. */
  extra?: Record<string, unknown>;
};

export type ErrorReporter = (report: ErrorReport) => void;

/** Mutations worth being able to reconstruct after the fact. */
export type AuditEvent = {
  action: string;
  /** Hygraph model and entry the change targeted, when there is one. */
  model?: string;
  entryId?: string;
  field?: string;
  /** Best-effort client address, so a run of changes can be correlated. */
  client?: string;
  outcome: "ok" | "failed";
  extra?: Record<string, unknown>;
};

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      // Stacks are long; the first few frames are where the answer is, and the
      // rest is framework noise that makes the log line unreadable.
      stack: error.stack?.split("\n").slice(0, 8).join("\n"),
      ...(error.cause ? { cause: String(error.cause) } : {}),
    };
  }
  return { message: String(error) };
}

/** One JSON object per line — parseable by any log drain, greppable by eye. */
function emit(level: "error" | "info", payload: Record<string, unknown>): void {
  const line = JSON.stringify({ level, at: new Date().toISOString(), ...payload });
  if (level === "error") console.error(line);
  else console.info(line);
}

let reporter: ErrorReporter = (report) => {
  emit("error", {
    event: "error",
    scope: report.scope,
    context: report.context,
    correlationId: report.correlationId,
    error: serializeError(report.error),
    ...report.extra,
  });
};

/**
 * Replace the reporter — the seam for Sentry or anything else.
 *
 * Wrap rather than replace if you want to keep the log line as well:
 *
 *     const previous = getErrorReporter();
 *     setErrorReporter((r) => { previous(r); Sentry.captureException(r.error); });
 */
export function setErrorReporter(next: ErrorReporter): void {
  reporter = next;
}

export function getErrorReporter(): ErrorReporter {
  return reporter;
}

/** Report a failure. Never throws — a broken reporter must not break a request. */
export function reportError(report: ErrorReport): void {
  try {
    reporter(report);
  } catch {
    // Deliberately silent. A reporter that throws would otherwise turn a
    // handled error into an unhandled one, which is strictly worse.
  }
}

/**
 * Record a content mutation.
 *
 * The audit gap this closes: there was no record that a change had happened at
 * all, so "when did the About page copy change, and was that us?" had no
 * answer. Note that authentication is a single shared key, so this records
 * *what* changed and *from where* — not *who*. Distinguishing people needs
 * per-user credentials, which is a larger change than an audit trail.
 */
export function auditEvent(event: AuditEvent): void {
  try {
    emit("info", {
      event: "audit",
      action: event.action,
      outcome: event.outcome,
      model: event.model,
      entryId: event.entryId,
      field: event.field,
      client: event.client,
      ...event.extra,
    });
  } catch {
    // Same reasoning as above: observability must never be the thing that
    // breaks a save.
  }
}
