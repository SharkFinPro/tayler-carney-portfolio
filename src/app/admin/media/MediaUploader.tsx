"use client";

import { useId, useRef, useState } from "react";
import { Cropper, type CropperRef } from "react-advanced-cropper";
import "react-advanced-cropper/dist/style.css";
import type { MediaAsset } from "@/lib/getAssets";
import { uploadAsset } from "@/app/admin/mediaActions";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads";
import Modal from "@/components/Modal";
import styles from "./Media.module.scss";

// Common crop aspect ratios; `value` is width/height, undefined = free-form.
// Non-empty by construction, and typed as such so the first entry can be read
// as the default without a guard at every use.
const RATIOS: [{ label: string; value: number | undefined }, ...{ label: string; value: number | undefined }[]] = [
  { label: "Free-form", value: undefined },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
  { label: "2:1", value: 2 },
  { label: "3:4", value: 3 / 4 },
];

function outputType(sourceType: string): { mime: string; ext: string } {
  if (sourceType === "image/png") return { mime: "image/png", ext: "png" };
  if (sourceType === "image/webp") return { mime: "image/webp", ext: "webp" };
  return { mime: "image/jpeg", ext: "jpg" };
}

function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

// Longest edge of an exported crop. A modern phone camera produces 4000px+
// images, and exporting one at full resolution yields a multi-megabyte JPEG
// that used to blow the Server Action body limit. 2400px is well beyond what
// any layout on the site renders, so this costs nothing visible.
const MAX_EXPORT_EDGE = 2400;

/**
 * Scale a canvas down so its longest edge is at most MAX_EXPORT_EDGE,
 * returning the original when it is already small enough.
 */
function downscale(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const longest = Math.max(canvas.width, canvas.height);
  if (longest <= MAX_EXPORT_EDGE) return canvas;

  const scale = MAX_EXPORT_EDGE / longest;
  const target = document.createElement("canvas");
  target.width = Math.round(canvas.width * scale);
  target.height = Math.round(canvas.height * scale);

  const ctx = target.getContext("2d");
  if (!ctx) return canvas;
  // Browsers default to reasonable smoothing, but say so explicitly — this is
  // a large downscale and nearest-neighbour would be visibly rough.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, target.width, target.height);
  return target;
}

export default function MediaUploader({
  onUploaded,
  triggerLabel = "Upload media",
  triggerClassName,
  accept = "image",
}: {
  onUploaded: (asset: MediaAsset) => void;
  triggerLabel?: string;
  triggerClassName?: string;
  /** "image" runs the crop flow; "document" accepts a PDF and uploads it directly. */
  accept?: "image" | "document";
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropperRef = useRef<CropperRef>(null);
  const titleId = useId();

  // A data URL (not a blob: URL) so it passes the CSP, whose img-src allows data:.
  const [source, setSource] = useState<{ url: string; file: File } | null>(null);
  const [ratioLabel, setRatioLabel] = useState(RATIOS[0].label);
  const ratio = RATIOS.find((r) => r.label === ratioLabel)?.value;
  const [title, setTitle] = useState("");
  const [altText, setAltText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setSource(null);
    setRatioLabel(RATIOS[0].label);
    setTitle("");
    setAltText("");
    setBusy(false);
    setError(null);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (accept === "document") {
      if (file.type !== "application/pdf") {
        setError("Please choose a PDF file.");
        return;
      }
      // Documents have nothing to crop — upload as-is.
      void uploadDocument(file);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError(null);
    setTitle(baseName(file.name));
    const reader = new FileReader();
    reader.onload = () => setSource({ url: reader.result as string, file });
    reader.onerror = () => setError("Couldn't read the selected file.");
    reader.readAsDataURL(file);
  }

  async function uploadDocument(file: File) {
    // PDFs skip the crop flow entirely, so nothing shrinks them on the way
    // through — and a resume PDF over the limit is entirely ordinary.
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `That PDF is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${
          MAX_UPLOAD_BYTES / (1024 * 1024)
        } MB — try compressing it first.`
      );
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", baseName(file.name));

    setBusy(true);
    setError(null);
    const result = await uploadAsset(formData);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onUploaded(result.asset);
  }

  async function handleSave() {
    const cropper = cropperRef.current;
    if (!cropper || !source) return;
    const canvas = cropper.getCanvas();
    if (!canvas) {
      setError("Couldn't read the crop. Try again.");
      return;
    }
    const { mime, ext } = outputType(source.file.type);
    const exportCanvas = downscale(canvas);
    const blob: Blob | null = await new Promise((resolve) =>
      exportCanvas.toBlob(resolve, mime, 0.92)
    );
    if (!blob) {
      setError("Couldn't export the cropped image.");
      return;
    }
    const cropped = new File([blob], `${baseName(source.file.name)}.${ext}`, { type: mime });

    // Caught here as well as server-side so the admin gets a clear message
    // instead of the platform rejecting the request body.
    if (cropped.size > MAX_UPLOAD_BYTES) {
      setError(
        "That image is still too large after cropping. Try a tighter crop, or resize it before uploading."
      );
      return;
    }

    const formData = new FormData();
    formData.append("file", cropped);
    if (title.trim()) formData.append("title", title.trim());
    if (altText.trim()) formData.append("altText", altText.trim());

    setBusy(true);
    setError(null);
    const result = await uploadAsset(formData);
    if ("error" in result) {
      setBusy(false);
      setError(result.error);
      return;
    }
    onUploaded(result.asset);
    reset();
  }

  return (
    <>
      <button
        type="button"
        className={triggerClassName ?? styles.uploadBtn}
        onClick={() => fileInputRef.current?.click()}
        disabled={busy && !source}
      >
        {busy && !source ? "Uploading…" : triggerLabel}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept === "document" ? "application/pdf" : "image/*"}
        hidden
        onChange={handleFile}
      />
      {!source && error && <p className={styles.actionError}>{error}</p>}

      {source && (
        <Modal
          onClose={() => { if (!busy) reset(); }}
          labelledBy={titleId}
          overlayClassName={styles.modalOverlay}
        >
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <h2 className={styles.modalTitle} id={titleId}>Crop &amp; upload</h2>
              <div className={styles.ratioGroup} role="group" aria-label="Crop aspect ratio">
                {RATIOS.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    className={`${styles.ratioBtn} ${ratioLabel === r.label ? styles.ratioActive : ""}`}
                    aria-pressed={ratioLabel === r.label}
                    onClick={() => setRatioLabel(r.label)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.cropArea}>
              <Cropper
                ref={cropperRef}
                src={source.url}
                className={styles.cropper}
                crossOrigin={false}
                checkOrientation={false}
                key={ratioLabel}
                defaultSize={({ imageSize }: { imageSize: { width: number; height: number } }) => {
                  if (ratio == null) return { width: imageSize.width, height: imageSize.height };
                  const width = Math.min(imageSize.width, imageSize.height * ratio);
                  return { width, height: width / ratio };
                }}
                stencilProps={{ aspectRatio: ratio }}
              />
            </div>

            <label className={styles.titleField}>
              <span>Display name</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" />
            </label>

            <label className={styles.titleField}>
              <span>Alt text</span>
              <input type="text" value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="Describe the image for accessibility" />
            </label>

            {error && <p className={styles.actionError} role="alert">{error}</p>}

            <div className={styles.modalActions}>
              <button type="button" className={styles.unpublishBtn} onClick={reset} disabled={busy}>
                Cancel
              </button>
              <button type="button" className={styles.publishBtn} onClick={handleSave} disabled={busy}>
                {busy ? "Uploading…" : "Crop & upload"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
