// What a model actually returns when asked for alt text, and what has to
// survive the trip. The interesting cases are all "the model answered the
// question correctly but wrapped it in something".

import { describe, expect, it } from "vitest";
import {
  __OPENERS_FOR_TEST as REDUNDANT_OPENERS,
  __PREAMBLES_FOR_TEST as PREAMBLES,
  cleanAltText,
  isDescribableImageUrl,
  MAX_ALT_LENGTH,
} from "./altText";

describe("cleanAltText — non-strings and empties", () => {
  it.each([null, undefined, 42, {}, [], true])("returns empty for %j", (value) => {
    expect(cleanAltText(value)).toBe("");
  });

  it("returns empty for whitespace", () => {
    expect(cleanAltText("   \n\t  ")).toBe("");
  });
});

describe("cleanAltText — wrapper text", () => {
  it.each([
    ['Here is the alt text: "A wool coat on a dress form."', "A wool coat on a dress form."],
    ["Alt text: A wool coat on a dress form.", "A wool coat on a dress form."],
    ["Alt: A wool coat on a dress form.", "A wool coat on a dress form."],
    ["Description: A wool coat on a dress form.", "A wool coat on a dress form."],
    ['"A wool coat on a dress form."', "A wool coat on a dress form."],
    ["\u201CA wool coat on a dress form.\u201D", "A wool coat on a dress form."],
  ])("unwraps %j", (input, expected) => {
    expect(cleanAltText(input)).toBe(expected);
  });

  it("leaves a quote that is part of the description alone", () => {
    expect(cleanAltText('A label reading "sample" pinned to the hem.')).toBe(
      'A label reading "sample" pinned to the hem.'
    );
  });
});

describe("cleanAltText — redundant openers", () => {
  // A screen reader announces "image" before reading the alt text, so these
  // openers make it say so twice.
  it.each([
    ["Image of a bias-cut wool panel.", "A bias-cut wool panel."],
    ["A photo of a bias-cut wool panel.", "A bias-cut wool panel."],
    ["Photograph of a bias-cut wool panel.", "A bias-cut wool panel."],
    ["This image shows a bias-cut wool panel.", "A bias-cut wool panel."],
    ["A picture of a bias-cut wool panel.", "A bias-cut wool panel."],
  ])("strips the opener in %j", (input, expected) => {
    expect(cleanAltText(input)).toBe(expected);
  });

  it("re-capitalizes what is left", () => {
    expect(cleanAltText("Image of the shoulder seam.")).toBe("The shoulder seam.");
  });

  it("keeps an 'image' that is the subject rather than the framing", () => {
    expect(cleanAltText("A printed image pinned to the studio wall.")).toBe(
      "A printed image pinned to the studio wall."
    );
  });

  it("strips at most one opener, so it cannot eat the description", () => {
    expect(cleanAltText("Photo of a photo of the toile.")).toBe("A photo of the toile.");
  });
});

describe("cleanAltText — shape", () => {
  it("flattens newlines into a single line", () => {
    expect(cleanAltText("A wool coat\non a dress form,\n\nseen from the front.")).toBe(
      "A wool coat on a dress form, seen from the front."
    );
  });

  it("removes control characters", () => {
    expect(cleanAltText("A wool\u0007 coat\u0000.")).toBe("A wool coat .");
  });

  it("removes markdown emphasis", () => {
    expect(cleanAltText("A **bias-cut** wool panel.")).toBe("A bias-cut wool panel.");
    expect(cleanAltText("A *bias-cut* wool panel.")).toBe("A bias-cut wool panel.");
  });

  it("keeps an asterisk that is not emphasis", () => {
    expect(cleanAltText("Pattern piece marked 2 * fold.")).toBe("Pattern piece marked 2 * fold.");
  });
});

describe("cleanAltText — length", () => {
  it("leaves anything within the cap untouched", () => {
    const text = "A".repeat(MAX_ALT_LENGTH);
    expect(cleanAltText(text)).toBe(text);
  });

  it("truncates a paragraph at a word boundary", () => {
    const long = `${"wool ".repeat(80)}coat`;
    const out = cleanAltText(long);
    expect(out.length).toBeLessThanOrEqual(MAX_ALT_LENGTH + 1);
    expect(out.endsWith("\u2026")).toBe(true);
    // Cut between words, not inside one.
    expect(out.slice(0, -1)).not.toMatch(/wo$|woo$/);
  });

  it("cuts a single unbroken run rather than returning it whole", () => {
    const out = cleanAltText("x".repeat(MAX_ALT_LENGTH * 2));
    expect(out.length).toBeLessThanOrEqual(MAX_ALT_LENGTH + 1);
  });

  it("does not leave dangling punctuation before the ellipsis", () => {
    const out = cleanAltText(`${"a word, ".repeat(60)}end`);
    expect(out).not.toMatch(/[,;:\-]\u2026$/);
  });
});

describe("isDescribableImageUrl", () => {
  it.each([
    "https://media.graphassets.com/abc123",
    "https://us-west-2.graphassets.com/cl123/xyz",
    "https://graphassets.com/abc",
  ])("allows the asset host %j", (url) => {
    expect(isDescribableImageUrl(url)).toBe(true);
  });

  it.each([
    // Substring matching would have let both of these through.
    "https://graphassets.com.evil.test/x.jpg",
    "https://evil.test/fetch?u=media.graphassets.com",
    // Not https.
    "http://media.graphassets.com/abc123",
    "file:///etc/passwd",
    // Internal addresses, the reason an allowlist exists at all.
    "http://169.254.169.254/latest/meta-data/",
    "https://localhost/admin",
    // Not a URL.
    "media.graphassets.com/abc",
    "",
  ])("rejects %j", (url) => {
    expect(isDescribableImageUrl(url)).toBe(false);
  });

  it.each([null, undefined, 42, {}, []])("rejects the non-string %j", (value) => {
    expect(isDescribableImageUrl(value)).toBe(false);
  });
});

// ── Every entry in every table ───────────────────────────────────────────────
//
// The blocks above test a representative from each table: one or two quote
// styles, five of the seventeen redundant openers. Mutation testing showed
// what that leaves — sixty survivors in this file, nearly all of them a table
// entry blanked to "" with nothing noticing, because the entries that *were*
// tested kept passing.
//
// Each entry gets its own case below, written as a literal rather than driven
// from the table. That is the opposite of the choice made in home.test.ts, and
// deliberately so: there the constant IS the output, so copying it into the
// test would compare a value to itself. Here the table is a *rule* applied to
// independent input, so a literal input exercises the rule and a blanked entry
// stops stripping it. Driving these from the table would reintroduce exactly
// the circularity — blank `"image of"` and both the rule and the test's input
// lose it together.
//
// The drift risk that creates — someone adds an opener and no case covers it —
// is closed by the count assertions at the end of each block, which read the
// real tables.

// Two fixtures, because only one code path re-capitalizes. Stripping a
// redundant opener leaves the sentence headless and puts a capital back;
// unquoting and preamble-stripping deliberately do not touch the case, so
// those cases start from a subject that is already capitalized.
const HEADLESS = "a bias-cut wool panel.";
const SUBJECT = "A bias-cut wool panel.";

describe("cleanAltText — every redundant opener", () => {
  // A screen reader has already announced "image" by the time it reads this,
  // so every one of these makes it say so twice.
  const OPENERS = [
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

  it.each(OPENERS)("strips %j", (opener) => {
    expect(cleanAltText(`${opener} ${HEADLESS}`)).toBe(SUBJECT);
  });

  it.each(OPENERS)("strips %j whatever its casing", (opener) => {
    expect(cleanAltText(`${opener.toUpperCase()} ${HEADLESS}`)).toBe(SUBJECT);
  });

  // Guards the copy above against the table growing without a case. Reads the
  // real list, so it fails when someone adds an opener and stops here.
  it("covers every opener the module actually strips", () => {
    expect(new Set(OPENERS).size).toBe(REDUNDANT_OPENERS.length);
    for (const opener of REDUNDANT_OPENERS) {
      expect(OPENERS, `no case covers ${opener}`).toContain(opener);
    }
  });

  // The match is on a whole leading phrase followed by a space, so a word that
  // merely starts the same way is not an opener.
  it.each(["Imagery of the studio wall.", "Photographic prints on the wall."])(
    "leaves %j alone",
    (input) => {
      expect(cleanAltText(input)).toBe(input);
    }
  );
});

describe("cleanAltText — every quote style", () => {
  // Models wrap the answer in whichever quote character they favour, and a
  // curly pair is what arrives when the text has been through a chat UI.
  it.each([
    ['"', '"', "straight double"],
    ["'", "'", "straight single"],
    ["“", "”", "curly double"],
    ["‘", "’", "curly single"],
  ])("unwraps a %s%s pair (%s)", (open, close) => {
    expect(cleanAltText(`${open}${SUBJECT}${close}`)).toBe(SUBJECT);
  });

  // Only a *matching* pair is a wrapper. A stray quote at one end is part of
  // the description, and eating it would change what the sentence says.
  it.each([
    `"${SUBJECT}`,
    `${SUBJECT}"`,
    `“${SUBJECT}`,
    `'${SUBJECT}`,
    `"${SUBJECT}”`,
  ])("leaves the unmatched quote in %j alone", (input) => {
    expect(cleanAltText(input)).toBe(input);
  });

  // One layer only: a doubly quoted answer keeps its inner quotes, which are
  // as likely to be part of the text as not.
  it("strips one layer of quotes rather than all of them", () => {
    expect(cleanAltText(`""${SUBJECT}""`)).toBe(`"${SUBJECT}"`);
  });
});

describe("cleanAltText — every preamble", () => {
  it.each([
    "Here is the alt text:",
    "Here's the alt text:",
    "Here is alt text:",
    "Here is a alt text:",
    "Alt text:",
    "Alt text -",
    "Alt:",
    "Alt -",
    "Description:",
    "Description -",
  ])("strips the preamble %j", (preamble) => {
    expect(cleanAltText(`${preamble} ${SUBJECT}`)).toBe(SUBJECT);
  });

  it("unwraps a quoted answer that a preamble introduced", () => {
    expect(cleanAltText(`Alt text: "${SUBJECT}"`)).toBe(SUBJECT);
  });

  // Only at the start, so a description that mentions its own subject keeps it.
  it("leaves a mid-sentence mention alone", () => {
    const input = "A tag whose description: field is blank.";
    expect(cleanAltText(input)).toBe(input);
  });

  it("covers every preamble the module actually strips", () => {
    // Each regex is anchored at the start; the count is what guards the copy.
    expect(PREAMBLES.length).toBe(4);
  });
});

// ── The edges the tables' happy paths do not reach ───────────────────────────
//
// A second pass driven by what survived the first. Each case below exists
// because a specific one-character change to altText.ts passed every other
// test in this file.

describe("cleanAltText — quote matching is a pair, not an ending", () => {
  // Blanking the OPEN character of a pair leaves `startsWith("")` always true,
  // so the rule degenerates into "ends with a quote" and eats the first
  // character of anything that happens to finish with one.
  it.each([
    ["'", "straight single"],
    ["’", "curly single"],
    ['"', "straight double"],
    ["”", "curly double"],
  ])("does not strip a trailing %s (%s) with no opener", (close) => {
    const input = `A tag marked ${close}`;
    expect(cleanAltText(input)).toBe(input);
  });

  // The length guard: a bare pair with nothing between it is two characters,
  // and slicing it must yield nothing rather than leaving the quotes behind.
  it.each(['""', "''", "“”", "‘’"])(
    "reduces the empty quoted string %j to nothing",
    (input) => {
      expect(cleanAltText(input)).toBe("");
    }
  );
});

describe("cleanAltText — preambles are anchored to the start", () => {
  // Without the ^ anchor these strip mid-sentence, silently deleting words
  // from the middle of a description that happens to mention them.
  it.each([
    "A field labelled alt text: on the spec sheet.",
    "A column headed description: beside the swatch.",
    "The note says here is the alt text: in full.",
  ])("leaves the mid-sentence mention in %j intact", (input) => {
    expect(cleanAltText(input)).toBe(input);
  });

  // The separator after "here is the alt text" is optional, so the form with
  // none at all still has to be recognized.
  it("strips a preamble that runs straight into the answer", () => {
    expect(cleanAltText("Here is the alt text A bias-cut wool panel.")).toBe(
      "A bias-cut wool panel."
    );
  });
});

describe("cleanAltText — whitespace and control characters collapse", () => {
  // The `+` on each character class: without it only one character of a run is
  // replaced, leaving the rest.
  it("collapses a run of control characters into a single space", () => {
    expect(cleanAltText("A panel\u0000\u0001\u0002and a seam.")).toBe("A panel and a seam.");
  });

  it("collapses a run of spaces into one", () => {
    expect(cleanAltText("A panel     and a seam.")).toBe("A panel and a seam.");
  });

  it("collapses mixed whitespace into one space", () => {
    expect(cleanAltText("A panel \t\n  and a seam.")).toBe("A panel and a seam.");
  });

  it("trims what is left rather than returning a padded string", () => {
    expect(cleanAltText("   A panel.   ")).toBe("A panel.");
  });
});

describe("cleanAltText — markdown emphasis at the edges", () => {
  // The lookahead is `(?=\s|$)`, so emphasis closing at the very end of the
  // string has to be handled as well as emphasis mid-sentence.
  it("removes emphasis that ends the string", () => {
    expect(cleanAltText("A panel in *charcoal*")).toBe("A panel in charcoal");
  });

  // The leading alternation is `(^|\s)`, so emphasis opening the string counts.
  it("removes emphasis that opens the string", () => {
    expect(cleanAltText("*Charcoal* wool panel.")).toBe("Charcoal wool panel.");
  });

  it("removes underscore emphasis the same way", () => {
    expect(cleanAltText("_Charcoal_ wool panel.")).toBe("Charcoal wool panel.");
  });
});

describe("cleanAltText — truncation lands on a word boundary", () => {
  const word = "panel";
  // A sentence of short words, so the last space sits comfortably past the
  // 60%-of-limit threshold that decides whether to use it.
  const long = `${`${word} `.repeat(80)}end.`;

  it("cuts at a space, never mid-word", () => {
    const out = cleanAltText(long);

    expect(out.length).toBeLessThanOrEqual(MAX_ALT_LENGTH + 1);
    expect(out.endsWith("…")).toBe(true);
    // Every word before the ellipsis survives whole.
    for (const token of out.slice(0, -1).trim().split(" ")) {
      expect(token).toBe(word);
    }
  });

  it("does not leave a trailing space before the ellipsis", () => {
    expect(cleanAltText(long)).not.toMatch(/\s…$/);
  });

  // When the only "word" is longer than the cap, there is no boundary worth
  // honouring and the cut has to happen mid-run anyway.
  it("cuts an unbroken run mid-word rather than returning it whole", () => {
    const out = cleanAltText("x".repeat(MAX_ALT_LENGTH * 2));

    expect(out.length).toBeLessThanOrEqual(MAX_ALT_LENGTH + 1);
    expect(out.endsWith("…")).toBe(true);
  });

  // A single early space, far below the threshold, is not a boundary worth
  // cutting back to — doing so would throw away most of the description.
  it("ignores a word boundary too early to be worth using", () => {
    const out = cleanAltText(`A ${"x".repeat(MAX_ALT_LENGTH * 2)}`);

    expect(out.length).toBeGreaterThan(MAX_ALT_LENGTH * 0.6);
  });
});

describe("isDescribableImageUrl — non-strings", () => {
  it.each([null, undefined, 42, {}, [], true, new URL("https://media.graphassets.com/a")])(
    "refuses the non-string %j",
    (value) => {
      expect(isDescribableImageUrl(value)).toBe(false);
    }
  );
});

describe("cleanAltText — the last few edges", () => {
  // Blanking the CLOSE character of a pair makes `endsWith("")` always true,
  // degenerating the rule into "starts with a quote" — the mirror of the
  // trailing-quote case above.
  it.each([
    ["'", "straight single"],
    ["‘", "curly single"],
    ['"', "straight double"],
    ["“", "curly double"],
  ])("does not strip a leading %s (%s) with no closer", (open) => {
    const input = `${open}sample pinned to the hem`;
    expect(cleanAltText(input)).toBe(input);
  });

  // One character is both the start and the end of itself, so without the
  // length guard a lone quote slices away to nothing.
  it.each(['"', "'", "“", "‘"])("keeps a lone %s rather than slicing it away", (quote) => {
    expect(cleanAltText(quote)).toBe(quote);
  });

  // The tail strip runs on the truncated body, and it removes a RUN of
  // trailing punctuation rather than one character — a body ending ", " has
  // both to go before the ellipsis.
  it("removes a whole run of trailing punctuation before the ellipsis", () => {
    const body = "wool, ".repeat(60);
    const out = cleanAltText(body);

    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/[\s,;:.\-]…$/);
    // And what remains is a word, not a fragment of punctuation.
    expect(out.slice(0, -1)).toMatch(/wool$/);
  });
});
