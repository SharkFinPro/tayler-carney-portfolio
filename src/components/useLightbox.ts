"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageGridItem } from "@/components/blocks/ImageGrid";

/**
 * Controller for the full-screen image lightbox.
 *
 * This was previously copy-pasted into four page clients — About, Atelier,
 * Contact, and the project detail page — at roughly 45 lines each. The copies
 * had already drifted apart in two ways that were user-visible:
 *
 *   - Contact never registered the arrow-key listener at all, so the same
 *     gallery navigated with the keyboard on three pages and not on the fourth.
 *   - About and Atelier bound the arrow-key listener unconditionally, while the
 *     project page correctly bound it only while the lightbox was open.
 *
 * Both are resolved here by there being one implementation.
 *
 * Body scroll is deliberately NOT handled: `Modal` already owns it with a
 * reference count so nested dialogs behave, and the page clients' own
 * `document.body.style.overflow` effects were fighting that count — their
 * unconditional cleanup reset the style while the refcount still expected a
 * lock.
 */

export type LightboxState = {
  items: ImageGridItem[];
  index: number;
};

/**
 * Matches the `onOpen` signature `ImageGrid` calls. `src` and `title` are
 * redundant with `items[index]` and go unused, but the call sites pass them.
 */
export type OpenLightbox = (
  src: string,
  title: string,
  items: ImageGridItem[],
  index: number
) => void;

export type Lightbox = {
  /** Current selection, or null when closed. */
  modal: LightboxState | null;
  /** Drives the CSS fade; briefly false while opening and while closing. */
  visible: boolean;
  open: OpenLightbox;
  close: () => void;
  next: () => void;
  prev: () => void;
};

/** Must match the overlay's CSS transition, or the fade-out is cut short. */
const CLOSE_TRANSITION_MS = 300;

export function useLightbox(): Lightbox {
  const [modal, setModal] = useState<LightboxState | null>(null);
  const [visible, setVisible] = useState(false);

  // Cleared on unmount so a close that lands after navigation doesn't set
  // state on a gone component.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback<OpenLightbox>((_src, _title, items, index) => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setModal({ items, index });
    // Two frames: the first mounts the overlay in its hidden state, the second
    // flips the class so the transition actually runs. One frame is not enough
    // — the browser coalesces the mount and the class change into one paint.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    closeTimer.current = setTimeout(() => {
      setModal(null);
      closeTimer.current = null;
    }, CLOSE_TRANSITION_MS);
  }, []);

  const next = useCallback(() => {
    setModal((prev) =>
      prev ? { ...prev, index: (prev.index + 1) % prev.items.length } : prev
    );
  }, []);

  const prev = useCallback(() => {
    setModal((p) =>
      p ? { ...p, index: (p.index - 1 + p.items.length) % p.items.length } : p
    );
  }, []);

  // Arrow keys steer the lightbox, but only while it is open — otherwise the
  // listener hijacks arrow keys during ordinary browsing.
  useEffect(() => {
    if (!modal) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [modal, next, prev]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  return { modal, visible, open, close, next, prev };
}
