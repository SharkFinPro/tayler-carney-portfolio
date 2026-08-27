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
      // Deliberately global-only. Vitest also accepts per-glob thresholds, but
      // a file matching a glob key is *excluded* from the global total, so
      // locking the sanitizers at 100% that way would silently redefine the
      // headline number to mean "everything except the sanitizers". One honest
      // number beats two subtle ones.
      thresholds: {
        statements: 60,
        branches: 57,
        functions: 66,
        lines: 61,
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
