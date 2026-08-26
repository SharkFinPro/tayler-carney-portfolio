// Environment variable contract.
//
// Every one of these has a failure mode that is silent and wrong rather than
// loud and obvious, which is the worst kind:
//
//   WEBSITE_URL unset  -> layout.tsx falls back to "http://localhost:3000", so
//                         every canonical URL and OpenGraph tag on the live
//                         site points at localhost, and sitemap.ts emits bare
//                         relative paths that search engines reject.
//   ADMIN_KEY unset    -> verifySession() returns false for everything, so
//                         admin login appears to succeed and then silently
//                         never works.
//   CMS_ENDPOINT unset -> cms.ts casts undefined through `as string` and fetch
//                         throws an opaque parse error on the first request.
//
// This module is pure (no server-only imports) so it can run from
// next.config.ts at build time — the point is to fail the *deploy* rather than
// a request at 3am.

// Errors are things that are definitely broken — a required variable missing,
// or a value that cannot possibly work. They fail the build.
//
// Warnings are judgement calls: configurations that are probably wrong, or
// weaker than they should be, but that may well be working today. They are
// printed loudly on every build and never block a deploy — blocking on a
// heuristic would mean this module could take down a working site.
export type EnvSeverity = "error" | "warning";
export type EnvIssue = { name: string; message: string; severity: EnvSeverity };

type Rule = {
  name: string;
  required: boolean;
  /** What breaks when it is missing or malformed. Shown in the message. */
  purpose: string;
  /** Returns a problem message, or null when the value is acceptable. */
  check?: (value: string) => string | null;
  /** Severity for a failed `check`. A missing required var is always an error. */
  checkSeverity?: EnvSeverity;
};

const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

// The admin key is both the login secret and the HMAC signing key for the
// session cookie, so a short one weakens authentication twice over.
const MIN_ADMIN_KEY_LENGTH = 16;

const RULES: Rule[] = [
  {
    name: "WEBSITE_URL",
    required: true,
    purpose: "metadataBase, OpenGraph URLs, and every sitemap entry",
    check: (v) =>
      isHttpUrl(v)
        ? null
        : `must be an absolute http(s) URL (e.g. "https://taylercarney.com"), got ${JSON.stringify(v)}`,
  },
  {
    name: "CMS_ENDPOINT",
    required: true,
    purpose: "every content read",
    check: (v) => (isHttpUrl(v) ? null : "must be an absolute http(s) URL"),
  },
  {
    name: "CMS_TOKEN",
    required: true,
    purpose: "public (published) content reads",
  },
  {
    name: "HYGRAPH_MUTATION_TOKEN",
    required: true,
    purpose: "draft reads and every admin write",
  },
  {
    name: "ADMIN_KEY",
    required: true,
    purpose: "admin login and session signing",
    // A warning, not an error: a short key still *works*, and failing the build
    // over it would take a live site down to fix a weakness that predates this
    // check. It is surfaced on every build until someone rotates it.
    checkSeverity: "warning",
    check: (v) =>
      v.length < MIN_ADMIN_KEY_LENGTH
        ? `is only ${v.length} characters. It is both the login secret and the session HMAC key, and the login has no rate limiting, so it is brute-forceable. Rotate to at least ${MIN_ADMIN_KEY_LENGTH} (\`openssl rand -base64 32\`) — note this signs out every existing admin session`
        : null,
  },
  {
    name: "CMS_MUTATION_ENDPOINT",
    required: false,
    purpose: "writes, when CMS_ENDPOINT is the read-only CDN host",
    check: (v) => (isHttpUrl(v) ? null : "must be an absolute http(s) URL"),
  },
];

/**
 * Check the environment against the contract. Returns every problem rather
 * than throwing on the first, so one deploy surfaces the whole list.
 */
export function validateEnv(source: Record<string, string | undefined> = process.env): EnvIssue[] {
  const issues: EnvIssue[] = [];

  for (const rule of RULES) {
    const raw = source[rule.name];
    const value = typeof raw === "string" ? raw.trim() : "";

    if (!value) {
      if (rule.required) {
        issues.push({
          name: rule.name,
          message: `is required — needed for ${rule.purpose}`,
          severity: "error",
        });
      }
      continue;
    }

    const problem = rule.check?.(value);
    if (problem) {
      issues.push({
        name: rule.name,
        message: problem,
        severity: rule.checkSeverity ?? "error",
      });
    }
  }

  // Hygraph's read CDN is documented as rejecting mutations, but this is a
  // warning rather than an error: some projects do accept writes on the CDN
  // host, and failing the build here would break a deploy that works today.
  const endpoint = source.CMS_ENDPOINT?.trim() ?? "";
  const mutationEndpoint = source.CMS_MUTATION_ENDPOINT?.trim() ?? "";
  if (endpoint.includes(".cdn.hygraph.com") && !mutationEndpoint) {
    issues.push({
      name: "CMS_MUTATION_ENDPOINT",
      message:
        "is unset while CMS_ENDPOINT is a *.cdn.hygraph.com host. The read CDN can reject mutations — if admin saves fail with permission-shaped errors, point this at the regular Content API host",
      severity: "warning",
    });
  }

  return issues;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Guards against the doubled warning block described in `assertEnv`. */
let warnedOnce = false;

/** Test seam: reset the once-only warning latch. */
export function resetEnvWarningLatch(): void {
  warnedOnce = false;
}

export function formatEnvIssues(issues: EnvIssue[], severity: EnvSeverity): string {
  const matching = issues.filter((i) => i.severity === severity);
  const heading =
    severity === "error"
      ? `Invalid environment configuration (${plural(matching.length, "problem")}):`
      : `Environment warnings (${plural(matching.length, "issue")}) — the build continues:`;

  return [
    heading,
    ...matching.map((i) => `  - ${i.name} ${i.message}`),
    "",
    "See .env.example for the full contract.",
  ].join("\n");
}

/**
 * Throw when the environment is definitely broken; warn when it is merely
 * questionable. Called from next.config.ts so a misconfigured deploy fails at
 * build time rather than serving a subtly wrong site.
 *
 * Skipped entirely when SKIP_ENV_VALIDATION is set — CI builds the app to prove
 * it compiles, and deliberately has no production secrets to validate.
 */
export function assertEnv(source: Record<string, string | undefined> = process.env): void {
  if (source.SKIP_ENV_VALIDATION) return;

  const issues = validateEnv(source);

  // next.config.ts is evaluated more than once per build, so the warning block
  // would otherwise be printed twice and read like two separate problems.
  const warnings = issues.filter((i) => i.severity === "warning");
  if (warnings.length > 0 && !warnedOnce) {
    warnedOnce = true;
    console.warn(`\n${formatEnvIssues(issues, "warning")}\n`);
  }

  if (issues.some((i) => i.severity === "error")) {
    throw new Error(formatEnvIssues(issues, "error"));
  }
}
