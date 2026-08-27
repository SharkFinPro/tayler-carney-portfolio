// Fetch a Media Library image so it can be sent to a provider inline.
//
// Anthropic will fetch an image URL itself. Gemini will not — it takes the
// bytes inline — so something has to do the fetching, and that something is
// this module rather than the provider file, because it is the part with
// security consequences and a second provider must not reimplement it.
//
// Doing the fetch ourselves is a net improvement, not a cost: the URL is
// checked against the asset-host allowlist *before* the request goes out, and
// the response is bounded before any of it reaches a model. Handing a URL to a
// third party to fetch means trusting their idea of which hosts are reasonable.

import { isDescribableImageUrl } from "./altText";

/**
 * Image formats Gemini accepts. Deliberately not the same list as Anthropic's
 * (which takes GIF but not HEIC), so it lives beside the provider that needs
 * it rather than in a shared "supported types" constant that would be wrong
 * for one of them.
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

  return { mediaType, base64: Buffer.from(bytes).toString("base64") };
}
