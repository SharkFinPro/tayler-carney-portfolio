"use client";

import { useEffect } from "react";

/**
 * Warns before the tab closes or reloads while `dirty` is true, so an admin
 * mid-edit doesn't silently lose a draft. (In-app <Link> navigations are not
 * intercepted — the App Router has no stable cancel hook for them — but
 * close/reload/back-out cover the common data-loss paths.)
 */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Required by some browsers for the prompt to appear.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
