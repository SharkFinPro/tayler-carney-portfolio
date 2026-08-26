// The trust boundary for generated alt text.
//
// `toBlocks.ts` is the equivalent for drafted pages: model output never reaches
// stored content without passing through a function whose whole job is to
// assume the output is wrong. The stakes are lower here — alt text lands in an
// `alt` attribute, which React escapes — but the failure modes are real and
// specific, and they are the ones this module fixes:
//
//   - Models like to answer with a sentence about the request ("Here is the alt
//     text:") or to wrap the answer in quotes.
//   - They open with "Image of…" or "A photo of…", which a screen reader reads
//     immediately after announcing that the element is an image. Twice is worse
//     than once.
//   - They will happily write a paragraph. Alt text is a label, not a caption.
//
// It also holds the guard for the other direction — which images may be sent
// out at all. Both are the same boundary seen from opposite sides, and both are
// pure, so the rules are testable without a key or a network call.

/**
 * Hard cap on generated alt text.
 *
 * No spec sets a limit; the widely used guideline is around 125 characters,
 * which is what the prompt asks for. This is the backstop for when the model
 * ignores that, set high enough that a legitimately detailed description of a
 * complex garment survives intact.
 */
export const MAX_ALT_LENGTH = 250;

/**
 * Openers a screen reader has already said by the time it reads the alt text.
 * Matched only at the start, case-insensitively.
 */
const REDUNDANT_OPENERS = [
  "this image shows",
  "the image shows",
  "this photo shows",
  "the photo shows",
  "image showing",
  "photo showing",
  "an image of",
  "a image of",
  "image of",
  "a photograph of",
  "photograph of",
  "a photo of",
  "photo of",
  "a picture of",
  "picture of",
  "a screenshot of",
  "screenshot of",
];

/** Wrapper text a model adds around the answer rather than as the answer. */
const PREAMBLES = [
  /^here(?:'s| is) (?:the |some |a )?alt text[:\-\s]*/i,
  /^alt text[:\-\s]+/i,
  /^alt[:\-\s]+/i,
  /^description[:\-\s]+/i,
];

/** Strip one layer of matching quotes, straight or curly. */
function unquote(s: string): string {
  const pairs: [string, string][] = [
    ['"', '"'],
    ["'", "'"],
    ["\u201C", "\u201D"],
    ["\u2018", "\u2019"],
  ];
  for (const [open, close] of pairs) {
    if (s.length >= 2 && s.startsWith(open) && s.endsWith(close)) {
      return s.slice(1, -1).trim();
    }
  }
  return s;
}

/** Truncate at the last word boundary that fits, rather than mid-word. */
function truncate(s: string, limit: number): string {
  if (s.length <= limit) return s;
  const cut = s.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  // A "word" longer than the whole limit is not a word; cut it anyway.
  const body = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${body.replace(/[\s,;:.\-]+$/, "")}\u2026`;
}

/**
 * Reduce arbitrary model output to usable alt text, or to an empty string.
 *
 * Returns "" rather than throwing for anything unusable, so a caller can treat
 * "no suggestion" as an ordinary outcome — which it is.
 */
export function cleanAltText(raw: unknown): string {
  if (typeof raw !== "string") return "";

  // Control characters and newlines: alt text is a single attribute value.
  let s = raw.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";

  s = unquote(s);

  for (const preamble of PREAMBLES) {
    const next = s.replace(preamble, "").trim();
    if (next !== s) {
      // A preamble often wraps a quoted answer.
      s = unquote(next);
      break;
    }
  }

  const lower = s.toLowerCase();
  for (const opener of REDUNDANT_OPENERS) {
    if (lower.startsWith(`${opener} `)) {
      const rest = s.slice(opener.length + 1).trim();
      // Re-capitalize, since the sentence just lost its first words.
      s = rest.charAt(0).toUpperCase() + rest.slice(1);
      break;
    }
  }

  // Markdown emphasis is never wanted in an attribute value.
  s = s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|\s)[*_](\S[^*_]*\S)[*_](?=\s|$)/g, "$1$2");

  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";

  return truncate(s, MAX_ALT_LENGTH);
}

/**
 * Whether a URL may be handed to the provider to fetch and describe.
 *
 * The admin is trusted, but "trusted" is not the same as "should be able to
 * point an external service at an arbitrary URL". Every image this feature
 * describes is a Media Library asset and every Media Library asset is served
 * from Hygraph, so an allowlist costs nothing and closes the hole.
 *
 * Matched on the parsed hostname, not by substring: `graphassets.com.evil.test`
 * and `https://evil.test/?x=graphassets.com` both have to fail.
 */
export function isDescribableImageUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" &&
      (hostname === "graphassets.com" || hostname.endsWith(".graphassets.com"))
    );
  } catch {
    return false;
  }
}
