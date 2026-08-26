// What a model actually returns when asked for alt text, and what has to
// survive the trip. The interesting cases are all "the model answered the
// question correctly but wrapped it in something".

import { describe, expect, it } from "vitest";
import { cleanAltText, isDescribableImageUrl, MAX_ALT_LENGTH } from "./altText";

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
