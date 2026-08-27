// The site's own origin, normalized.
//
// Shared by `robots.ts` and `sitemap.ts` rather than duplicated, because the
// two have to agree: robots advertises `${base}/sitemap.xml`, and sitemap.ts
// emits `${base}/...` for every entry. If they normalized differently, robots
// would point at a URL the sitemap does not live at, and neither file would
// look wrong on its own.
//
// The `trim()` is the part with a real deployment behind it. `validateEnv`
// checks a *trimmed copy* of WEBSITE_URL, but never rewrites `process.env`, so
// a value like "https://site.example\n" — which is what a secret mounted from
// a file or a `.env` line with a stray newline gives you — passes the build's
// env assertion and then arrives here intact. The old single-slash strip did
// not match a trailing newline, so the raw value flowed straight into
// `${base}/sitemap.xml` and robots advertised a URL with a newline in it.
//
// Both callers treat an empty result as "we do not know our own address" and
// omit rather than emit, since a relative sitemap directive is invalid and so
// worse than saying nothing. That only holds if a present-but-unusable value
// also comes back empty, which is the other half of what `trim()` buys.
//
// The trailing-slash strip is `/+$` rather than `/$` because one pass removes
// a single slash, so a value ending in "//" still produced a doubled separator
// downstream.

/** `WEBSITE_URL` with surrounding space and trailing slashes removed, or "". */
export function siteBaseUrl(raw: string | undefined = process.env.WEBSITE_URL): string {
  return (raw ?? "").trim().replace(/\/+$/, "");
}
