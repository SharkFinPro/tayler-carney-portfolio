// The middleware, which exists to attach a Content Security Policy and mint the
// nonce it names.
//
// csp.ts already has a suite, but it only proves the policy *string* is built
// correctly. Nothing proved the string is actually attached to a response, or
// that the nonce reaches the request — and that second half is load-bearing in
// a way that is invisible: Next reads the incoming `content-security-policy`
// header, pulls the nonce out of it, and stamps that value onto its own inline
// bootstrap scripts. If the request half were dropped, the policy would still
// look perfect on the response and would block the framework's own output.
//
// The transport for that is Next's own convention rather than a plain header:
// `NextResponse.next({ request: { headers } })` encodes the overrides as
// `x-middleware-override-headers` plus one `x-middleware-request-<name>` per
// entry, which is what the helper below reads back.

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware, config } from "./middleware";
import { at } from "@/test/at";

/** Run the middleware against a URL and hand back both header views. */
function run(url = "https://example.test/about") {
  const response = middleware(new NextRequest(url));

  const overridden = (response.headers.get("x-middleware-override-headers") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    response,
    /** A header as the *response* carries it. */
    onResponse: (name: string) => response.headers.get(name),
    /** A header as it will be seen by the route, via Next's override channel. */
    onRequest: (name: string) => response.headers.get(`x-middleware-request-${name}`),
    overridden,
  };
}

/** The nonce a policy string names. */
function nonceIn(csp: string | null): string | null {
  return /'nonce-([^']+)'/.exec(csp ?? "")?.[1] ?? null;
}

afterEach(() => {
  // The dev-mode cases below stub NODE_ENV. `process.env` rejects a plain
  // defineProperty, so Vitest's own stubbing is the way in — and unstubbing
  // keeps those two cases from leaking into the rest of the file.
  vi.unstubAllEnvs();
});

describe("the policy is actually attached", () => {
  it("sets a policy on the response", () => {
    expect(run().onResponse("content-security-policy")).toContain("default-src 'self'");
  });

  it("sets the same policy on the request, which is what Next reads", () => {
    const { onResponse, onRequest } = run();
    expect(onRequest("content-security-policy")).toBe(onResponse("content-security-policy"));
  });

  it("forwards the nonce as its own request header", () => {
    const { onRequest } = run();
    expect(onRequest("x-nonce")).toBeTruthy();
  });

  it("declares both forwarded headers as overrides", () => {
    expect(run().overridden).toEqual(expect.arrayContaining(["x-nonce", "content-security-policy"]));
  });
});

describe("the nonce", () => {
  // The whole mechanism rests on these being the same value. If they drift,
  // every inline script Next emits is blocked and the site renders blank.
  it("is the same in the forwarded header and in the policy", () => {
    const { onRequest, onResponse } = run();
    expect(onRequest("x-nonce")).toBe(nonceIn(onResponse("content-security-policy")));
  });

  it("is different on every request", () => {
    const nonces = new Set(
      Array.from({ length: 25 }, () => run().onRequest("x-nonce"))
    );
    expect(nonces.size).toBe(25);
  });

  it("carries the 128 bits the CSP spec asks for", () => {
    const nonce = run().onRequest("x-nonce") ?? "";
    // 16 bytes of base64, padding included.
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("what the policy must never allow", () => {
  const scriptSrc = () =>
    /script-src ([^;]+)/.exec(run().onResponse("content-security-policy") ?? "")?.[1] ?? "";

  // The reason the nonce exists at all: 'unsafe-inline' cannot tell Next's
  // inline script from an injected one, so allowing it retires the directive.
  it("never puts 'unsafe-inline' in script-src", () => {
    expect(scriptSrc()).not.toContain("unsafe-inline");
  });

  it("never allows eval outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(scriptSrc()).not.toContain("unsafe-eval");
  });

  it("relaxes eval in development, where the bundler needs it", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(scriptSrc()).toContain("unsafe-eval");
  });

  it.each(["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"])(
    "keeps %j",
    (directive) => {
      expect(run().onResponse("content-security-policy")).toContain(directive);
    }
  );
});

describe("the matcher", () => {
  const source = () => {
    const entry = at(config.matcher, 0);
    return typeof entry === "string" ? entry : entry.source;
  };

  // Next compiles this source with path-to-regexp; evaluating it as a plain
  // RegExp here is an approximation of that, not a reimplementation of it. What
  // these two cases are really guarding is the negative lookahead — dropping it
  // or inverting it to `(?=` is a one-character edit that would put the policy
  // on every static chunk (or on nothing at all), and neither shows up as a
  // failure anywhere else. Asserting the source merely *contains* the paths
  // would not catch either.
  const matches = (path: string) => new RegExp(source().replace(/^\//, "^/")).test(path);

  it.each([
    // Build output carries its own policy, or needs none.
    "/_next/static/chunk.js",
    "/_next/image",
  ])("excludes %j", (path) => {
    expect(matches(path)).toBe(false);
  });

  it.each(["/", "/about", "/portfolio/some-project", "/admin"])("covers %j", (path) => {
    expect(matches(path)).toBe(true);
  });

  it("skips prefetches, which fetch an RSC payload rather than a document", () => {
    const entry = at(config.matcher, 0);
    if (typeof entry === "string") throw new Error("expected a matcher object");

    expect(entry.missing).toEqual(
      expect.arrayContaining([
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ])
    );
  });
});
