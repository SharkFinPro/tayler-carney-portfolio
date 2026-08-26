import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertEnv,
  formatEnvIssues,
  resetEnvWarningLatch,
  validateEnv,
  type EnvSeverity,
} from "./env";

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
      const [issue] = validateEnv({ ...VALID, ADMIN_KEY: "short" });
      expect(issue.message).toMatch(/brute-forceable/);
      expect(issue.message).toMatch(/openssl rand/);
      expect(issue.message).toMatch(/signs out every existing admin session/);
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
    expect(String(warn.mock.calls[0][0])).toContain("ADMIN_KEY");
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
