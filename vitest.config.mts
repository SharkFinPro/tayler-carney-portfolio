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
      // Only the modules the suite actually targets — reporting 0% for React
      // components nothing here tests would make the number meaningless.
      include: ["src/lib/**/*.ts", "src/components/blocks/**/*.ts"],
      exclude: ["**/*.test.ts"],
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
    },
  },
});
