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

// The status, not just the body. These returned 200 while rendering the 404
// UI until the layout guard landed — a soft 404, which search engines index as
// a real page, so a retired project would never drop out of results.
//
// Cause: `loading.tsx` puts the page in a Suspense boundary, and Next commits
// the 200 when that boundary is reached, before the page's `notFound()` runs.
// The layout runs outside the boundary, which is why the guard lives there.
test("an unknown project slug is a 404, not an empty page", async ({ page }) => {
  const response = await page.goto("/portfolio/no-such-project");

  expect(response?.status()).toBe(404);
});

// An archived project is a real entry in the CMS that the public must not
// reach: it is dropped from the grid and from the sitemap, so serving it a 200
// would contradict both.
test("an archived project 404s for a visitor who is not signed in", async ({ page }) => {
  const response = await page.goto(`/portfolio/${ARCHIVED.slug}`);

  expect(response?.status()).toBe(404);
});
test("the site's own pages are reachable", async ({ page }) => {
  for (const path of ["/about", "/atelier", "/contact"]) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} should render`).toBe(200);
  }
});
