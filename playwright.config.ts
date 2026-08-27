import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the real app, served by `next start`, reading from a
// stubbed CMS.
//
// AGENTS.md names `cms.ts`, `getAssets.ts` and the React components as
// "untested by design ... prefer an end-to-end test for those", because unit
// testing them means mocking network or DOM heavily enough that the mock
// becomes the thing under test. This is that end-to-end test. The stub replaces
// only the CMS's HTTP boundary; everything above it — the request layer, the
// cache policy, the sanitizers, the components — is the real code.
//
// It runs the production build rather than `next dev`, because the built output
// is what Vercel serves and the two differ in the ways most likely to break a
// page: Server Component boundaries, minification, and the CSP the middleware
// attaches.

const STUB_CMS_PORT = 4010;
const APP_PORT = 3100;

export const APP_ORIGIN = `http://127.0.0.1:${APP_PORT}`;

/**
 * The environment the app runs under. `env.ts` asserts these at build time, so
 * they are supplied rather than skipped — a build that validates its
 * environment is part of what this exercises.
 */
const appEnv = {
  CMS_ENDPOINT: `http://127.0.0.1:${STUB_CMS_PORT}`,
  CMS_TOKEN: "stub-read-token",
  HYGRAPH_MUTATION_TOKEN: "stub-mutation-token",
  ADMIN_KEY: "stub-admin-key-long-enough-to-pass",
  WEBSITE_URL: APP_ORIGIN,
};

export default defineConfig({
  testDir: "./e2e",
  // Every spec here drives a shared server, and the suite is small enough that
  // the isolation is worth more than the parallelism.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // `html` in CI because the workflow uploads `playwright-report/`, and only
  // the html reporter writes it — without this the upload step would silently
  // archive nothing.
  reporter: process.env.CI
    ? [["github"], ["list"], ["html", { open: "never" }]]
    : [["list"]],

  use: {
    baseURL: APP_ORIGIN,
    trace: "on-first-retry",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: [
    {
      command: "node e2e/stub-cms.mjs",
      port: STUB_CMS_PORT,
      env: { STUB_CMS_PORT: String(STUB_CMS_PORT) },
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      // Built with the same stub environment it will serve under, since
      // `next build` evaluates `next.config.ts` and therefore `assertEnv`.
      command: "npm run build && npm run start -- -p " + APP_PORT,
      port: APP_PORT,
      env: appEnv,
      // Never reuse a server already on this port, not even locally.
      //
      // The usual `!process.env.CI` is a trap for a suite whose server is a
      // *production build*: a server left running from an earlier run is
      // serving older code, and Playwright will happily test it and report
      // green. That produced two false passes while this suite was being
      // written — a deliberately broken sanitizer and a deliberately broken
      // sitemap filter both "passed" against a stale build.
      //
      // The cost is a rebuild per local run. That is the right trade for a
      // suite whose whole purpose is to be believed.
      reuseExistingServer: false,
      // A cold production build is the slow part; the default 60s is not enough.
      timeout: 180_000,
      stdout: "pipe",
    },
  ],
});
