// Upload validation and limits.
//
// The client checked `file.type` before uploading, but the Server Action
// checked only that a File arrived and that its size was non-zero. Type and
// size were never verified server-side, and `file.name` went straight into the
// Hygraph mutation. A valid session — or a stolen one — could push arbitrary
// file types into the asset store.
//
// The client-declared MIME type is not trusted here: it is trivially forged, so
// the leading bytes are checked against the real signature instead.

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

/** Accepted types, mapped to the extension the stored filename should carry. */
export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type UploadCheck = { ok: true; type: string } | { ok: false; error: string };

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0): boolean =>
  signature.every((b, i) => bytes[offset + i] === b);

/**
 * Identify a file from its leading bytes, ignoring whatever the client claimed.
 * Returns a MIME type from ALLOWED_UPLOAD_TYPES, or null when unrecognized.
 */
export function sniffType(bytes: Uint8Array): string | null {
  // JPEG: FF D8 FF
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";

  // WebP: "RIFF" .... "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }

  // PDF: "%PDF-"
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";

  return null;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Validate an upload's size and real content type.
 *
 * `head` is the first bytes of the file — enough to cover the longest
 * signature checked above (WebP needs 12).
 */
export function checkUpload(size: number, head: Uint8Array): UploadCheck {
  if (size === 0) {
    return { ok: false, error: "That file is empty." };
  }

  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `That file is ${formatBytes(size)}. The limit is ${formatBytes(
        MAX_UPLOAD_BYTES
      )} — try a smaller image, or crop it first.`,
    };
  }

  const type = sniffType(head);
  if (!type) {
    return {
      ok: false,
      error: "That file type isn't supported. Upload a JPEG, PNG, WebP, or PDF.",
    };
  }

  return { ok: true, type };
}

/**
 * Reduce an arbitrary filename to something safe to store.
 *
 * Strips any directory component, keeps a conservative character set, collapses
 * runs of separators, bounds the length, and forces the extension to match the
 * *sniffed* type rather than whatever the name claimed.
 */
export function safeFileName(rawName: string, sniffedType: string): string {
  const ext = ALLOWED_UPLOAD_TYPES[sniffedType] ?? "bin";

  // Drop directories (both separators) and any leading dots.
  const base = rawName.split(/[/\\]/).pop() ?? "";
  const withoutExt = base.replace(/\.[^.]*$/, "");

  const cleaned = withoutExt
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, 80);

  return `${cleaned || "upload"}.${ext}`;
}
