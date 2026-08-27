import { expect, test } from "@playwright/test";
import { ARCHIVED, COAT, FIRST_STAT, HOME, JACKET } from "./fixtures.mjs";

// What these cover that the unit suite cannot: the whole path from a CMS
// response to rendered HTML. `cms.ts` does the real POST, `cachedReads` applies
// the real stage/cache policy, the sanitizers run on real CMS-shaped JSON, and
// the Server Components render it.
//
// Every assertion below is on a value that exists only in the fixture. That
// matters more here than it looks: `sanitizeHome` supplies a complete set of
// defaults, so a homepage that received nothing at all still renders a full
// page. Asserting on "a headline is present" would pass with the CMS
// disconnected entirely — only a fixture-specific string can tell the
// difference.

test("the homepage renders content from the CMS, not its defaults", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText(HOME.hero.headline).first()).toBeVisible();
  await expect(page.getByText(HOME.hero.eyebrow).first()).toBeVisible();
  // A stat from the hero's data panel, which is a separate branch of the
  // sanitizer from the headline strings.
  await expect(page.getByText(FIRST_STAT.key).first()).toBeVisible();
});

test("the portfolio grid lists the projects the config does not archive", async ({ page }) => {
  await page.goto("/portfolio");

  for (const project of [COAT, JACKET]) {
    await expect(page.getByText(project.title).first()).toBeVisible();
  }

  // The fixture's third project is archived in the SiteData `portfolio` field.
  // Without this the test would pass on a grid that ignored the config and
  // rendered all three — the two assertions above cannot tell those apart.
  await expect(page.getByText(ARCHIVED.title)).toHaveCount(0);
});

test("the portfolio orders projects by the config, not by the CMS response", async ({ page }) => {
  await page.goto("/portfolio");

  // The stub returns project 1 before project 2; the config orders 2 first. If
  // the config were ignored, the CMS order would win and this would fail.
  const titles = await page.getByRole("link").allInnerTexts();
  const joined = titles.join("\n");

  expect(joined).toContain(JACKET.title);
  expect(joined.indexOf(JACKET.title)).toBeLessThan(joined.indexOf(COAT.title));
});

test("a project detail page renders the project the slug names", async ({ page }) => {
  await page.goto(`/portfolio/${COAT.slug}`);

  await expect(page.getByText(COAT.title).first()).toBeVisible();
});

// KNOWN BUG, found by this test on the day it was written. An unknown project
// slug renders the 404 UI correctly but serves it with HTTP 200 — a "soft
// 404", which search engines index as a real page rather than dropping it.
//
// `test.fail()` rather than a deleted test or an assertion on the wrong
// behaviour: this records what the response *should* be, stays green while the
// bug exists, and turns red the moment it starts passing, so the fix cannot
// land unnoticed.
//
// Not for want of looking. Ruled out by bisecting against a production build,
// each with its own `next build` and a direct `curl`:
//
//   - `notFound()` itself works — a bare probe route returns 404, and so does
//     one behind a dynamic `[slug]` segment.
//   - Not the middleware: the probe returns 404 with the CSP middleware active.
//   - Not `loading.tsx` (the Suspense-boundary explanation), removed and rebuilt.
//   - Not `generateMetadata` resolving before the page: calling `notFound()`
//     there instead of returning a "Project Not Found" title changes nothing.
//   - Not `isAuthed()` or `cmsRead()`: probes awaiting each still return 404.
//
// An unrouted URL (`/definitely-not-a-route`) returns a correct 404 throughout,
// so this is specific to this route.
test.fail("an unknown project slug is a 404, not an empty page", async ({ page }) => {
  const response = await page.goto("/portfolio/no-such-project");

  expect(response?.status()).toBe(404);
});

test("the site's own pages are reachable", async ({ page }) => {
  for (const path of ["/about", "/atelier", "/contact"]) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} should render`).toBe(200);
  }
});
