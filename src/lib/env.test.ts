import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertEnv,
  formatEnvIssues,
  resetEnvWarningLatch,
  validateEnv,
  type EnvIssue,
  type EnvSeverity,
} from "./env";
import { at, only } from "@/test/at";

const VALID: Record<string, string> = {
  WEBSITE_URL: "https://taylercarney.com",
  CMS_ENDPOINT: "https://eu-west-2.hygraph.com/v2/abc/master",
  CMS_TOKEN: "read-token",
  HYGRAPH_MUTATION_TOKEN: "mutation-token",
  ADMIN_KEY: "a-sufficiently-long-admin-key",
};

const of = (source: Record<string, string | undefined>, severity: EnvSeverity) =>
  validateEnv(source)
    .filter((i) => i.severity === severity)
    .map((i) => i.name);

const errors = (source: Record<string, string | undefined>) => of(source, "error");
const warnings = (source: Record<string, string | undefined>) => of(source, "warning");

describe("validateEnv", () => {
  it("accepts a fully configured environment", () => {
    expect(validateEnv(VALID)).toEqual([]);
  });

  it("reports every problem at once rather than only the first", () => {
    expect(errors({})).toHaveLength(5);
  });

  it.each(Object.keys(VALID))("errors on a missing %s", (key) => {
    const source = { ...VALID };
    delete source[key];
    expect(errors(source)).toEqual([key]);
  });

  it("treats a whitespace-only value as missing", () => {
    expect(errors({ ...VALID, CMS_TOKEN: "   " })).toEqual(["CMS_TOKEN"]);
  });

  describe("WEBSITE_URL", () => {
    it.each([
      "taylercarney.com",
      "/portfolio",
      "localhost:3000",
      "ftp://taylercarney.com",
      "not a url",
    ])("errors on %j", (value) => {
      expect(errors({ ...VALID, WEBSITE_URL: value })).toEqual(["WEBSITE_URL"]);
    });

    it.each(["https://taylercarney.com", "http://localhost:3000"])("accepts %j", (value) => {
      expect(validateEnv({ ...VALID, WEBSITE_URL: value })).toEqual([]);
    });
  });

  describe("ADMIN_KEY length", () => {
    // Deliberately a warning: a short key still works, and failing the build
    // over it would take a live site down to fix a pre-existing weakness.
    it("warns rather than errors on a short key", () => {
      const source = { ...VALID, ADMIN_KEY: "admin" };
      expect(warnings(source)).toEqual(["ADMIN_KEY"]);
      expect(errors(source)).toEqual([]);
    });

    it("warns at 15 characters and is silent at 16", () => {
      expect(warnings({ ...VALID, ADMIN_KEY: "x".repeat(15) })).toEqual(["ADMIN_KEY"]);
      expect(validateEnv({ ...VALID, ADMIN_KEY: "x".repeat(16) })).toEqual([]);
    });

    it("explains the consequence and how to fix it", () => {
      const issue = only(validateEnv({ ...VALID, ADMIN_KEY: "short" }));
      // The consequence has to be the *offline* attack on the HMAC key. Login
      // is rate-limited, so an explanation resting on online guessing would be
      // both wrong and reassuring in the wrong direction.
      expect(issue.message).toMatch(/offline/);
      expect(issue.message).toMatch(/HMAC key/);
      expect(issue.message).toMatch(/openssl rand/);
      expect(issue.message).toMatch(/signs out every existing admin session/);
    });

    it("does not claim the login is unlimited, because it is not", () => {
      const issue = only(validateEnv({ ...VALID, ADMIN_KEY: "short" }));
      expect(issue.message).not.toMatch(/no rate limit/i);
    });
  });

  describe("CMS_MUTATION_ENDPOINT", () => {
    it("is silent when CMS_ENDPOINT is a regular content host", () => {
      expect(validateEnv(VALID)).toEqual([]);
    });

    it("warns — but does not error — when CMS_ENDPOINT is the read CDN", () => {
      const source = { ...VALID, CMS_ENDPOINT: "https://eu-west-2.cdn.hygraph.com/v2/abc/master" };
      expect(warnings(source)).toEqual(["CMS_MUTATION_ENDPOINT"]);
      expect(errors(source)).toEqual([]);
    });

    it("is satisfied by supplying a mutation host alongside the CDN", () => {
      expect(
        validateEnv({
          ...VALID,
          CMS_ENDPOINT: "https://eu-west-2.cdn.hygraph.com/v2/abc/master",
          CMS_MUTATION_ENDPOINT: "https://eu-west-2.hygraph.com/v2/abc/master",
        })
      ).toEqual([]);
    });

    it("still errors on a malformed value when one is supplied", () => {
      expect(errors({ ...VALID, CMS_MUTATION_ENDPOINT: "not-a-url" })).toEqual([
        "CMS_MUTATION_ENDPOINT",
      ]);
    });
  });
});

describe("formatEnvIssues", () => {
  it("names each offending variable and points at .env.example", () => {
    const text = formatEnvIssues(validateEnv({}), "error");
    for (const key of Object.keys(VALID)) expect(text).toContain(key);
    expect(text).toContain(".env.example");
    expect(text).toContain("5 problems");
  });

  it("uses the singular for one problem", () => {
    const source = { ...VALID };
    delete source.ADMIN_KEY;
    expect(formatEnvIssues(validateEnv(source), "error")).toContain("(1 problem)");
  });

  it("makes clear that warnings do not stop the build", () => {
    const text = formatEnvIssues(validateEnv({ ...VALID, ADMIN_KEY: "short" }), "warning");
    expect(text).toContain("the build continues");
  });

  it("keeps errors and warnings in separate reports", () => {
    const source = { ...VALID, ADMIN_KEY: "short", WEBSITE_URL: "nope" };
    expect(formatEnvIssues(validateEnv(source), "error")).not.toContain("ADMIN_KEY");
    expect(formatEnvIssues(validateEnv(source), "warning")).not.toContain("WEBSITE_URL");
  });
});

describe("assertEnv", () => {
  // The warning block prints at most once per process (next.config.ts is
  // evaluated twice per build). Reset that latch so these cases don't depend
  // on the order they happen to run in.
  beforeEach(resetEnvWarningLatch);

  it("passes silently on a valid environment", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertEnv(VALID)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("throws listing every error", () => {
    expect(() => assertEnv({})).toThrow(/WEBSITE_URL[\s\S]*ADMIN_KEY/);
  });

  it("warns without throwing when only warnings are present", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertEnv({ ...VALID, ADMIN_KEY: "short" })).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(at(at(warn.mock.calls, 0), 0))).toContain("ADMIN_KEY");
    warn.mockRestore();
  });

  it("still throws on errors even when warnings are also present", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertEnv({ ...VALID, ADMIN_KEY: "short", WEBSITE_URL: "" })).toThrow(
      /WEBSITE_URL/
    );
    // The warning is still surfaced before the throw, not lost with it.
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("prints the warning block only once per process", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    assertEnv({ ...VALID, ADMIN_KEY: "short" });
    assertEnv({ ...VALID, ADMIN_KEY: "short" });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("is skipped entirely when SKIP_ENV_VALIDATION is set, so CI can build", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertEnv({ SKIP_ENV_VALIDATION: "1" })).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

// ── The message an operator actually reads ───────────────────────────────────
//
// These strings are the whole product of this module. It exists so a
// misconfigured deploy fails at build time with something someone can act on,
// and a blank `purpose` or a collapsed join turns that into a wall of names
// with no explanation — which is the same as no message at all.

describe("validateEnv — every required variable explains itself", () => {
  const REQUIRED = ["WEBSITE_URL", "CMS_ENDPOINT", "CMS_TOKEN", "HYGRAPH_MUTATION_TOKEN", "ADMIN_KEY"];

  const issueFor = (name: string) => {
    const source: Record<string, string | undefined> = {};
    return validateEnv(source).find((i) => i.name === name);
  };

  it.each(REQUIRED)("reports %s as required when it is missing", (name) => {
    expect(issueFor(name)).toMatchObject({ name, severity: "error" });
  });

  // The message is `is required — needed for ${purpose}`. A blank purpose
  // leaves "is required — needed for ", which reads as a truncated sentence
  // and tells the operator nothing about what breaks.
  it.each(REQUIRED)("says what %s is needed for, not just that it is needed", (name) => {
    const message = issueFor(name)?.message ?? "";

    expect(message).toContain("is required");
    expect(message).toMatch(/needed for \S/);
    expect(message.replace(/^is required — needed for /, "").trim()).not.toBe("");
  });

  it("gives each variable its own purpose rather than one shared sentence", () => {
    const purposes = REQUIRED.map((name) =>
      (issueFor(name)?.message ?? "").replace(/^is required — needed for /, "")
    );
    expect(new Set(purposes).size).toBe(REQUIRED.length);
  });

  it.each(["", "   ", "\t\n"])("treats the blank value %j as missing", (value) => {
    const issues = validateEnv({ WEBSITE_URL: value });
    expect(issues.find((i) => i.name === "WEBSITE_URL")?.severity).toBe("error");
  });
});

describe("validateEnv — the CDN endpoint warning", () => {
  const complete = {
    WEBSITE_URL: "https://example.test",
    CMS_ENDPOINT: "https://eu-west-2.cdn.hygraph.com/content/abc/master",
    CMS_TOKEN: "read-token",
    HYGRAPH_MUTATION_TOKEN: "write-token",
    ADMIN_KEY: "a-long-enough-admin-key",
  };

  it("warns when the read CDN is used with no mutation endpoint set", () => {
    const issue = validateEnv(complete).find((i) => i.name === "CMS_MUTATION_ENDPOINT");

    expect(issue?.severity).toBe("warning");
    // Names the symptom and the fix, not just the fact.
    expect(issue?.message).toContain("cdn.hygraph.com");
    expect(issue?.message).toContain("Content API");
  });

  it("stays quiet once a mutation endpoint is set", () => {
    const issues = validateEnv({
      ...complete,
      CMS_MUTATION_ENDPOINT: "https://api-eu-west-2.hygraph.com/v2/abc/master",
    });
    expect(issues.find((i) => i.name === "CMS_MUTATION_ENDPOINT")).toBeUndefined();
  });

  it.each(["   ", ""])("treats the blank mutation endpoint %j as unset", (value) => {
    const issues = validateEnv({ ...complete, CMS_MUTATION_ENDPOINT: value });
    expect(issues.find((i) => i.name === "CMS_MUTATION_ENDPOINT")?.severity).toBe("warning");
  });

  // The endpoint itself is trimmed before the host is matched, so a value with
  // a stray newline — what a mounted secret gives you — still triggers it.
  it("recognizes the CDN host despite surrounding whitespace", () => {
    const issues = validateEnv({ ...complete, CMS_ENDPOINT: `  ${complete.CMS_ENDPOINT}\n` });
    expect(issues.find((i) => i.name === "CMS_MUTATION_ENDPOINT")?.severity).toBe("warning");
  });

  it("stays quiet for a non-CDN endpoint", () => {
    const issues = validateEnv({
      ...complete,
      CMS_ENDPOINT: "https://api-eu-west-2.hygraph.com/v2/abc/master",
    });
    expect(issues.find((i) => i.name === "CMS_MUTATION_ENDPOINT")).toBeUndefined();
  });
});

describe("formatEnvIssues — the block that gets printed", () => {
  const issues: EnvIssue[] = [
    { name: "A", message: "is broken", severity: "error" },
    { name: "B", message: "is odd", severity: "warning" },
    { name: "C", message: "is also broken", severity: "error" },
  ];

  it("lists only the requested severity", () => {
    const text = formatEnvIssues(issues, "error");

    expect(text).toContain("A is broken");
    expect(text).toContain("C is also broken");
    expect(text).not.toContain("B is odd");
  });

  it("counts what it lists, and pluralizes on that count", () => {
    expect(formatEnvIssues(issues, "error")).toContain("(2 problems)");
    expect(formatEnvIssues(issues, "warning")).toContain("(1 issue)");
  });

  it("names the unit rather than counting nothing", () => {
    expect(formatEnvIssues(issues, "warning")).toMatch(/\(1 issue\)/);
    expect(formatEnvIssues(issues, "warning")).not.toMatch(/\(1 \)/);
  });

  // Joined with newlines: collapsed to one line the block is unreadable, and
  // the per-issue bullets run into each other.
  it("puts each issue on its own line", () => {
    const lines = formatEnvIssues(issues, "error").split("\n");

    expect(lines.length).toBeGreaterThan(3);
    expect(lines.filter((l) => l.startsWith("  - "))).toHaveLength(2);
  });

  it("points at the contract file, which is where the answer is", () => {
    expect(formatEnvIssues(issues, "error")).toContain(".env.example");
  });

  it("distinguishes the two headings, so a warning does not read as a failure", () => {
    expect(formatEnvIssues(issues, "error")).toContain("Invalid environment configuration");
    expect(formatEnvIssues(issues, "warning")).toContain("the build continues");
  });
});
