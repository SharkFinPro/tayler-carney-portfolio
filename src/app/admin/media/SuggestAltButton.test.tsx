// @vitest-environment happy-dom
//
// AGENTS.md records that the React components are untested by design, because
// testing them means mocking network and DOM heavily enough to be testing the
// mocks. This one is the exception that proves the rule: its entire surface is
// two Server Action calls, and mocking that module is a thin, honest boundary.
//
// It is worth testing because the properties below are the ones a reviewer
// cannot see by reading it — that an unconfigured install renders no button at
// all, and that a failed suggestion never reaches the field.

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const altTextSuggestionAvailable = vi.hoisted(() => vi.fn());
const suggestAltText = vi.hoisted(() => vi.fn());

vi.mock("@/app/admin/aiActions", () => ({ altTextSuggestionAvailable, suggestAltText }));

const URL_SOURCE = { kind: "url", url: "https://media.graphassets.com/abc" } as const;

/**
 * Import the component fresh for each test.
 *
 * It caches the availability answer at module scope on purpose — one request
 * per page load rather than one per gallery card — which means the cache has to
 * be reset between cases that want different answers.
 */
async function load() {
  vi.resetModules();
  const mod = await import("./SuggestAltButton");
  return mod.default;
}

beforeEach(() => {
  altTextSuggestionAvailable.mockReset();
  suggestAltText.mockReset();
  altTextSuggestionAvailable.mockResolvedValue(true);
});

afterEach(() => {
  // Auto-cleanup only registers itself when Vitest globals are on, and they are
  // not here — without this every render stacks up in the same document.
  cleanup();
  vi.restoreAllMocks();
});

describe("SuggestAltButton — availability", () => {
  it("renders nothing when no API key is configured", async () => {
    altTextSuggestionAvailable.mockResolvedValue(false);
    const SuggestAltButton = await load();

    render(<SuggestAltButton getSource={() => URL_SOURCE} onSuggested={vi.fn()} />);

    // Give the availability promise a turn to settle before concluding.
    await act(async () => {});
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders once the server says the feature is configured", async () => {
    const SuggestAltButton = await load();
    render(<SuggestAltButton getSource={() => URL_SOURCE} onSuggested={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("button")).toBeTruthy());
  });

  it("asks the server once, not once per button", async () => {
    const SuggestAltButton = await load();
    render(
      <>
        <SuggestAltButton getSource={() => URL_SOURCE} onSuggested={vi.fn()} />
        <SuggestAltButton getSource={() => URL_SOURCE} onSuggested={vi.fn()} />
        <SuggestAltButton getSource={() => URL_SOURCE} onSuggested={vi.fn()} />
      </>
    );

    await waitFor(() => expect(screen.getAllByRole("button")).toHaveLength(3));
    expect(altTextSuggestionAvailable).toHaveBeenCalledTimes(1);
  });
});

describe("SuggestAltButton — suggesting", () => {
  it("hands a successful suggestion to the field", async () => {
    suggestAltText.mockResolvedValue({ ok: true, altText: "A boxy wool blazer on a dress form." });
    const onSuggested = vi.fn();
    const SuggestAltButton = await load();

    render(<SuggestAltButton getSource={() => URL_SOURCE} name="blazer.jpg" onSuggested={onSuggested} />);
    const button = await screen.findByRole("button");
    await act(async () => button.click());

    expect(suggestAltText).toHaveBeenCalledWith({ source: URL_SOURCE, name: "blazer.jpg" });
    expect(onSuggested).toHaveBeenCalledWith("A boxy wool blazer on a dress form.");
  });

  it("resolves the source on click, not on render", async () => {
    // A gallery renders dozens of these; encoding an image for each one at
    // render time would be exactly the wrong trade.
    const getSource = vi.fn(() => URL_SOURCE);
    suggestAltText.mockResolvedValue({ ok: true, altText: "x" });
    const SuggestAltButton = await load();

    render(<SuggestAltButton getSource={getSource} onSuggested={vi.fn()} />);
    const button = await screen.findByRole("button");
    expect(getSource).not.toHaveBeenCalled();

    await act(async () => button.click());
    expect(getSource).toHaveBeenCalledTimes(1);
  });

  it("shows the server's message and leaves the field alone on failure", async () => {
    suggestAltText.mockResolvedValue({ error: "That image isn't a Media Library asset." });
    const onSuggested = vi.fn();
    const SuggestAltButton = await load();

    render(<SuggestAltButton getSource={() => URL_SOURCE} onSuggested={onSuggested} />);
    const button = await screen.findByRole("button");
    await act(async () => button.click());

    expect(screen.getByRole("alert").textContent).toBe("That image isn't a Media Library asset.");
    expect(onSuggested).not.toHaveBeenCalled();
  });

  it("reports a missing source without calling the server", async () => {
    const SuggestAltButton = await load();
    render(<SuggestAltButton getSource={() => null} onSuggested={vi.fn()} />);
    const button = await screen.findByRole("button");
    await act(async () => button.click());

    expect(suggestAltText).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("no image to describe");
  });

  it("reports a call that rejects outright, and stays usable", async () => {
    // A Server Action can fail before it returns a result — a dropped
    // connection, a rejected body. The promise must not escape unhandled, and
    // the button must not be left spinning with nothing said.
    suggestAltText.mockRejectedValue(new Error("network down"));
    const onSuggested = vi.fn();
    const SuggestAltButton = await load();

    render(<SuggestAltButton getSource={() => URL_SOURCE} onSuggested={onSuggested} />);
    const button = (await screen.findByRole("button")) as HTMLButtonElement;
    await act(async () => button.click());

    expect(screen.getByRole("alert").textContent).toContain("Couldn’t reach");
    expect(onSuggested).not.toHaveBeenCalled();
    expect(button.disabled).toBe(false);
  });

  it("stays disabled while the caller says so", async () => {
    const SuggestAltButton = await load();
    render(<SuggestAltButton getSource={() => URL_SOURCE} onSuggested={vi.fn()} disabled />);

    const button = (await screen.findByRole("button")) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
