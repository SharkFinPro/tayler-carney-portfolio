// The site's own origin, normalized.
//
// Shared by `robots.ts` and `sitemap.ts` rather than duplicated, because the
// two have to agree: robots advertises `${base}/sitemap.xml`, and sitemap.ts
// emits `${base}/...` for every entry. If they normalized differently, robots
// would point at a URL the sitemap does not live at, and neither file would
// look wrong on its own.
//
// Both callers treat an empty result as "we do not know our own address" and
// omit rather than emit — a relative sitemap directive is invalid, so it is
// worse than saying nothing. That only works if a value which is *present but
// unusable* also comes back empty, which is what `trim()` is for here: a
// WEBSITE_URL of "   " is truthy, and without the trim it produced the exact
// invalid directive ("   /sitemap.xml") the omission exists to avoid.
//
// The trailing-slash strip is `/+$` rather than `/$` for the same reason: one
// pass removed a single slash, so a value ending in "//" still produced a
// doubled separator downstream.

/** `WEBSITE_URL` with surrounding space and trailing slashes removed, or "". */
export function siteBaseUrl(raw: string | undefined = process.env.WEBSITE_URL): string {
  return (raw ?? "").trim().replace(/\/+$/, "");
}
