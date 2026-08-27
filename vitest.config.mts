import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest runs the pure modules in `src/lib` and `src/components/blocks` — the
// validators, the session crypto, and the rich-text AST conversions. None of
// them import `next/headers` or server-only code, so they need no mocking.
//
// The default environment is `node`; the few suites that need a DOM (the
// rich-text HTML→AST direction walks real `ChildNode`s) opt in per file with
// `// @vitest-environment happy-dom`.
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],

      // Every module that is *logic* rather than markup, whether or not a suite
      // currently reaches it. The previous list named only the directories the
      // suite already targeted, which meant the headline number could not fall
      // when untested code was added — and it quietly omitted the ~980 lines of
      // Server Actions in `src/app/admin`, which are the authorization and CMS
      // write boundary and the highest-risk code in the repo.
      //
      // `.tsx` is deliberately still absent. Rendering components needs DOM
      // mocking heavy enough to test the mocks rather than the code (AGENTS.md
      // records that call), so counting them would restore exactly the
      // meaningless-denominator problem the old list was avoiding. Components
      // are covered by end-to-end tests instead. Note this is an allowlist for
      // files the suite never imports: a `.tsx` module that *is* imported by a
      // test still appears in the report anyway, which is why SuggestAltButton.tsx
      // and AnnotatedImage.tsx are in it.
      include: [
        "src/lib/**/*.ts",
        "src/app/**/*.ts",
        "src/components/**/*.ts",
        "src/middleware.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        // Test-only helpers and the `server-only` stub.
        "src/test/**",
        // Type-only module: it compiles to nothing, so it can be neither
        // covered nor uncovered, and v8 reports it as a 0% file regardless.
        "src/lib/ai/types.ts",
        // One-line re-export barrels (`export { default } from "./Thing"`).
        // They exist for import ergonomics and hold no logic to test.
        // `src/lib/ai/index.ts` is NOT one of these — it gates the AI features
        // on env config and is real behaviour — so it is left in.
        "src/components/*/index.ts",
      ],

      // Floors, not targets: set just under today's numbers so a change that
      // *lowers* coverage fails while ordinary noise does not flap the build.
      // Raise them as the gaps close; there is no autoUpdate, because a
      // threshold that rewrites itself records nothing.
      //
      // The margins are deliberately thin — a few statements in most cases —
      // and that has a consequence worth stating plainly: adding a chunk of
      // *untested* code will fail this check even though it removed no
      // coverage. That is the intended reading, not an accident. AGENTS.md
      // already asks for a suite in the same commit as the module it covers,
      // and a ratio floor is what makes that convention enforceable rather
      // than advisory. Coverage here is deterministic (the Node 22 and 24 legs
      // emit identical tables), so a red build means the code moved, not that
      // the measurement wobbled.
      //
      // When a PR genuinely should lower the floor — deleting a well-tested
      // module, say — lower it in that same PR and say why. That is a visible,
      // reviewable decision, which is the whole point of not auto-updating.
      //
      // The glob entries below are additional, stricter checks on top of the
      // global floor rather than carve-outs from it: Vitest builds the global
      // set from every file, "even if they are included by glob patterns".
      // So the headline number still covers the whole codebase.
      thresholds: {
        statements: 84,
        branches: 75,
        functions: 85,
        lines: 86,

        // The two documents written for crawlers rather than readers, and the
        // origin they share. Nothing here fails visibly: a lost `disallow`
        // gets the admin login indexed, and a malformed sitemap directive is
        // ignored rather than reported, so the sitemap silently stops being
        // announced while robots.txt still looks correct.
        "src/{app/robots.ts,app/sitemap.ts,lib/siteUrl.ts}": {
          statements: 100,
          functions: 100,
          lines: 100,
          branches: 100,
        },

        // The authentication surface. Everything it guarantees is invisible in
        // a working app: a session cookie that stopped being httpOnly, or
        // stopped being secure in production, or a login that stopped delaying
        // failures and stopped counting them, all look exactly like a login
        // form that works. The tiered limiter in particular has an order that
        // matters — consulting the shared backstop first lets one attacker who
        // has burned their own budget drain it and lock out the real admin.
        "src/{lib/auth.ts,app/admin/actions.ts}": {
          statements: 100,
          functions: 100,
          lines: 100,
          branches: 100,
        },

        // The AI surface. Both actions sit in front of a paid call, so a guard
        // that stops guarding shows up as a bill rather than as a bug — and
        // both fetch image URLs from this process, which is why the host
        // allowlist rather than a scheme check is the thing being pinned.
        // index.ts is the promise that an unconfigured install is a working
        // install: with no key the getters return null and the UI hides its
        // entry points, which is a contract with three call sites.
        //
        // Branches sit at 89 for aiActions: a few `?? ""` arms normalising
        // model output have no reachable input that skips them.
        "src/app/admin/aiActions.ts": {
          statements: 100,
          functions: 100,
          lines: 100,
          branches: 89,
        },
        "src/lib/ai/index.ts": {
          statements: 100,
          functions: 100,
          lines: 100,
          branches: 100,
        },

        // The Content Security Policy, end to end. csp.ts says it plainly in
        // its own header: this is the one security control here whose failure
        // mode is silent, because a policy that accidentally allows
        // 'unsafe-inline' looks identical to one that doesn't until someone
        // lands an XSS. middleware.ts is the other half — the policy only
        // matters if it is actually attached, and the nonce it names only
        // works if the same value reaches the request.
        "src/{middleware.ts,lib/csp.ts}": {
          statements: 100,
          functions: 100,
          lines: 100,
          branches: 100,
        },

        // Two small helpers whose failures are equally quiet: a keyboard user
        // unable to operate an element that works fine with a mouse, and a
        // route that stops rendering dynamically because a caught error ate
        // Next's control-flow signal.
        "src/lib/{a11y,assetRef}.ts": {
          statements: 100,
          functions: 100,
          lines: 100,
          branches: 100,
        },

        // The validators that run on BOTH render and save, where AGENTS.md
        // notes a gap is a gap in two places. They are at full line coverage
        // today and a 60% global floor is far too loose to notice if one of
        // them regressed, which is exactly the module where it would matter.
        //
        // Branches sit lower than lines because each has a few defensive
        // `?? []` arms that no reachable input exercises; 93 is just under
        // global.ts, the weakest of the four.
        "src/lib/{global,home,seo,portfolio}.ts": {
          statements: 100,
          functions: 100,
          lines: 100,
          branches: 93,
        },

        // The admin write boundary. In contentActions, `model` is interpolated
        // straight into the mutation string, so the whitelists are the only
        // thing between a caller-supplied string and a GraphQL document. In
        // portfolioActions it is the two rules that are invisible in review:
        // that a reorder must never publish (SiteData is one entry, so
        // publishing a field publishes every other pending draft on the site),
        // and that the app's only permanent delete unpublishes first and
        // tolerates that failing. In mediaActions it is the upload gate: the
        // declared MIME type is forgeable, so the real leading bytes decide,
        // and next.config.ts sets dangerouslyAllowSVG — which makes a stored
        // SVG dangerous rather than merely unsupported. A branch uncovered
        // here is a branch nothing proves the shape of.
        "src/app/admin/{contentActions,portfolioActions,mediaActions}.ts": {
          statements: 100,
          functions: 100,
          lines: 100,
          branches: 100,
        },

        // The authorization boundary, and the first module AGENTS.md lists as
        // worth testing. Same reasoning: the global floor cannot see it move.
        //
        // Statements sits at 96 rather than 100 while lines is 100: v8 counts
        // the two `if (…) return false` guards as statements on lines that are
        // themselves executed, so the two metrics genuinely disagree here.
        "src/lib/session.ts": {
          statements: 96,
          functions: 100,
          lines: 100,
          branches: 88,
        },
      },

      // Note: the v4 text reporter omits rows for fully-covered files, so a
      // module at 100% shows up only in the directory aggregate. Use the lcov
      // report for a complete per-file picture.
    },
  },
  resolve: {
    // Mirrors the `paths` entries in tsconfig.json.
    alias: {
      "@/components": r("./src/components"),
      "@/styles": r("./src/styles"),
      "@/lib": r("./src/lib"),
      "@/app": r("./src/app"),
      "@/test": r("./src/test"),
      // `server-only` is a build-time guard that Next aliases away itself; it
      // is not a real installed package, so Vitest can't resolve the import.
      // Point it at an empty module — the guard is meaningless under test
      // anyway, since there is no client bundle to leak into.
      "server-only": r("./src/test/serverOnlyStub.ts"),
    },
  },
});
