// Resolve the alt text for an image. Prefer the author-supplied `altText`
// from the Hygraph Asset; fall back to a sensible derived string when it has
// not been authored yet. (There is no "decorative" flag in the schema, so an
// empty altText is treated as "not yet written", not "decorative".)
export function resolveAlt(altText: string | null | undefined, fallback: string): string {
  const t = altText?.trim();
  return t ? t : fallback;
}
