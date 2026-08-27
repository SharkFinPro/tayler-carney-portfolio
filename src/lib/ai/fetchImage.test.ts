// The guards on fetching a Media Library image so it can be sent to a provider
// inline. This is the module that makes an outbound request on behalf of an
// admin, so every check here is about what comes back, not what was asked for.

import { describe, expect, it, vi } from "vitest";
import {
  fetchImageAsInline,
  fetchImagesWithinBudget,
  ImageFetchError,
  MAX_FETCHED_IMAGE_BYTES,
  modelImageEdge,
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

describe("fetchImageAsInline — downscaling", () => {
  /** A real JPEG, large enough that resizing has something to do. */
  async function jpeg(width: number, height: number): Promise<Uint8Array> {
    const { default: sharp } = await import("sharp");
    const buffer = await sharp({
      create: { width, height, channels: 3, background: { r: 120, g: 90, b: 60 } },
    })
      .jpeg()
      .toBuffer();
    return new Uint8Array(buffer);
  }

  /** Read back the dimensions of what we were about to send. */
  async function dimensionsOf(base64: string) {
    const { default: sharp } = await import("sharp");
    const { width, height } = await sharp(Buffer.from(base64, "base64")).metadata();
    return { width, height };
  }

  it("shrinks a large image to the model edge", async () => {
    // The reason this matters: page drafting sends up to twelve of these
    // inline in one request, against a 20MB ceiling.
    const original = await jpeg(3000, 2000);
    const out = await fetchImageAsInline(ASSET, respondWith({ bytes: original }));

    expect(await dimensionsOf(out.base64)).toEqual({ width: 1024, height: 683 });
    expect(out.base64.length).toBeLessThan(original.byteLength);
  });

  it("leaves a small image at its own size rather than upscaling it", async () => {
    const original = await jpeg(400, 300);
    const out = await fetchImageAsInline(ASSET, respondWith({ bytes: original }));
    expect(await dimensionsOf(out.base64)).toEqual({ width: 400, height: 300 });
  });

  it("re-encodes as JPEG, so the declared type matches the bytes", async () => {
    const { default: sharp } = await import("sharp");
    const png = new Uint8Array(
      await sharp({ create: { width: 50, height: 50, channels: 3, background: "red" } })
        .png()
        .toBuffer()
    );
    const out = await fetchImageAsInline(ASSET, respondWith({ type: "image/png", bytes: png }));

    expect(out.mediaType).toBe("image/jpeg");
    expect((await sharp(Buffer.from(out.base64, "base64")).metadata()).format).toBe("jpeg");
  });

  it("falls back to the original when the bytes are not a decodable image", async () => {
    // A smaller image is an optimization; failing to make one should not be
    // the difference between getting alt text and not.
    const notAnImage = new Uint8Array([1, 2, 3, 4]);
    const out = await fetchImageAsInline(ASSET, respondWith({ bytes: notAnImage }));
    expect(out).toEqual({ mediaType: "image/jpeg", base64: "AQIDBA==" });
  });
});

describe("modelImageEdge — resolution is what makes room for a large set", () => {
  it("keeps full resolution for a small batch", () => {
    expect(modelImageEdge(1)).toBe(1024);
    expect(modelImageEdge(12)).toBe(1024);
  });

  it("steps down as the batch grows, rather than refusing it", () => {
    expect(modelImageEdge(13)).toBe(768);
    expect(modelImageEdge(40)).toBe(768);
    expect(modelImageEdge(41)).toBe(512);
    expect(modelImageEdge(500)).toBe(512);
  });
});

describe("fetchImagesWithinBudget — the ceiling is bytes, not a count", () => {
  const image = (n: number) => ({ url: `https://media.graphassets.com/${n}` });

  /** Three undecodable bytes per image: 4 base64 characters each, exactly. */
  function respondToAll(failing: string[] = []) {
    return vi.fn(async (url: string) => {
      if (failing.includes(url)) throw new Error("unreachable");
      const headers = new Headers([["content-type", "image/jpeg"]]);
      const bytes = new Uint8Array([1, 2, 3]);
      return {
        ok: true,
        status: 200,
        headers,
        arrayBuffer: async () => bytes.buffer.slice(0),
      };
    }) as unknown as typeof fetch;
  }

  it("attaches every image, in order, when the budget is ample", async () => {
    const images = [image(1), image(2), image(3)];
    const { attached, skipped } = await fetchImagesWithinBudget(images, 1000, respondToAll());

    expect(attached.map((a) => a.image)).toEqual(images);
    expect(skipped).toEqual([]);
  });

  it("has no count limit — a set far past the old cap of twelve all attaches", async () => {
    const images = Array.from({ length: 60 }, (_, i) => image(i));
    const { attached, skipped } = await fetchImagesWithinBudget(images, 10_000, respondToAll());

    expect(attached).toHaveLength(60);
    expect(skipped).toEqual([]);
  });

  it("stops at the budget and reports the rest, rather than failing the draft", async () => {
    const images = Array.from({ length: 8 }, (_, i) => image(i));
    // Room for two images of four base64 characters; the third does not fit.
    const fetchImpl = respondToAll();
    const { attached, skipped } = await fetchImagesWithinBudget(images, 10, fetchImpl);

    expect(attached.map((a) => a.image)).toEqual([images[0], images[1]]);
    expect(skipped).toHaveLength(6);
    // The images past the chunk that filled up are never fetched at all, which
    // is what keeps "select everything" from costing a fetch per asset.
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it("counts an unreachable image as skipped and keeps the rest", async () => {
    const images = [image(1), image(2), image(3)];
    const failing = ["https://media.graphassets.com/2"];
    const { attached, skipped } = await fetchImagesWithinBudget(images, 1000, respondToAll(failing));

    expect(attached.map((a) => a.image)).toEqual([images[0], images[2]]);
    expect(skipped).toEqual([images[1]]);
  });
});
