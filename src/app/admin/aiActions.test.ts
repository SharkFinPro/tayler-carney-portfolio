// The AI Server Actions: the availability gate, the per-action budgets, the
// bounds checked before anything is billed, and the trust boundary on the way
// back.
//
// Three things here are worth asserting rather than reading:
//
//   1. Nothing is spent before the input is known to be worth spending on.
//      Every guard below sits in front of a paid call, so a guard that stops
//      guarding shows up as a bill rather than as a bug.
//   2. Image URLs are filtered against a host allowlist before this process
//      fetches them. "Starts with https://" is not a host check, and the
//      source says so — https://evil.test/x.jpg would pass it.
//   3. Model output never reaches the page or the field unsanitized.
//
// `@/lib/rateLimit` is deliberately NOT mocked: the budgets are the guard, so
// a stub of the limiter would assert only that a stub was called. The limiters
// are module-scope and therefore shared across every test in this file, so
// each test gets its own client key (see `nextClient`) and the two tests that
// actually want to exhaust a budget say so explicitly. That also keeps the
// file order-independent, which the determinism job would otherwise catch.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { at } from "@/test/at";

const requireAuth = vi.hoisted(() => vi.fn());
const headers = vi.hoisted(() => vi.fn());
const getPageGenerator = vi.hoisted(() => vi.fn());
const getImageDescriber = vi.hoisted(() => vi.fn());
const isPageGenerationConfigured = vi.hoisted(() => vi.fn());
const isImageDescriptionConfigured = vi.hoisted(() => vi.fn());
const cmsQueryAuthed = vi.hoisted(() => vi.fn());
const auditEvent = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ requireAuth }));
vi.mock("next/headers", () => ({ headers }));
vi.mock("@/lib/cms", () => ({ cmsQueryAuthed }));
vi.mock("@/lib/observability", () => ({ auditEvent, reportError }));
vi.mock("@/lib/ai", () => ({
  getPageGenerator,
  getImageDescriber,
  isPageGenerationConfigured,
  isImageDescriptionConfigured,
}));

const {
  altTextSuggestionAvailable,
  draftProjectPage,
  pageGenerationAvailable,
  suggestAltText,
} = await import("./aiActions");

const DENIAL = { ok: false as const, error: "Not authorized." };

/** A Media Library URL — the only host the image paths accept. */
const ASSET_URL = "https://media.graphassets.com/abc123";

// The rate limiters live at module scope, so every test in this file shares
// them. A fresh client key per test keeps one test's spending off another's
// budget without reaching inside the limiter to reset it.
let clientCounter = 0;
const nextClient = () => `10.0.0.${++clientCounter}`;

function useClient(ip = nextClient()) {
  headers.mockResolvedValue(new Headers({ "x-forwarded-for": ip }));
  return ip;
}

const describeImage = vi.fn();
const generateProjectPage = vi.fn();

const draftInput = (over: Partial<Parameters<typeof draftProjectPage>[0]> = {}) => ({
  title: "A Project",
  answers: [{ question: "What is it?", answer: "A coat." }],
  images: [],
  ...over,
});

beforeEach(() => {
  for (const m of [
    requireAuth,
    headers,
    getPageGenerator,
    getImageDescriber,
    isPageGenerationConfigured,
    isImageDescriptionConfigured,
    cmsQueryAuthed,
    auditEvent,
    reportError,
    describeImage,
    generateProjectPage,
  ]) {
    m.mockReset();
  }

  requireAuth.mockResolvedValue(null);
  useClient();

  isPageGenerationConfigured.mockReturnValue(true);
  isImageDescriptionConfigured.mockReturnValue(true);

  describeImage.mockResolvedValue("A charcoal wool coat on a dress form.");
  getImageDescriber.mockReturnValue({ name: "gemini", describeImage });

  generateProjectPage.mockResolvedValue({
    page: { sections: [{ kind: "prose", heading: "Overview", body: "A coat." }] },
    unseen: [],
    model: "gemini-test",
  });
  getPageGenerator.mockReturnValue({ name: "gemini", generateProjectPage });

  cmsQueryAuthed.mockResolvedValue({ projects: [] });
});

// ── Authorization and availability ───────────────────────────────────────────

describe("authorization", () => {
  it.each([
    ["suggestAltText", () => suggestAltText({ source: { kind: "url", url: ASSET_URL } })],
    ["draftProjectPage", () => draftProjectPage(draftInput())],
  ])("%s returns the denial when not authorized", async (_n, call) => {
    requireAuth.mockResolvedValue(DENIAL);
    await expect(call()).resolves.toEqual(DENIAL);
  });

  it.each([
    ["suggestAltText", () => suggestAltText({ source: { kind: "url", url: ASSET_URL } })],
    ["draftProjectPage", () => draftProjectPage(draftInput())],
  ])("%s spends nothing when not authorized", async (_n, call) => {
    requireAuth.mockResolvedValue(DENIAL);
    await call();
    expect(describeImage).not.toHaveBeenCalled();
    expect(generateProjectPage).not.toHaveBeenCalled();
  });

  // These answer "should the UI offer this at all", so an unauthenticated
  // caller must get a plain false rather than a denial object the UI would
  // read as truthy and render a button for.
  it.each([
    ["pageGenerationAvailable", pageGenerationAvailable],
    ["altTextSuggestionAvailable", altTextSuggestionAvailable],
  ])("%s answers false — not a denial object — when not authorized", async (_n, call) => {
    requireAuth.mockResolvedValue(DENIAL);
    await expect(call()).resolves.toBe(false);
  });

  it.each([
    ["pageGenerationAvailable", pageGenerationAvailable, isPageGenerationConfigured],
    ["altTextSuggestionAvailable", altTextSuggestionAvailable, isImageDescriptionConfigured],
  ])("%s reports what is configured when authorized", async (_n, call, gate) => {
    gate.mockReturnValue(false);
    await expect(call()).resolves.toBe(false);

    gate.mockReturnValue(true);
    await expect(call()).resolves.toBe(true);
  });
});

describe("an unconfigured install", () => {
  it("tells the admin which variable to set rather than failing obscurely", async () => {
    getImageDescriber.mockReturnValue(null);

    const result = await suggestAltText({ source: { kind: "url", url: ASSET_URL } });
    expect(result).toEqual({
      ok: false,
      error: "AI suggestions aren't configured. Set GEMINI_API_KEY to enable them.",
    });
  });

  it("says the same for drafting", async () => {
    getPageGenerator.mockReturnValue(null);

    const result = await draftProjectPage(draftInput());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toContain("GEMINI_API_KEY");
  });
});

// ── What may be sent to the provider ─────────────────────────────────────────

describe("suggestAltText — which images may be fetched", () => {
  // This process fetches the URL, so the check is a host allowlist rather than
  // a scheme check. The source calls this out: "starts with https://" is not a
  // host check, and https://evil.test/x.jpg passed it.
  it.each([
    "https://evil.test/x.jpg",
    "https://media.graphassets.com.evil.test/x.jpg",
    "http://media.graphassets.com/x.jpg",
    "https://127.0.0.1/x.jpg",
    "https://localhost/x.jpg",
    "file:///etc/passwd",
    "/relative/path.jpg",
    "",
  ])("refuses %j without calling the provider", async (url) => {
    const result = await suggestAltText({ source: { kind: "url", url } });

    expect(result).toEqual({ ok: false, error: "That image isn't a Media Library asset." });
    expect(describeImage).not.toHaveBeenCalled();
  });

  it.each([
    "https://media.graphassets.com/abc",
    "https://eu-west-2.graphassets.com/cl1/xyz.jpg",
    "https://graphassets.com/x.png",
  ])("accepts the Media Library url %j", async (url) => {
    const result = await suggestAltText({ source: { kind: "url", url } });
    expect(result.ok).toBe(true);
  });
});

describe("suggestAltText — inline images", () => {
  const inline = (over: Record<string, unknown> = {}) => ({
    kind: "inline" as const,
    mediaType: "image/png",
    base64: "aGVsbG8=",
    ...over,
  });

  it.each(["image/svg+xml", "text/html", "application/pdf", "image/tiff", ""])(
    "refuses the media type %j",
    async (mediaType) => {
      const result = await suggestAltText({ source: inline({ mediaType }) });

      expect(result).toEqual({
        ok: false,
        error: "That image format isn't supported for suggestions.",
      });
      expect(describeImage).not.toHaveBeenCalled();
    }
  );

  it.each(["image/jpeg", "image/png", "image/webp", "image/gif"])(
    "accepts the media type %j",
    async (mediaType) => {
      const result = await suggestAltText({ source: inline({ mediaType }) });
      expect(result.ok).toBe(true);
    }
  );

  // Bounded before the request is made, not after it is rejected upstream.
  it("refuses an image too large to send", async () => {
    const result = await suggestAltText({ source: inline({ base64: "A".repeat(6 * 1024 * 1024) }) });

    expect(result).toEqual({
      ok: false,
      error: "That image is too large to describe. Upload it first.",
    });
    expect(describeImage).not.toHaveBeenCalled();
  });

  it.each([{ base64: "" }, { base64: undefined }])(
    "refuses an empty payload %j",
    async (over) => {
      const result = await suggestAltText({ source: inline(over) });
      expect(result).toEqual({ ok: false, error: "There's no image to describe yet." });
      expect(describeImage).not.toHaveBeenCalled();
    }
  );

  it.each([undefined, null, {}, { kind: "something-else" }])(
    "refuses the malformed source %j",
    async (source) => {
      const result = await suggestAltText({ source } as never);
      expect(result).toEqual({ ok: false, error: "There's no image to describe yet." });
      expect(describeImage).not.toHaveBeenCalled();
    }
  );
});

// ── The trust boundary on the way back ───────────────────────────────────────

describe("suggestAltText — model output is never trusted", () => {
  it("strips the newlines a single attribute value cannot hold", async () => {
    describeImage.mockResolvedValue("A coat\n\non a form.\r\nWool.");

    const result = await suggestAltText({ source: { kind: "url", url: ASSET_URL } });
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);

    expect(result.altText).not.toMatch(/[\r\n]/);
  });

  it.each([
    ['"A charcoal coat."', "A charcoal coat."],
    ["Here is the alt text: A charcoal coat.", "A charcoal coat."],
  ])("unwraps the model's packaging around %j", async (raw, expected) => {
    describeImage.mockResolvedValue(raw);

    const result = await suggestAltText({ source: { kind: "url", url: ASSET_URL } });
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);

    expect(result.altText).toBe(expected);
  });

  it.each(["", "   ", "\n\n", null, undefined, 42, {}])(
    "reports an unusable answer %j rather than writing it to the field",
    async (raw) => {
      describeImage.mockResolvedValue(raw);

      const result = await suggestAltText({ source: { kind: "url", url: ASSET_URL } });
      expect(result).toEqual({
        ok: false,
        error: "The suggestion came back empty. Try again, or write it yourself.",
      });
    }
  );

  it("never forwards the raw provider error", async () => {
    describeImage.mockRejectedValue(new Error("api key sk-secret-xyz rejected"));

    const result = await suggestAltText({ source: { kind: "url", url: ASSET_URL } });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).not.toContain("sk-secret-xyz");
  });
});

describe("suggestAltText — the audit trail", () => {
  it("records the provider and the length, never the text", async () => {
    const secret = "A charcoal wool coat with a notched lapel.";
    describeImage.mockResolvedValue(secret);

    await suggestAltText({ source: { kind: "url", url: ASSET_URL }, name: "coat.jpg" });

    const event = at(auditEvent.mock.calls, 0)[0] as Record<string, unknown>;
    expect(event).toMatchObject({ action: "suggestAltText", field: "altText", outcome: "ok" });
    expect(JSON.stringify(auditEvent.mock.calls)).not.toContain(secret);
  });

  it("bounds the name it forwards to the provider", async () => {
    await suggestAltText({ source: { kind: "url", url: ASSET_URL }, name: "x".repeat(500) });

    const sent = at(describeImage.mock.calls, 0)[0] as { name: string };
    expect(sent.name.length).toBeLessThanOrEqual(200);
  });
});

// ── draftProjectPage ─────────────────────────────────────────────────────────

describe("draftProjectPage — what is worth spending on", () => {
  it.each(["", "   ", "\t\n"])("refuses the blank title %j", async (title) => {
    const result = await draftProjectPage(draftInput({ title }));

    expect(result).toEqual({
      ok: false,
      error: "Give the project a title first — it's the subject of the page.",
    });
    expect(generateProjectPage).not.toHaveBeenCalled();
  });

  it("refuses a request with neither images nor answers", async () => {
    const result = await draftProjectPage(draftInput({ answers: [], images: [] }));

    expect(result).toEqual({
      ok: false,
      error: "Add at least one image or answer a question — there's nothing to work from yet.",
    });
    expect(generateProjectPage).not.toHaveBeenCalled();
  });

  it("refuses questions that were asked but not answered", async () => {
    const result = await draftProjectPage(
      draftInput({ answers: [{ question: "What is it?", answer: "   " }], images: [] })
    );

    expect(result.ok).toBe(false);
    expect(generateProjectPage).not.toHaveBeenCalled();
  });

  it("proceeds on images alone", async () => {
    const result = await draftProjectPage(
      draftInput({ answers: [], images: [{ url: ASSET_URL, name: "coat" }] })
    );
    expect(result.ok).toBe(true);
  });

  // Same allowlist as the alt-text path, and for the same reason: this process
  // fetches these URLs.
  it("drops images from hosts it will not fetch", async () => {
    await draftProjectPage(
      draftInput({
        images: [
          { url: ASSET_URL, name: "keep" },
          { url: "https://evil.test/x.jpg", name: "drop" },
          { url: "https://media.graphassets.com.evil.test/y.jpg", name: "drop" },
        ],
      })
    );

    const sent = at(generateProjectPage.mock.calls, 0)[0] as { images: { name: string }[] };
    expect(sent.images.map((i) => i.name)).toEqual(["keep"]);
  });

  it("bounds the title, answers and image names before sending them", async () => {
    await draftProjectPage(
      draftInput({
        title: "T".repeat(500),
        answers: [{ question: "Q", answer: "A".repeat(5000) }],
        images: [{ url: ASSET_URL, name: "N".repeat(500), altText: "X".repeat(900) }],
      })
    );

    const sent = at(generateProjectPage.mock.calls, 0)[0] as {
      title: string;
      answers: { answer: string }[];
      images: { name: string; altText?: string }[];
    };
    expect(sent.title.length).toBe(200);
    expect(at(sent.answers, 0).answer.length).toBe(2000);
    expect(at(sent.images, 0).name.length).toBe(200);
    expect(at(sent.images, 0).altText?.length).toBe(400);
  });

  it.each([
    ["a non-array images value", { images: "nope" }],
    ["a non-array answers value", { answers: "nope" }],
  ])("survives %s rather than throwing", async (_n, over) => {
    const result = await draftProjectPage(draftInput(over as never));
    expect(typeof result.ok).toBe("boolean");
  });
});

describe("draftProjectPage — the result", () => {
  it("reports which generator answered", async () => {
    const result = await draftProjectPage(draftInput());
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
    expect(result.generator).toBe("gemini");
  });

  // The model speaks a small, flat vocabulary of section `kind`s that is
  // deliberately NOT the CMS Block union; `toBlocks` is where one becomes the
  // other. Asserting the actual mapping — rather than that *some* block came
  // back — is what makes this a test of the translation instead of a test that
  // an array was non-empty.
  it.each([
    ["intro", "pageIntro", { kind: "intro", eyebrow: "E", heading: "H", body: "B" }],
    ["prose", "richText", { kind: "prose", heading: "H", body: "B" }],
    ["specs", "specs", { kind: "specs", heading: "H", rows: [{ label: "L", value: "V" }] }],
    [
      "timeline",
      "timeline",
      { kind: "timeline", heading: "H", stages: [{ marker: "1", title: "T", description: "D" }] },
    ],
    [
      "gallery",
      "gallery",
      { kind: "gallery", heading: "H", imageRefs: [ASSET_URL], layout: "grid" },
    ],
    [
      "captioned",
      "mediaShowcase",
      { kind: "captioned", heading: "H", items: [{ imageRef: ASSET_URL, title: "T", description: "D" }] },
    ],
  ])("maps a %s section onto a %s block", async (_n, expectedType, section) => {
    generateProjectPage.mockResolvedValue({ page: { sections: [section] }, unseen: [], model: "m" });

    const result = await draftProjectPage(
      draftInput({ images: [{ url: ASSET_URL, name: "coat" }] })
    );
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);

    expect(at(result.blocks, 0).type).toBe(expectedType);
  });

  // A kind the mapping does not know is dropped rather than guessed at, so a
  // model inventing a section type cannot put an unknown block on the page.
  it("drops an invented section kind but keeps the rest of the draft", async () => {
    generateProjectPage.mockResolvedValue({
      page: {
        sections: [
          { kind: "not-a-real-kind", heading: "H", body: "B" },
          { kind: "prose", heading: "Kept", body: "Body" },
        ],
      },
      unseen: [],
      model: "m",
    });

    const result = await draftProjectPage(draftInput());
    if (!result.ok) throw new Error(`expected ok, got ${result.error}`);

    expect(result.blocks.map((b) => b.type)).toEqual(["richText"]);
  });

  it.each([
    ["a kind it invented", { sections: [{ kind: "not-a-block", nonsense: true }] }],
    ["an empty page", { sections: [] }],
    ["a malformed page", null],
  ])("reports a readable failure when the model returns %s", async (_n, page) => {
    generateProjectPage.mockResolvedValue({ page, unseen: [], model: "m" });

    const result = await draftProjectPage(draftInput());
    expect(result).toEqual({
      ok: false,
      error: "The draft came back empty. Try adding more detail to your answers.",
    });
  });

  it("reports how many supplied images the model did not place", async () => {
    generateProjectPage.mockResolvedValue({
      page: { sections: [{ kind: "prose", heading: "H", body: "B" }] },
      unseen: [{ url: ASSET_URL }, { url: ASSET_URL }],
      model: "m",
    });

    const result = await draftProjectPage(draftInput());
    if (!result.ok) throw new Error("expected ok");
    expect(result.unseenImages).toBe(2);
  });

  it("never forwards the raw provider error", async () => {
    generateProjectPage.mockRejectedValue(new Error("api key sk-secret-xyz rejected"));

    const result = await draftProjectPage(draftInput());
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).not.toContain("sk-secret-xyz");
  });

  // Examples make a draft better; losing them should cost the reference, not
  // the draft. The source is explicit that this must never throw.
  it("still drafts when the house-style examples cannot be loaded", async () => {
    cmsQueryAuthed.mockRejectedValue(new Error("CMS down"));

    const result = await draftProjectPage(draftInput());
    expect(result.ok).toBe(true);
    expect(reportError).toHaveBeenCalled();
  });

  it("does not offer a page its own title as a house-style example", async () => {
    cmsQueryAuthed.mockResolvedValue({
      projects: [
        { title: "A Project", projectPage: [{ id: "1", type: "gallery", heading: "H", images: [], layout: "grid" }] },
        { title: "Another", projectPage: [{ id: "2", type: "gallery", heading: "H", images: [], layout: "grid" }] },
      ],
    });

    await draftProjectPage(draftInput({ title: "A Project" }));

    const sent = at(generateProjectPage.mock.calls, 0)[0] as { examples: { title: string }[] };
    expect(sent.examples.map((e) => e.title)).not.toContain("A Project");
  });
});

// ── Budgets ──────────────────────────────────────────────────────────────────

describe("the per-action budgets", () => {
  // Drafting is the call that costs money, so it gets the tighter budget. The
  // point of the check is that a stuck retry loop or a stolen session cannot
  // run up a bill, which only a real limiter can demonstrate.
  it("stops drafting once one client has spent its hourly budget", async () => {
    useClient("10.9.9.1");

    for (let i = 0; i < 20; i++) {
      const ok = await draftProjectPage(draftInput());
      expect(ok.ok).toBe(true);
    }

    const refused = await draftProjectPage(draftInput());
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unreachable");
    expect(refused.error).toContain("That's a lot of drafts");
    expect(generateProjectPage).toHaveBeenCalledTimes(20);
  });

  // A separate, larger budget: describing a library that has gone undescribed
  // is a legitimately bulk activity.
  it("gives alt text its own, larger budget", async () => {
    useClient("10.9.9.2");

    // Well past the drafting limit of 20, and still allowed.
    for (let i = 0; i < 40; i++) {
      const ok = await suggestAltText({ source: { kind: "url", url: ASSET_URL } });
      expect(ok.ok).toBe(true);
    }
  });

  // Larger, but still bounded — this is the endpoint a stuck retry loop would
  // hammer, and the message has to name the wait rather than just refusing.
  it("stops suggesting once that larger budget is spent too", async () => {
    useClient("10.9.9.5");

    for (let i = 0; i < 120; i++) {
      await suggestAltText({ source: { kind: "url", url: ASSET_URL } });
    }

    const refused = await suggestAltText({ source: { kind: "url", url: ASSET_URL } });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unreachable");
    expect(refused.error).toContain("That's a lot of suggestions");
    expect(describeImage).toHaveBeenCalledTimes(120);
  });

  it("budgets each client separately", async () => {
    useClient("10.9.9.3");
    for (let i = 0; i < 20; i++) await draftProjectPage(draftInput());
    expect((await draftProjectPage(draftInput())).ok).toBe(false);

    // A different address is unaffected by the first one's spending.
    useClient("10.9.9.4");
    expect((await draftProjectPage(draftInput())).ok).toBe(true);
  });
});
