// The retry policy. Everything else in gemini.ts needs a key and a network;
// this is the part that decides whether a failure is worth trying again, and
// getting it backwards is both easy and invisible from the outside.

import { describe, expect, it, vi } from "vitest";
import { withRetry } from "./gemini";

/** Errors shaped the way the SDK actually throws them. */
const busy = () =>
  Object.assign(
    new Error(
      `{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}`
    ),
    { status: 503 }
  );

const quota = () =>
  Object.assign(new Error(`{"error":{"code":429,"message":"Resource exhausted"}}`), {
    status: 429,
  });

/** Skip the real backoff; the delays are not what is under test. */
const instant = () => Promise.resolve();

describe("withRetry", () => {
  it("returns the first success without retrying", async () => {
    const attempt = vi.fn(async () => "ok");
    await expect(withRetry(attempt, instant)).resolves.toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries a busy model and returns the eventual success", async () => {
    // The case this exists for: 503 was a routine outcome on the free tier.
    const attempt = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(busy())
      .mockResolvedValueOnce("drafted");

    await expect(withRetry(attempt, instant)).resolves.toBe("drafted");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured attempts rather than looping", async () => {
    const attempt = vi.fn(async () => {
      throw busy();
    });
    await expect(withRetry(attempt, instant)).rejects.toThrow(/high demand/);
    // Three total: the first try plus one per backoff step.
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("never retries a spent quota", async () => {
    // 429 means the allowance is gone. Retrying spends what is already spent
    // and makes the situation worse, so this must fail on the first attempt.
    const attempt = vi.fn(async () => {
      throw quota();
    });
    await expect(withRetry(attempt, instant)).rejects.toThrow(/429/);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it.each([
    "That image isn't a Media Library asset.",
    `{"error":{"code":400,"message":"Invalid argument"}}`,
    `{"error":{"code":404,"message":"model is no longer available"}}`,
  ])("does not retry a request that was simply wrong: %j", async (message) => {
    const attempt = vi.fn(async () => {
      throw new Error(message);
    });
    await expect(withRetry(attempt, instant)).rejects.toThrow();
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("recognizes a busy model from the status alone", async () => {
    const attempt = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error("upstream failure"), { status: 503 }))
      .mockResolvedValueOnce("ok");
    await expect(withRetry(attempt, instant)).resolves.toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("backs off for longer on each successive attempt", async () => {
    const waits: number[] = [];
    const attempt = vi.fn(async () => {
      throw busy();
    });
    await expect(
      withRetry(attempt, async (ms) => {
        waits.push(ms);
      })
    ).rejects.toThrow();
    expect(waits).toEqual([1_000, 3_000]);
  });
});
