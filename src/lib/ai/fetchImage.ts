// Fetch a Media Library image so it can be sent to a provider inline.
//
// Gemini takes image bytes inline rather than fetching a URL, so something has
// to do the fetching. That something is this module rather than the provider
// file, because it is the part with security consequences and a second
// provider must not reimplement it.
//
// Doing the fetch ourselves is a net improvement, not a cost: the URL is
// checked against the asset-host allowlist *before* the request goes out, and
// the response is bounded and downscaled before any of it reaches a model.
// Handing a URL to a third party to fetch means trusting their idea of which
// hosts are reasonable.

import { isDescribableImageUrl } from "./altText";

/**
 * Image formats Gemini accepts. Notably not GIF, which the Media Library will
 * happily hold — hence the check rather than an assumption that anything the
 * uploader stored can be described.
 */
export const GEMINI_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/**
 * Cap on a fetched image.
 *
 * Gemini's own ceiling is 20MB for the whole request, but nothing in this
 * library should be anywhere near that: the uploader exports at most 2400px.
 * A smaller bound means a mis-tagged or hostile response is refused before it
 * is base64-encoded into memory, not after.
 */
export const MAX_FETCHED_IMAGE_BYTES = 8 * 1024 * 1024;

/** A slow asset host should fail fast, not hold the Server Action open. */
const FETCH_TIMEOUT_MS = 15_000;

export type FetchedImage = { mediaType: string; base64: string };

/** Thrown for every failure here, so the caller has one thing to catch. */
export class ImageFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageFetchError";
  }
}

function isAllowedType(value: string): boolean {
  return (GEMINI_IMAGE_TYPES as readonly string[]).includes(value);
}

/**
 * Fetch `url` and return it base64-encoded, or throw `ImageFetchError`.
 *
 * Every guard here is checked against the response, not the request: a
 * `content-length` header is a claim, and a `content-type` on a URL that ends
 * in `.jpg` is a claim too. The byte count is the one that is enforced after
 * the fact.
 */
export async function fetchImageAsInline(
  url: string,
  fetchImpl: typeof fetch = fetch,
  maxEdge: number = LARGEST_MODEL_IMAGE_EDGE
): Promise<FetchedImage> {
  // The allowlist runs first, before any request leaves this process.
  if (!isDescribableImageUrl(url)) {
    throw new ImageFetchError("That image isn't a Media Library asset.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(url, { signal: controller.signal, redirect: "error" });
  } catch {
    // Includes the abort. Either way the asset host did not answer usefully.
    throw new ImageFetchError("Couldn't load that image from the media library.");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ImageFetchError("Couldn't load that image from the media library.");
  }

  // Split on ";" so "image/jpeg; charset=binary" is still image/jpeg.
  const mediaType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!isAllowedType(mediaType)) {
    throw new ImageFetchError("That image format isn't supported for suggestions.");
  }

  // A declared length that is already too large saves downloading the body.
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_FETCHED_IMAGE_BYTES) {
    throw new ImageFetchError("That image is too large to describe.");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  // The real check. A missing or lying content-length changes nothing here.
  if (bytes.byteLength > MAX_FETCHED_IMAGE_BYTES) {
    throw new ImageFetchError("That image is too large to describe.");
  }
  if (bytes.byteLength === 0) {
    throw new ImageFetchError("That image came back empty.");
  }

  return downscale(Buffer.from(bytes), mediaType, maxEdge);
}

/**
 * Longest edge of an image sent to a model, for a small batch.
 *
 * Nothing here needs more. The model is being asked what the image *is* — a
 * boxy blazer on a dress form — not to inspect stitch density, and a 1024px
 * JPEG answers that as well as a 4000px original.
 *
 * The reason it is not optional: Gemini takes images inline and the whole
 * request has to fit in 20MB. Full-resolution garment photographs do not.
 * Downscaling turns "sometimes fails on a big project" into "fits", and costs
 * nothing anyone can see.
 */
const LARGEST_MODEL_IMAGE_EDGE = 1024;

/**
 * Longest edge for a batch of `count` images.
 *
 * There is no limit on how many images an admin may pick, so the request has
 * to make room rather than refuse: past a couple of dozen, each image gets a
 * smaller share of the 20MB. This is the right thing to spend — the model is
 * identifying garments and reading a page's shape out of a set, and 512px
 * answers that. Halving the edge quarters the pixels, so the reachable count
 * grows much faster than the quality falls.
 *
 * The thresholds are where the payload would otherwise start crowding the
 * budget at typical asset sizes, not round numbers for their own sake.
 */
export function modelImageEdge(count: number): number {
  if (count <= 12) return LARGEST_MODEL_IMAGE_EDGE;
  if (count <= 40) return 768;
  return 512;
}

/** Quality for the re-encode. 82 is indistinguishable here and roughly halves the bytes. */
const RE_ENCODE_QUALITY = 82;

/**
 * Resize to `maxEdge` and re-encode as JPEG.
 *
 * On any failure the original is returned rather than throwing: a smaller
 * image is an optimization, and a codec sharp dislikes should not be the
 * difference between getting alt text and not. HEIC is the realistic case —
 * it needs a libvips built with the codec, which is not guaranteed.
 */
async function downscale(buffer: Buffer, mediaType: string, maxEdge: number): Promise<FetchedImage> {
  try {
    const { default: sharp } = await import("sharp");
    const resized = await sharp(buffer)
      // `withoutEnlargement` so a small flat is not upscaled into blur.
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: RE_ENCODE_QUALITY })
      .toBuffer();

    return { mediaType: "image/jpeg", base64: resized.toString("base64") };
  } catch {
    return { mediaType, base64: buffer.toString("base64") };
  }
}

/**
 * Budget for the base64 image payload of one request.
 *
 * Gemini's ceiling is 20MB for the *whole* request; the rest is headroom for
 * the brief, the schema, and the JSON envelope around all of it. Measured in
 * base64 characters because that is what is actually sent — a byte on disk
 * becomes about four-thirds of one here.
 */
export const MAX_REQUEST_IMAGE_BYTES = 15 * 1024 * 1024;

/** Images fetched at once. Enough to hide the round-trips, few enough to be a
 *  polite neighbour to the asset host when a hundred are requested. */
const FETCH_CONCURRENCY = 6;

export type BatchFetch<T> = {
  /** In the order given, with the bytes to attach. */
  attached: { image: T; inline: FetchedImage }[];
  /** Images left out: unreachable, or past the request budget. */
  skipped: T[];
};

/**
 * Fetch as many of `images` as fit in one request.
 *
 * The bound is bytes, not a count. A count is the wrong ceiling — twelve
 * 4000px photographs and a hundred flats are not the same request — and
 * capping the count is what used to make an admin ration their picks against
 * a number that had nothing to do with their images.
 *
 * Fetching stops as soon as the budget is full, so choosing a thousand images
 * costs the fetches for the ones that fit plus one chunk, not a thousand.
 */
export async function fetchImagesWithinBudget<T extends { url: string }>(
  images: T[],
  budget: number = MAX_REQUEST_IMAGE_BYTES,
  fetchImpl: typeof fetch = fetch
): Promise<BatchFetch<T>> {
  const edge = modelImageEdge(images.length);
  const attached: { image: T; inline: FetchedImage }[] = [];
  const skipped: T[] = [];
  let used = 0;

  for (let i = 0; i < images.length; i += FETCH_CONCURRENCY) {
    const chunk = images.slice(i, i + FETCH_CONCURRENCY);
    // A settled result rather than Promise.all: one unreachable asset should
    // cost that image, not the whole draft.
    const results = await Promise.allSettled(
      chunk.map((img) => fetchImageAsInline(img.url, fetchImpl, edge))
    );

    let full = false;
    results.forEach((result, j) => {
      const image = chunk[j];
      if (!image) return;
      if (result.status !== "fulfilled") {
        skipped.push(image);
        return;
      }
      if (used + result.value.base64.length > budget) {
        skipped.push(image);
        full = true;
        return;
      }
      used += result.value.base64.length;
      attached.push({ image, inline: result.value });
    });

    if (full) {
      // Everything after the first image that did not fit is skipped without
      // being fetched. A later smaller image might technically have fitted;
      // pursuing that would mean downloading the rest of the library to find
      // out, and the admin is told either way.
      skipped.push(...images.slice(i + chunk.length));
      break;
    }
  }

  return { attached, skipped };
}
