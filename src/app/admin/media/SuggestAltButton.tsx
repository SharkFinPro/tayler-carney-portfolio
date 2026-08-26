"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { altTextSuggestionAvailable, suggestAltText } from "@/app/admin/aiActions";
import type { ImageSource } from "@/lib/ai/types";
import styles from "./Media.module.scss";

// Whether suggestions are configured is a server fact and the same answer for
// every image on the screen — and the gallery renders dozens of cards. Asking
// once per page load rather than once per card is the difference between one
// request and fifty.
let availability: Promise<boolean> | null = null;

function useSuggestionsAvailable(): boolean {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    availability ??= altTextSuggestionAvailable();
    void availability.then((ok) => {
      if (active) setAvailable(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  return available;
}

/**
 * Asks the model for one sentence of alt text and hands it to `onSuggested`.
 *
 * It fills the field; it does not save. A suggestion nobody read is worse for a
 * screen-reader user than an empty attribute — a wrong description is believed,
 * a missing one is at least obviously missing.
 *
 * Renders nothing at all when no API key is configured, so the admin UI has no
 * button that cannot work.
 */
export default function SuggestAltButton({
  getSource,
  name,
  onSuggested,
  disabled,
}: {
  /**
   * Resolved on click, not on render: for a not-yet-uploaded crop this encodes
   * the image, which is not work to do for every card in a gallery.
   */
  getSource: () => ImageSource | null | Promise<ImageSource | null>;
  /** File name or title, passed to the model as context. */
  name?: string;
  onSuggested: (altText: string) => void;
  disabled?: boolean;
}) {
  const available = useSuggestionsAvailable();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!available) return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const source = await getSource();
      if (!source) {
        setError("There's no image to describe yet.");
        return;
      }
      const result = await suggestAltText({ source, name });
      if ("error" in result) setError(result.error);
      else onSuggested(result.altText);
    } catch {
      // A Server Action can fail before it returns anything at all — a dropped
      // connection, a body the platform rejected, an encode that threw. Without
      // this the promise rejects unhandled and the button simply stops
      // spinning, with nothing said about why.
      setError("Couldn’t reach the suggestion service. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.suggestBtn}
        onClick={() => void run()}
        disabled={busy || disabled}
        title="Suggest alt text from the image"
      >
        <FontAwesomeIcon icon={faWandMagicSparkles} />
        {busy ? "Looking\u2026" : "Suggest"}
      </button>
      {error && (
        <span className={styles.suggestError} role="alert">
          {error}
        </span>
      )}
    </>
  );
}
