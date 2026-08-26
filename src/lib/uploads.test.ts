import { describe, expect, it } from "vitest";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  checkUpload,
  safeFileName,
  sniffType,
} from "./uploads";

const bytes = (...values: number[]) => new Uint8Array(values);

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x00, 0x00, 0x00);

describe("sniffType", () => {
  it.each([
    ["JPEG", JPEG, "image/jpeg"],
    ["PNG", PNG, "image/png"],
    ["WebP", WEBP, "image/webp"],
    ["PDF", PDF, "application/pdf"],
  ])("recognizes %s", (_label, head, expected) => {
    expect(sniffType(head)).toBe(expected);
  });

  it("rejects an SVG, which the config renders with dangerouslyAllowSVG", () => {
    // "<svg xmlns=..." — the case that most wants blocking, since next.config
    // sets dangerouslyAllowSVG: true.
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');
    expect(sniffType(svg)).toBeNull();
  });

  it.each([
    ["HTML", '<!DOCTYPE html><script>alert(1)</script>'],
    ["a shell script", "#!/bin/sh\nrm -rf /"],
    ["plain text", "just some text"],
  ])("rejects %s", (_label, text) => {
    expect(sniffType(new TextEncoder().encode(text))).toBeNull();
  });

  it("rejects a RIFF container that is not WebP (e.g. a WAV)", () => {
    const wav = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45);
    expect(sniffType(wav)).toBeNull();
  });

  it("rejects empty and short input without throwing", () => {
    expect(sniffType(bytes())).toBeNull();
    expect(sniffType(bytes(0xff))).toBeNull();
    expect(sniffType(bytes(0xff, 0xd8))).toBeNull();
  });

  it("only ever returns a type the allowlist covers", () => {
    for (const head of [JPEG, PNG, WEBP, PDF]) {
      expect(Object.keys(ALLOWED_UPLOAD_TYPES)).toContain(sniffType(head));
    }
  });
});

describe("checkUpload", () => {
  it("accepts a normal image", () => {
    expect(checkUpload(500_000, JPEG)).toEqual({ ok: true, type: "image/jpeg" });
  });

  it("rejects an empty file", () => {
    const result = checkUpload(0, JPEG);
    expect(result.ok).toBe(false);
  });

  it("accepts a file exactly at the limit", () => {
    expect(checkUpload(MAX_UPLOAD_BYTES, PNG).ok).toBe(true);
  });

  it("rejects a file one byte over, and says how big it was", () => {
    const result = checkUpload(MAX_UPLOAD_BYTES + 1, PNG);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error).toMatch(/8\.0 MB/);
    expect(result.error).toMatch(/limit is/);
  });

  it("rejects a disallowed type regardless of size", () => {
    const svg = new TextEncoder().encode("<svg>");
    const result = checkUpload(100, svg);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.error).toMatch(/JPEG, PNG, WebP, or PDF/);
  });

  it("ignores a forged content type — only the bytes decide", () => {
    // The whole point: a client claiming image/png with SVG bytes is refused.
    const svg = new TextEncoder().encode('<svg onload="alert(1)">');
    expect(checkUpload(1000, svg).ok).toBe(false);
  });
});

describe("safeFileName", () => {
  it("keeps an ordinary name", () => {
    expect(safeFileName("wool-coat.jpg", "image/jpeg")).toBe("wool-coat.jpg");
  });

  it("forces the extension to match the sniffed type, not the claimed one", () => {
    expect(safeFileName("payload.php", "image/png")).toBe("payload.png");
    expect(safeFileName("resume.jpg", "application/pdf")).toBe("resume.pdf");
  });

  it.each([
    ["../../../etc/passwd", "passwd.jpg"],
    ["..\\..\\windows\\system32\\evil.exe", "evil.jpg"],
    ["/absolute/path/img.png", "img.jpg"],
    ["C:\\Users\\Shark\\photo.png", "photo.jpg"],
  ])("strips directory traversal from %j", (input, expected) => {
    expect(safeFileName(input, "image/jpeg")).toBe(expected);
  });

  it("removes characters that could confuse downstream consumers", () => {
    expect(safeFileName('a"b<c>d|e?f*g.jpg', "image/jpeg")).toBe("a-b-c-d-e-f-g.jpg");
  });

  it("collapses runs of separators", () => {
    expect(safeFileName("a    b----c.jpg", "image/jpeg")).toBe("a-b-c.jpg");
  });

  it("trims leading and trailing separators", () => {
    expect(safeFileName("---name---.jpg", "image/jpeg")).toBe("name.jpg");
    expect(safeFileName("...hidden.jpg", "image/jpeg")).toBe("hidden.jpg");
  });

  it("bounds the length", () => {
    const long = `${"x".repeat(500)}.jpg`;
    const result = safeFileName(long, "image/jpeg");
    expect(result.length).toBeLessThanOrEqual(85);
    expect(result.endsWith(".jpg")).toBe(true);
  });

  it("falls back to a usable name when nothing survives cleaning", () => {
    expect(safeFileName("???.jpg", "image/jpeg")).toBe("upload.jpg");
    expect(safeFileName("", "image/jpeg")).toBe("upload.jpg");
    expect(safeFileName("///", "image/jpeg")).toBe("upload.jpg");
  });

  it("always produces a name matching a conservative pattern", () => {
    const hostile = [
      "../../etc/passwd",
      'a"b.jpg',
      "\u0000null.jpg",
      "emoji-😀-name.jpg",
      "sp ace.jpg",
      "".padEnd(300, "x"),
    ];
    for (const input of hostile) {
      expect(safeFileName(input, "image/jpeg")).toMatch(/^[a-zA-Z0-9._-]+\.jpg$/);
    }
  });
});
