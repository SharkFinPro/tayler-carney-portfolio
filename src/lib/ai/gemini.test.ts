// The retry and fallback policies. Everything else in gemini.ts needs a key
// and a network; these are the parts that decide whether a failure is worth
// trying again, and whether it is worth trying somewhere else. Getting either
// backwards is easy and invisible from the outside.

import { describe, expect, it, vi } from "vitest";
import { acrossModels, isModelUnavailable, withRetry, type ModelChain } from "./gemini";

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

const retired = () =>
  Object.assign(
    new Error(`{"error":{"code":404,"message":"models/gemini-x is not found","status":"NOT_FOUND"}}`),
    { status: 404 }
  );

/** The 400 that a schema Gemini will not accept produces — see PAGE_SCHEMA. */
const badRequest = () =>
  Object.assign(
    new Error(
      `{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}`
    ),
    { status: 400 }
  );

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

describe("isModelUnavailable", () => {
  it.each([
    ["a spent quota", quota()],
    ["a retired model", retired()],
    ["a model still busy after its retries", busy()],
  ])("moves on from %s", (_label, error) => {
    expect(isModelUnavailable(error)).toBe(true);
  });

  it.each([
    ["a malformed request", badRequest()],
    ["an empty draft", new Error("The model returned an empty draft.")],
    ["a safety refusal", new Error("The model declined this request (SAFETY).")],
  ])("does not move on from %s", (_label, error) => {
    // These fail identically on every model. Walking the chain would turn one
    // fast failure into four slow ones and bury the real cause.
    expect(isModelUnavailable(error)).toBe(false);
  });

  it("recognizes a quota refusal from the message when there is no status", () => {
    expect(isModelUnavailable(new Error("You exceeded your current quota"))).toBe(true);
  });
});

describe("acrossModels", () => {
  const chain: ModelChain = ["first", "second", "third"];
  const instantWait = async () => {};

  it("uses the preferred model and does not touch the rest", async () => {
    const call = vi.fn(async () => "drafted");
    await expect(acrossModels(chain, call, instantWait)).resolves.toEqual({
      value: "drafted",
      model: "first",
    });
    expect(call).toHaveBeenCalledExactlyOnceWith("first");
  });

  it("falls through a spent quota to the next model", async () => {
    // The case this exists for: free-tier quota is per-model and per-day, so
    // the neighbours still have a full allowance when the leader runs out.
    const call = vi.fn(async (model: string) => {
      if (model === "first") throw quota();
      return "drafted";
    });

    await expect(acrossModels(chain, call, instantWait)).resolves.toEqual({
      value: "drafted",
      model: "second",
    });
  });

  it("keeps going until one answers", async () => {
    const call = vi.fn(async (model: string) => {
      if (model !== "third") throw quota();
      return "drafted";
    });

    await expect(acrossModels(chain, call, instantWait)).resolves.toEqual({
      value: "drafted",
      model: "third",
    });
    expect(call).toHaveBeenCalledTimes(3);
  });

  it("skips a retired model rather than failing on it", async () => {
    // A stale entry in a chain should cost a round-trip, not the feature.
    const call = vi.fn(async (model: string) => {
      if (model === "first") throw retired();
      return "drafted";
    });
    await expect(acrossModels(chain, call, instantWait)).resolves.toMatchObject({
      model: "second",
    });
  });

  it("gives up immediately on a request no model would accept", async () => {
    const call = vi.fn(async () => {
      throw badRequest();
    });

    await expect(acrossModels(chain, call, instantWait)).rejects.toThrow(/invalid argument/i);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("throws the last failure when the chain is exhausted", async () => {
    const call = vi.fn(async (model: string) => {
      throw model === "third" ? retired() : quota();
    });

    await expect(acrossModels(chain, call, instantWait)).rejects.toThrow(/404/);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it("still retries a busy model before moving on from it", async () => {
    // The two policies compose: withRetry inside, the chain outside.
    let attempts = 0;
    const call = vi.fn(async (model: string) => {
      if (model === "first") {
        attempts++;
        throw busy();
      }
      return "drafted";
    });

    await expect(acrossModels(chain, call, instantWait)).resolves.toMatchObject({
      model: "second",
    });
    expect(attempts).toBe(3);
  });

  it("pins the model when the chain holds one", async () => {
    const call = vi.fn(async () => {
      throw quota();
    });
    await expect(acrossModels(["only"], call, instantWait)).rejects.toThrow(/429/);
    expect(call).toHaveBeenCalledTimes(1);
  });
});
