"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportError } from "@/lib/observability";
import styles from "./error.module.scss";

// Root error boundary. Catches render/data failures from any route (including a
// CMS/Hygraph outage on the project pages) and offers an honest recovery path
// instead of masking the fault as a 404.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side, so this reaches the browser console rather than the server
    // log — but it goes through the same reporter, so wiring a client SDK
    // later is one call rather than a hunt for every boundary.
    reportError({
      scope: "route",
      context: "route-error-boundary",
      error,
      correlationId: error.digest,
    });
  }, [error]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <span className={styles.eyebrow}>Error · Fault in the pattern</span>
        <h1 className={styles.title}>Something came apart at the seam.</h1>
        <p className={styles.body}>
          A piece of this page failed to load. The work itself is intact — this
          is a temporary fault on our side, not a page that no longer exists.
          Try again in a moment.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.retry} onClick={reset}>
            Try again
          </button>
          <Link href="/portfolio" className={styles.link}>
            Back to the archive
          </Link>
        </div>
        {error.digest && (
          <p className={styles.digest}>Reference: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
