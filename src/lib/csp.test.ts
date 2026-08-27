// The policy's failure mode is silent: a directive that accidentally allows
// inline script looks exactly like one that doesn't, right up until an XSS
// lands. These assertions are about the properties that matter, not the exact
// string, so reordering or adding a source doesn't break them.

import { describe, expect, it } from "vitest";
import { prop } from "@/test/at";
import { contentSecurityPolicy, createNonce } from "./csp";

/** Pull one directive's source list out of a policy. */
function directive(policy: string, name: string): string {
  const found = policy
    .split("; ")
    .find((d) => d === name || d.startsWith(`${name} `));
  if (!found) throw new Error(`No ${name} directive in: ${policy}`);
  return found.slice(name.length).trim();
}

// 24 characters, like a real one: createNonce() base64-encodes 16 bytes, and
// the suite asserts that length a few cases down. A fixture of a length base64
// cannot produce would quietly undercut the directives asserted against it.
const NONCE = "TESTNONCE0123456789abc==";

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

// ── The policy's shape, not just its substrings ──────────────────────────────
//
// Everything above asks whether the policy *contains* something. That is a
// weaker question than it looks: a directive is a name followed by
// space-separated source tokens, and `toContain` cannot tell a well-formed
// source list from a mangled one. Blank out `"'self'"` in the script array and
// every `toContain` above still passes, because the other sources keep the
// substrings present. Change the `.join(" ")` to `.join("")` and they pass too,
// against a header no browser would parse — `'self''nonce-x''strict-dynamic'`
// is one meaningless token, and a browser that cannot parse `script-src` falls
// back to `default-src`, quietly.
//
// Mutation testing found exactly that: eleven survivors in this file, every one
// a blanked source or a collapsed separator. The cases below parse the header
// the way a browser would and assert on tokens.

/** The policy as `{ directive: [source, ...] }`, preserving empty tokens. */
function parse(csp: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const directive of csp.split("; ")) {
    const space = directive.indexOf(" ");
    if (space === -1) {
      out[directive] = [];
      continue;
    }
    // Deliberately not filtering empties: a blank source is the failure this
    // block exists to catch, so it has to survive parsing to be asserted on.
    out[directive.slice(0, space)] = directive.slice(space + 1).split(" ");
  }
  return out;
}

describe("the policy parses as a browser would read it", () => {
  it.each([
    ["production", false],
    ["development", true],
  ])("every %s source token is non-empty", (_mode, dev) => {
    const directives = parse(contentSecurityPolicy(NONCE, { dev }));

    for (const [name, sources] of Object.entries(directives)) {
      for (const source of sources) {
        expect(source, `${name} has a blank source`).not.toBe("");
      }
    }
  });

  it("separates sources with single spaces, so each is its own token", () => {
    // `prop` throws naming the directive if it is missing, rather than letting
    // an undefined slip into the loop below as "nothing to check".
    const sources = prop(parse(contentSecurityPolicy(NONCE)), "script-src");

    // A collapsed join would yield one long token instead of four.
    expect(sources.length).toBeGreaterThan(1);
    for (const source of sources) {
      expect(source).not.toMatch(/\s/);
      // Two sources run together have no separator between the closing quote
      // of one and the opening quote of the next.
      expect(source).not.toMatch(/'[^']*'[^']/);
    }
  });

  it("gives every directive a name that looks like one", () => {
    for (const name of Object.keys(parse(contentSecurityPolicy(NONCE)))) {
      expect(name).toMatch(/^[a-z-]+$/);
    }
  });
});

describe("script-src, token by token", () => {
  // The exact list, not a containment check. Anything added here is a new
  // origin allowed to run script on the site, which is worth having to state.
  it("is exactly self, the nonce, strict-dynamic and the analytics host", () => {
    expect(parse(contentSecurityPolicy(NONCE))["script-src"]).toEqual([
      "'self'",
      `'nonce-${NONCE}'`,
      "'strict-dynamic'",
      "https://va.vercel-scripts.com",
    ]);
  });

  it("adds unsafe-eval in development and nothing else", () => {
    const prod = parse(contentSecurityPolicy(NONCE, { dev: false }))["script-src"] ?? [];
    const dev = parse(contentSecurityPolicy(NONCE, { dev: true }))["script-src"] ?? [];

    expect(dev.filter((s) => !prod.includes(s))).toEqual(["'unsafe-eval'"]);
  });

  // The dev-only arms are `dev ? [...] : []`. An empty array is the whole
  // point of the production branch, and a stray token there would be an
  // origin nobody chose.
  it("adds nothing at all to script-src in production", () => {
    const prod = parse(contentSecurityPolicy(NONCE, { dev: false }))["script-src"] ?? [];
    const dev = parse(contentSecurityPolicy(NONCE, { dev: true }))["script-src"] ?? [];

    expect(prod).toEqual(dev.filter((s) => s !== "'unsafe-eval'"));
  });
});

describe("connect-src, token by token", () => {
  it("is exactly self, the vitals endpoint and the CMS host", () => {
    expect(parse(contentSecurityPolicy(NONCE))["connect-src"]).toEqual([
      "'self'",
      "https://vitals.vercel-insights.com",
      "https://*.graphassets.com",
    ]);
  });

  it("adds the HMR socket in development and nothing else", () => {
    const prod = parse(contentSecurityPolicy(NONCE, { dev: false }))["connect-src"] ?? [];
    const dev = parse(contentSecurityPolicy(NONCE, { dev: true }))["connect-src"] ?? [];

    expect(dev.filter((s) => !prod.includes(s))).toEqual(["ws:"]);
  });

  it("adds nothing at all to connect-src in production", () => {
    const prod = parse(contentSecurityPolicy(NONCE, { dev: false }))["connect-src"] ?? [];
    const dev = parse(contentSecurityPolicy(NONCE, { dev: true }))["connect-src"] ?? [];

    expect(prod).toEqual(dev.filter((s) => s !== "ws:"));
  });
});

describe("the remaining directives, token by token", () => {
  // style-src keeps 'unsafe-inline' deliberately — React writes the style prop
  // as an attribute and CSP has no nonce equivalent for those — so it is worth
  // pinning exactly rather than leaving it to a substring check that would
  // also pass if the directive vanished.
  it.each([
    ["default-src", ["'self'"]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "https:", "data:"]],
    ["media-src", ["'self'", "https://*.graphassets.com"]],
    ["font-src", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
  ])("%s is exactly %j", (name, expected) => {
    expect(parse(contentSecurityPolicy(NONCE))[name]).toEqual(expected);
  });

  it("names every directive the policy is meant to carry, and no others", () => {
    expect(Object.keys(parse(contentSecurityPolicy(NONCE))).sort()).toEqual(
      [
        "base-uri",
        "connect-src",
        "default-src",
        "font-src",
        "form-action",
        "frame-ancestors",
        "img-src",
        "media-src",
        "object-src",
        "script-src",
        "style-src",
      ].sort()
    );
  });
});
