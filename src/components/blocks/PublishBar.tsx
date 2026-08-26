"use client";

import { useCallback, useEffect, useState } from "react";
import { getPublishState, publishContent, type PublishState } from "@/app/admin/contentActions";
import styles from "./PublishBar.module.scss";

/**
 * Publish state and control for one CMS entry.
 *
 * Saves now land in DRAFT, so this is the only thing that makes work visible to
 * visitors. The failure mode that matters is an admin believing they published
 * when they didn't — so the state is stated in plain language rather than
 * implied by an icon, and the button never silently no-ops.
 *
 * `refreshKey` changes on every save the host performs, which re-checks the
 * state; the alternative is polling, and there is nothing to poll for.
 */
export default function PublishBar({
  model,
  entryId,
  refreshKey,
}: {
  model: string;
  entryId: string;
  /** Bump to re-check after a save. */
  refreshKey: number;
}) {
  // Hygraph publishes an ENTRY, not a field. A Project is its own entry, so
  // publishing from a project page ships that project and nothing else. Every
  // other editable surface — Home, About, Atelier, Contact, Settings, and the
  // portfolio order — is a field on the single SiteData entry, so publishing
  // from any one of them ships all of them.
  //
  // That is a real constraint of the content model, not a bug to hide. Saying
  // so is the whole point of this bar: an admin who believes "Publish" is
  // scoped to the page they are looking at is exactly the person this is
  // supposed to protect.
  const siteWide = model === "SiteData";
  const [state, setState] = useState<PublishState | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!entryId) return;
    const result = await getPublishState(model, entryId);
    if ("error" in result) {
      // A failed check is not a failed save. Say nothing rather than implying
      // the content is in trouble.
      setState(null);
      return;
    }
    setState(result.state);
  }, [model, entryId]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  async function publish() {
    setPublishing(true);
    setError(null);
    const result = await publishContent(model, entryId);
    setPublishing(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    setState(result.state);
  }

  // Until the first check lands there is nothing honest to say.
  if (!state) return null;

  return (
    <div className={`${styles.bar} ${state.pending ? styles.barPending : styles.barLive}`}>
      <div className={styles.status}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.text}>
          {state.pending ? (
            <>
              <strong>Unpublished changes.</strong> You&rsquo;re seeing the draft; visitors still
              see the last published version.
              {siteWide && " Publishing ships every pending change across the site, not just this page."}
            </>
          ) : (
            <>
              <strong>Published.</strong>{" "}
              {siteWide ? "Visitors see every saved change across the site." : "Visitors see everything on this page."}
            </>
          )}
        </span>
      </div>

      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}

      <button
        type="button"
        className={styles.publish}
        onClick={publish}
        // Disabled when there is nothing to publish, so the button can never
        // look like it did something it didn't.
        disabled={publishing || !state.pending}
      >
        {publishing ? "Publishing…" : state.pending ? "Publish" : "Nothing to publish"}
      </button>
    </div>
  );
}
