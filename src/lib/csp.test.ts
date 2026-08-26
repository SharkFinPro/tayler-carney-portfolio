// The policy's failure mode is silent: a directive that accidentally allows
// inline script looks exactly like one that doesn't, right up until an XSS
// lands. These assertions are about the properties that matter, not the exact
// string, so reordering or adding a source doesn't break them.

import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, createNonce } from "./csp";

/** Pull one directive's source list out of a policy. */
function directive(policy: string, name: string): string {
  const found = policy
    .split("; ")
    .find((d) => d === name || d.startsWith(`${name} `));
  if (!found) throw new Error(`No ${name} directive in: ${policy}`);
  return found.slice(name.length).trim();
}

const NONCE = "TESTNONCE0123456789abcd==";

describe("createNonce", () => {
  it("produces a fresh value every call", () => {
    const seen = new Set(Array.from({ length: 200 }, createNonce));
    expect(seen.size).toBe(200);
  });

  it("carries at least the 128 bits the spec asks for", () => {
    // 16 bytes base64-encode to 24 characters, the last two being padding.
    expect(createNonce()).toHaveLength(24);
  });

  it("is base64, so it needs no quoting inside the header", () => {
    for (let i = 0; i < 50; i++) {
      expect(createNonce()).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    }
  });
});

describe("contentSecurityPolicy — script-src", () => {
  it("never allows inline script, in either mode", () => {
    for (const dev of [false, true]) {
      expect(directive(contentSecurityPolicy(NONCE, { dev }), "script-src")).not.toContain(
        "'unsafe-inline'"
      );
    }
  });

  it("carries the nonce it was given", () => {
    expect(directive(contentSecurityPolicy(NONCE), "script-src")).toContain(`'nonce-${NONCE}'`);
  });

  it("trusts what a nonced script loads, so Next can pull in its own chunks", () => {
    expect(directive(contentSecurityPolicy(NONCE), "script-src")).toContain("'strict-dynamic'");
  });

  it("allows eval only in development, where the dev bundler needs it", () => {
    expect(directive(contentSecurityPolicy(NONCE, { dev: true }), "script-src")).toContain(
      "'unsafe-eval'"
    );
    expect(directive(contentSecurityPolicy(NONCE, { dev: false }), "script-src")).not.toContain(
      "'unsafe-eval'"
    );
  });

  it("defaults to the production policy when no mode is given", () => {
    expect(contentSecurityPolicy(NONCE)).toBe(contentSecurityPolicy(NONCE, { dev: false }));
  });
});

describe("contentSecurityPolicy — the rest of the policy", () => {
  const policy = contentSecurityPolicy(NONCE);

  it("refuses to be framed", () => {
    expect(directive(policy, "frame-ancestors")).toBe("'none'");
  });

  it("blocks plugin content outright", () => {
    expect(directive(policy, "object-src")).toBe("'none'");
  });

  it("pins <base> and form targets to this origin", () => {
    // Without these, an injected <base> can redirect every relative URL on the
    // page, and an injected form can post the admin's input off-site.
    expect(directive(policy, "base-uri")).toBe("'self'");
    expect(directive(policy, "form-action")).toBe("'self'");
  });

  it("allows the data: URLs the crop preview builds", () => {
    expect(directive(policy, "img-src")).toContain("data:");
  });

  it("allows the CMS asset host for media", () => {
    expect(directive(policy, "media-src")).toContain("https://*.graphassets.com");
  });

  it("opens the HMR socket only in development", () => {
    expect(directive(contentSecurityPolicy(NONCE, { dev: true }), "connect-src")).toContain("ws:");
    expect(directive(policy, "connect-src")).not.toContain("ws:");
  });

  it("keeps a default-src fallback, so an unlisted directive is not wide open", () => {
    expect(directive(policy, "default-src")).toBe("'self'");
  });

  it("emits each directive exactly once", () => {
    const names = policy.split("; ").map((d) => d.split(" ")[0]);
    expect(new Set(names).size).toBe(names.length);
  });
});
