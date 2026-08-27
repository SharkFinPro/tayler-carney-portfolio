"use client";

import { useEffect, useId, useState } from "react";
import Modal from "@/components/Modal";
import AssetPicker from "@/components/AssetPicker";
import { BLOCK_LABELS, blockSummary, type Block } from "./blocks";
import { draftProjectPage, pageGenerationAvailable } from "@/app/admin/aiActions";
import { DRAFT_QUESTIONS, MAX_IMAGES, type SourceImage } from "@/lib/ai/types";
import styles from "./AiDraftModal.module.scss";

type Stage = "compose" | "working" | "review";

/**
 * Drafts a page from images plus a few short answers.
 *
 * The draft is never saved from here. It comes back for the admin to look at,
 * and inserting it is an explicit second action — generated content should not
 * reach the live site because someone clicked one button. Inserted blocks are
 * ordinary blocks afterwards: editable, reorderable, deletable, with no trace
 * of where they came from.
 */
export default function AiDraftModal({
  initialTitle = "",
  onInsert,
  onClose,
}: {
  initialTitle?: string;
  onInsert: (blocks: Block[]) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [title, setTitle] = useState(initialTitle);
  const [answers, setAnswers] = useState<string[]>(() => DRAFT_QUESTIONS.map(() => ""));
  const [images, setImages] = useState<SourceImage[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [stage, setStage] = useState<Stage>("compose");
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Block[]>([]);

  // Availability is a server fact (is a key configured?), so it is asked for
  // rather than assumed. Until it answers, the form stays disabled.
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    pageGenerationAvailable().then((ok) => {
      if (active) setAvailable(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  const hasSomething = images.length > 0 || answers.some((a) => a.trim());
  const canGenerate = available === true && title.trim() !== "" && hasSomething;

  async function generate() {
    setStage("working");
    setError(null);

    const result = await draftProjectPage({
      title: title.trim(),
      answers: DRAFT_QUESTIONS.map((question, i) => ({ question, answer: answers[i] ?? "" })),
      images,
    });

    if ("error" in result) {
      setError(result.error);
      setStage("compose");
      return;
    }

    setDraft(result.blocks);
    setStage("review");
  }

  return (
    <>
      <Modal onClose={onClose} labelledBy={titleId} overlayClassName={styles.overlay}>
        <div className={styles.panel}>
          <div className={styles.head}>
            <h2 id={titleId} className={styles.title}>
              Draft this page
            </h2>
            <p className={styles.intro}>
              Add the images and answer whatever you can. Everything comes back as ordinary
              blocks for you to edit — nothing is saved until you insert it.
            </p>
          </div>

          {available === false && (
            <p className={styles.notice} role="status">
              AI drafting isn&rsquo;t configured on this deployment. Set{" "}
              <code>GEMINI_API_KEY</code> to enable it.
            </p>
          )}

          {stage === "review" ? (
            <div className={styles.review}>
              <p className={styles.reviewLead}>
                {draft.length} block{draft.length === 1 ? "" : "s"} drafted. Have a read before
                inserting.
              </p>
              <ol className={styles.reviewList}>
                {draft.map((block) => (
                  <li key={block.id} className={styles.reviewItem}>
                    <span className={styles.reviewType}>{BLOCK_LABELS[block.type]}</span>
                    <span className={styles.reviewHeading}>{block.heading || "—"}</span>
                    <span className={styles.reviewSummary}>{blockSummary(block)}</span>
                  </li>
                ))}
              </ol>

              <div className={styles.actions}>
                <button type="button" className={styles.secondary} onClick={() => setStage("compose")}>
                  Back
                </button>
                <button type="button" className={styles.secondary} onClick={generate}>
                  Draft again
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => {
                    onInsert(draft);
                    onClose();
                  }}
                >
                  Insert {draft.length} block{draft.length === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.form}>
              <label className={styles.field}>
                <span className={styles.label}>Project title</span>
                <input
                  className={styles.input}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Unisex Longline Box Blazer"
                  disabled={stage === "working"}
                />
              </label>

              <div className={styles.field}>
                <span className={styles.label}>Images</span>
                <span className={styles.hint}>
                  Only these are used. Nothing else from the Media Library is referenced.
                  Up to {MAX_IMAGES}.
                </span>

                {images.length > 0 && (
                  <ul className={styles.imageList}>
                    {images.map((img, i) => (
                      <li key={img.url} className={styles.imageRow}>
                        {/* Admin-only thumbnail; next/image would add no value
                            for a transient picker preview. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt="" className={styles.thumb} loading="lazy" />
                        <span className={styles.imageName}>{img.name}</span>
                        <button
                          type="button"
                          className={styles.remove}
                          onClick={() => setImages(images.filter((_, j) => j !== i))}
                          aria-label={`Remove ${img.name}`}
                          disabled={stage === "working"}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => setPickerOpen(true)}
                  disabled={stage === "working"}
                >
                  + Add image
                </button>
              </div>

              {DRAFT_QUESTIONS.map((question, i) => (
                <label key={question} className={styles.field}>
                  <span className={styles.label}>{question}</span>
                  <textarea
                    className={`${styles.input} ${styles.textarea}`}
                    rows={2}
                    value={answers[i]}
                    onChange={(e) =>
                      setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))
                    }
                    disabled={stage === "working"}
                  />
                </label>
              ))}

              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={onClose}
                  disabled={stage === "working"}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={generate}
                  disabled={!canGenerate || stage === "working"}
                >
                  {stage === "working" ? "Drafting…" : "Draft page"}
                </button>
              </div>

              {stage === "working" && (
                <p className={styles.hint} role="status" aria-live="polite">
                  Reading the images and writing. This usually takes half a minute.
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>

      {pickerOpen && (
        <AssetPicker
          onClose={() => setPickerOpen(false)}
          onSelect={(asset) => {
            const name = asset.title?.trim() || asset.fileName;
            setImages((prev) =>
              // The same asset twice would just spend tokens describing it twice.
              // The cap is the server's, enforced here so the admin sees the
              // limit rather than getting a draft that quietly ignored images
              // they picked.
              prev.some((i) => i.url === asset.url) || prev.length >= MAX_IMAGES
                ? prev
                : [...prev, { url: asset.url, name, altText: asset.altText }]
            );
            setPickerOpen(false);
          }}
        />
      )}
    </>
  );
}
