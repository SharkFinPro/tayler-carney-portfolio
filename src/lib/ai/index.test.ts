// Provider selection, and the promise that an unconfigured install is a
// working install.
//
// Every AI feature here is optional: with no key the getters return null, the
// Server Actions report the feature unavailable, and the admin UI hides its
// entry points. That is a contract with three call sites and no test, and its
// failure mode is a broken button or a runtime error on a site whose owner
// never asked for AI at all.
//
// The model-chain parser is the other half. It reads an optional env var whose
// whole reason to exist is that the default model stopped answering — so a
// typo in it must fall back to the provider's defaults rather than throw and
// take the feature offline at the moment it is most needed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { at } from "@/test/at";

const createGeminiGenerator = vi.hoisted(() => vi.fn());
const createGeminiDescriber = vi.hoisted(() => vi.fn());

vi.mock("./gemini", () => ({ createGeminiGenerator, createGeminiDescriber }));

const {
  getImageDescriber,
  getPageGenerator,
  isImageDescriptionConfigured,
  isPageGenerationConfigured,
} = await import("./index");

/** The model chain the factory was handed. */
const chainGivenTo = (factory: ReturnType<typeof vi.fn>) => at(factory.mock.calls, 0)[1];

beforeEach(() => {
  createGeminiGenerator.mockReset().mockReturnValue({ name: "gemini-generator" });
  createGeminiDescriber.mockReset().mockReturnValue({ name: "gemini-describer" });
  vi.stubEnv("GEMINI_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("an install with no key configured", () => {
  // Not merely "returns null" — the point is that nothing is constructed, so
  // no SDK client is built and no key-shaped error can be thrown.
  it.each([undefined, "", "   ", "\t\n"])(
    "reports both features unavailable when the key is %j",
    (key) => {
      vi.stubEnv("GEMINI_API_KEY", key as string);

      expect(isPageGenerationConfigured()).toBe(false);
      expect(isImageDescriptionConfigured()).toBe(false);
      expect(getPageGenerator()).toBeNull();
      expect(getImageDescriber()).toBeNull();
      expect(createGeminiGenerator).not.toHaveBeenCalled();
      expect(createGeminiDescriber).not.toHaveBeenCalled();
    }
  );
});

describe("an install with a key", () => {
  it("reports both features available", () => {
    expect(isPageGenerationConfigured()).toBe(true);
    expect(isImageDescriptionConfigured()).toBe(true);
  });

  it("builds each provider with the trimmed key", () => {
    vi.stubEnv("GEMINI_API_KEY", "  padded-key  ");

    expect(getPageGenerator()).toEqual({ name: "gemini-generator" });
    expect(getImageDescriber()).toEqual({ name: "gemini-describer" });
    expect(at(createGeminiGenerator.mock.calls, 0)[0]).toBe("padded-key");
    expect(at(createGeminiDescriber.mock.calls, 0)[0]).toBe("padded-key");
  });

  // The availability checks are used to decide whether to render a button, so
  // they must not pay for constructing a client.
  it("answers the availability questions without building anything", () => {
    isPageGenerationConfigured();
    isImageDescriptionConfigured();

    expect(createGeminiGenerator).not.toHaveBeenCalled();
    expect(createGeminiDescriber).not.toHaveBeenCalled();
  });
});

describe("the model-chain override", () => {
  it("leaves the provider's own defaults alone when unset", () => {
    getPageGenerator();
    expect(chainGivenTo(createGeminiGenerator)).toBeUndefined();
  });

  it.each([
    ["", "empty"],
    ["   ", "whitespace"],
    [",,,", "all commas"],
    [" , , ", "commas and spaces"],
  ])("falls back to the defaults for the unparseable value %j (%s)", (raw) => {
    vi.stubEnv("GEMINI_PAGE_MODEL", raw);
    getPageGenerator();

    // Deliberately not a throw: a typo in an optional env var must not take
    // the feature offline.
    expect(chainGivenTo(createGeminiGenerator)).toBeUndefined();
  });

  it("reads a single name as a chain of one, which pins the model", () => {
    vi.stubEnv("GEMINI_PAGE_MODEL", "gemini-only");
    getPageGenerator();

    expect(chainGivenTo(createGeminiGenerator)).toEqual(["gemini-only"]);
  });

  it("preserves order, which is the fallback order", () => {
    vi.stubEnv("GEMINI_PAGE_MODEL", "first,second,third");
    getPageGenerator();

    expect(chainGivenTo(createGeminiGenerator)).toEqual(["first", "second", "third"]);
  });

  it("tolerates the spacing a human would actually type", () => {
    vi.stubEnv("GEMINI_PAGE_MODEL", " first , second ,, third , ");
    getPageGenerator();

    expect(chainGivenTo(createGeminiGenerator)).toEqual(["first", "second", "third"]);
  });

  // Separately overridable on purpose: alt text is one sentence about one
  // image and is called far more often, so it is the one worth pointing at a
  // smaller model when a free-tier quota starts biting.
  it("keeps the two overrides independent", () => {
    vi.stubEnv("GEMINI_PAGE_MODEL", "page-model");
    vi.stubEnv("GEMINI_ALT_TEXT_MODEL", "alt-model");

    getPageGenerator();
    getImageDescriber();

    expect(chainGivenTo(createGeminiGenerator)).toEqual(["page-model"]);
    expect(chainGivenTo(createGeminiDescriber)).toEqual(["alt-model"]);
  });

  it("does not let the page override leak into the describer", () => {
    vi.stubEnv("GEMINI_PAGE_MODEL", "page-model");

    getImageDescriber();

    expect(chainGivenTo(createGeminiDescriber)).toBeUndefined();
  });
});
