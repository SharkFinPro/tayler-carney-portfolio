"use client";

import { useId, useRef, useState } from "react";
import { Cropper, type CropperRef } from "react-advanced-cropper";
import "react-advanced-cropper/dist/style.css";
import type { MediaAsset } from "@/lib/getAssets";
import { uploadAsset } from "@/app/admin/mediaActions";
import Modal from "@/components/Modal";
import styles from "./Media.module.scss";

const WIDE_RATIO = 2;
type Preset = "free" | "wide";

function outputType(sourceType: string): { mime: string; ext: string } {
  if (sourceType === "image/png") return { mime: "image/png", ext: "png" };
  if (sourceType === "image/webp") return { mime: "image/webp", ext: "webp" };
  return { mime: "image/jpeg", ext: "jpg" };
}

function baseName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

export default function MediaUploader({ onUploaded }: { onUploaded: (asset: MediaAsset) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropperRef = useRef<CropperRef>(null);
  const titleId = useId();

  // A data URL (not a blob: URL) so it passes the CSP, whose img-src allows data:.
  const [source, setSource] = useState<{ url: string; file: File } | null>(null);
  const [preset, setPreset] = useState<Preset>("free");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setSource(null);
    setPreset("free");
    setTitle("");
    setBusy(false);
    setError(null);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
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

  async function handleSave() {
    const cropper = cropperRef.current;
    if (!cropper || !source) return;
    const canvas = cropper.getCanvas();
    if (!canvas) {
      setError("Couldn't read the crop. Try again.");
      return;
    }
    const { mime, ext } = outputType(source.file.type);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, mime, 0.92));
    if (!blob) {
      setError("Couldn't export the cropped image.");
      return;
    }
    const cropped = new File([blob], `${baseName(source.file.name)}.${ext}`, { type: mime });

    const formData = new FormData();
    formData.append("file", cropped);
    if (title.trim()) formData.append("title", title.trim());

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
      <button type="button" className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
        Upload media
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleFile} />
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
                <button type="button" className={`${styles.ratioBtn} ${preset === "wide" ? styles.ratioActive : ""}`} aria-pressed={preset === "wide"} onClick={() => setPreset("wide")}>
                  2:1
                </button>
                <button type="button" className={`${styles.ratioBtn} ${preset === "free" ? styles.ratioActive : ""}`} aria-pressed={preset === "free"} onClick={() => setPreset("free")}>
                  Free-form
                </button>
              </div>
            </div>

            <div className={styles.cropArea}>
              <Cropper
                ref={cropperRef}
                src={source.url}
                className={styles.cropper}
                crossOrigin={false}
                checkOrientation={false}
                key={preset}
                defaultSize={({ imageSize }: { imageSize: { width: number; height: number } }) =>
                  preset === "wide"
                    ? (() => {
                        const width = Math.min(imageSize.width, imageSize.height * WIDE_RATIO);
                        return { width, height: width / WIDE_RATIO };
                      })()
                    : { width: imageSize.width, height: imageSize.height }
                }
                stencilProps={{ aspectRatio: preset === "wide" ? WIDE_RATIO : undefined }}
              />
            </div>

            <label className={styles.titleField}>
              <span>Display name</span>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional" />
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
