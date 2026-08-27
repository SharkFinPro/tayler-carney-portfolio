import { expect, test } from "@playwright/test";
import { COAT } from "./fixtures.mjs";
import { APP_ORIGIN } from "../playwright.config";

// The middleware and the two generated documents can only be checked against a
// running server. `middleware.ts` is unit-tested for what it returns, but not
// for whether Next actually runs it on a real request — a matcher that stopped
// matching would leave every unit test green and every response unprotected.

test("every page response carries a CSP with a per-request nonce", async ({ request }) => {
  const first = await request.get("/");
  const second = await request.get("/portfolio");

  const csp = first.headers()["content-security-policy"];
  expect(csp, "no CSP header on the response").toBeTruthy();
  expect(csp).toContain("default-src");

  const nonceOf = (header: string | undefined) => header?.match(/'nonce-([^']+)'/)?.[1];
  const firstNonce = nonceOf(csp);
  const secondNonce = nonceOf(second.headers()["content-security-policy"]);

  expect(firstNonce, "CSP carried no nonce").toBeTruthy();
  // Reused across requests, a nonce protects nothing — an injected script
  // could carry a previously observed one.
  expect(secondNonce).not.toBe(firstNonce);
});

test("robots.txt points at a sitemap that is actually served there", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);

  const body = await robots.text();
  const advertised = body.match(/Sitemap:\s*(\S+)/i)?.[1];
  expect(advertised, "robots.txt advertised no sitemap").toBeTruthy();

  // The point of the assertion: not that a URL is present, but that fetching
  // the one advertised returns the sitemap. A trailing-slash or double-slash
  // bug in the base URL produces a plausible-looking line pointing nowhere.
  expect(advertised).toBe(`${APP_ORIGIN}/sitemap.xml`);

  const sitemap = await request.get(advertised as string);
  expect(sitemap.status()).toBe(200);
});

test("the sitemap lists the projects the portfolio shows", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);

  const xml = await response.text();
  expect(xml).toContain(`${APP_ORIGIN}/portfolio/${COAT.slug}`);
  // Archived projects are still real pages with real URLs; they are only
  // hidden from the grid. Dropping them from the sitemap would deindex them.
  expect(xml).toContain("/portfolio/");
});

test("the admin dashboard redirects an unauthenticated visitor to the login", async ({ page }) => {
  await page.goto("/admin");

  await expect(page).toHaveURL(/\/admin\/login/);
});
