// The guards on fetching a Media Library image so it can be sent to a provider
// inline. This is the module that makes an outbound request on behalf of an
// admin, so every check here is about what comes back, not what was asked for.

import { describe, expect, it, vi } from "vitest";
import {
  fetchImageAsInline,
  ImageFetchError,
  MAX_FETCHED_IMAGE_BYTES,
} from "./fetchImage";

const ASSET = "https://media.graphassets.com/abc123";

/** A fetch stub returning one canned response. */
function respondWith({
  status = 200,
  type = "image/jpeg",
  bytes = new Uint8Array([1, 2, 3]),
  length,
}: {
  status?: number;
  type?: string | null;
  bytes?: Uint8Array;
  length?: string;
} = {}) {
  const headers = new Headers();
  if (type !== null) headers.set("content-type", type);
  if (length !== undefined) headers.set("content-length", length);

  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })) as unknown as typeof fetch;
}

describe("fetchImageAsInline — the allowlist runs before the request", () => {
  it.each([
    "https://evil.test/x.jpg",
    "https://graphassets.com.evil.test/x.jpg",
    "http://media.graphassets.com/abc",
    "http://169.254.169.254/latest/meta-data/",
    "",
  ])("refuses %j", async (url) => {
    const fetchImpl = respondWith();
    await expect(fetchImageAsInline(url, fetchImpl)).rejects.toBeInstanceOf(ImageFetchError);
    // The important half: nothing left the process.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetches an allowed asset host", async () => {
    const fetchImpl = respondWith();
    const out = await fetchImageAsInline(ASSET, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(out).toEqual({ mediaType: "image/jpeg", base64: "AQID" });
  });

  it("does not follow redirects, which could leave the allowlisted host", async () => {
    const fetchImpl = respondWith();
    await fetchImageAsInline(ASSET, fetchImpl);
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
    expect(init).toMatchObject({ redirect: "error" });
  });
});

describe("fetchImageAsInline — the response is what gets checked", () => {
  it("rejects a content type the provider cannot read", async () => {
    for (const type of ["image/gif", "text/html", "application/pdf", "image/svg+xml"]) {
      await expect(fetchImageAsInline(ASSET, respondWith({ type }))).rejects.toThrow(
        /format isn't supported/
      );
    }
  });

  it("rejects a missing content type rather than guessing", async () => {
    await expect(fetchImageAsInline(ASSET, respondWith({ type: null }))).rejects.toThrow(
      /format isn't supported/
    );
  });

  it("reads the type out of a parameterised content type", async () => {
    const out = await fetchImageAsInline(ASSET, respondWith({ type: "image/PNG; charset=binary" }));
    expect(out.mediaType).toBe("image/png");
  });

  it("refuses an oversized body even when content-length lied about it", async () => {
    const huge = new Uint8Array(MAX_FETCHED_IMAGE_BYTES + 1);
    await expect(
      fetchImageAsInline(ASSET, respondWith({ bytes: huge, length: "10" }))
    ).rejects.toThrow(/too large/);
  });

  it("refuses early when content-length already exceeds the cap", async () => {
    await expect(
      fetchImageAsInline(ASSET, respondWith({ length: String(MAX_FETCHED_IMAGE_BYTES + 1) }))
    ).rejects.toThrow(/too large/);
  });

  it("rejects an empty body", async () => {
    await expect(
      fetchImageAsInline(ASSET, respondWith({ bytes: new Uint8Array(0) }))
    ).rejects.toThrow(/came back empty/);
  });

  it("rejects a non-2xx response", async () => {
    await expect(fetchImageAsInline(ASSET, respondWith({ status: 404 }))).rejects.toThrow(
      /Couldn't load that image/
    );
  });

  it("turns a network failure into the same error type, not a raw throw", async () => {
    const boom = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(fetchImageAsInline(ASSET, boom)).rejects.toBeInstanceOf(ImageFetchError);
  });

  it("passes an abort signal, so a hung host cannot hold the action open", async () => {
    const fetchImpl = respondWith();
    await fetchImageAsInline(ASSET, fetchImpl);
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as
      | RequestInit
      | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
