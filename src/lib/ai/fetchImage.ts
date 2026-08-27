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
  fetchImpl: typeof fetch = fetch
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

  return downscale(Buffer.from(bytes), mediaType);
}

/**
 * Longest edge of an image sent to a model.
 *
 * Nothing here needs more. The model is being asked what the image *is* — a
 * boxy blazer on a dress form — not to inspect stitch density, and a 1024px
 * JPEG answers that as well as a 4000px original.
 *
 * The reason it is not optional: page drafting sends up to twelve images in
 * one request, Gemini takes them inline, and the whole request has to fit in
 * 20MB. Twelve full-resolution garment photographs do not. Downscaling turns
 * "sometimes fails on a big project" into "always fits", and costs nothing
 * anyone can see.
 */
const MAX_MODEL_IMAGE_EDGE = 1024;

/** Quality for the re-encode. 82 is indistinguishable here and roughly halves the bytes. */
const RE_ENCODE_QUALITY = 82;

/**
 * Resize to `MAX_MODEL_IMAGE_EDGE` and re-encode as JPEG.
 *
 * On any failure the original is returned rather than throwing: a smaller
 * image is an optimization, and a codec sharp dislikes should not be the
 * difference between getting alt text and not. HEIC is the realistic case —
 * it needs a libvips built with the codec, which is not guaranteed.
 */
async function downscale(buffer: Buffer, mediaType: string): Promise<FetchedImage> {
  try {
    const { default: sharp } = await import("sharp");
    const resized = await sharp(buffer)
      // `withoutEnlargement` so a small flat is not upscaled into blur.
      .rotate()
      .resize({
        width: MAX_MODEL_IMAGE_EDGE,
        height: MAX_MODEL_IMAGE_EDGE,
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
