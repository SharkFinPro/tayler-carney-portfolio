// The two predicates that decide whether an embedded rich-text image is served
// through next/image or as a raw <img>. Both failure directions are silent:
// wrongly optimizing an off-host URL throws at request time, and wrongly
// accepting missing dimensions renders a 0x0 box that looks like nothing at
// all.

import { describe, expect, it } from "vitest";
import { hasDimensions, isOptimizable } from "./RichTextWidget";

describe("isOptimizable", () => {
  it.each([
    "https://media.graphassets.com/abc123",
    "https://eu-west-2.graphassets.com/cl1/xyz.jpg",
    "HTTPS://MEDIA.GRAPHASSETS.COM/abc",
  ])("accepts the CMS asset host %j", (src) => {
    expect(isOptimizable(src)).toBe(true);
  });

  it.each([
    // next.config.ts only allowlists graphassets for the optimizer; anything
    // else would throw at request time rather than degrade.
    "https://images.unsplash.com/photo-1",
    "https://graphassets.com.evil.test/x.jpg",
    "http://media.graphassets.com/abc",
    "/local/image.png",
    "",
  ])("rejects %j", (src) => {
    expect(isOptimizable(src)).toBe(false);
  });

  it.each([null, undefined, 42, {}, []])("rejects the non-string %j", (src) => {
    expect(isOptimizable(src)).toBe(false);
  });
});

describe("hasDimensions", () => {
  it.each([
    [1600, 1200],
    ["1600", "1200"],
    [1, 1],
  ])("accepts %j x %j", (w, h) => {
    expect(hasDimensions(w, h)).toBe(true);
  });

  it.each([
    // `Number(null)` and `Number("")` are both 0, and 0 is finite — so a
    // finiteness check passed these and handed next/image a 0x0 box.
    [null, 1200],
    [1600, null],
    ["", ""],
    [0, 0],
    [1600, 0],
    [-100, 200],
    [undefined, undefined],
    ["wide", "tall"],
    [NaN, NaN],
    [{}, []],
  ])("rejects %j x %j", (w, h) => {
    expect(hasDimensions(w, h)).toBe(false);
  });
});
