"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Module-level stack so only the topmost dialog handles keys — nested dialogs
// (e.g. picker → uploader) behave correctly.
const stack: symbol[] = [];

// Count of open dialogs so page scroll stays locked until the last one closes
// (nested dialogs must not unlock the body when an inner one unmounts).
let scrollLockCount = 0;

function lockScroll() {
  if (scrollLockCount++ === 0) {
    document.body.style.overflow = "hidden";
  }
}

function unlockScroll() {
  if (--scrollLockCount === 0) {
    document.body.style.overflow = "";
  }
}

interface ModalProps {
  onClose: () => void;
  labelledBy?: string;
  /** Visual styling is owned by the caller. */
  overlayClassName?: string;
  children: ReactNode;
}

/**
 * Accessible dialog shell: focus moves in on open and restores on close, Tab is
 * trapped, Escape closes, and a backdrop mousedown closes. Visuals stay with the
 * caller via `overlayClassName`.
 */
export default function Modal({ onClose, labelledBy, overlayClassName, children }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Portal to <body> so the fixed overlay covers the whole viewport regardless
  // of ancestor transforms/filters (which would otherwise become its containing
  // block). `mounted` gates the portal until the client has a document.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // SSR gate: the portal cannot render until the client has a document, and
    // a mount effect is the documented way to express that. Nothing here is
    // derived from a prop, which is what the rule is actually aimed at.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    lockScroll();
    return unlockScroll;
  }, []);

  // Keep the latest onClose without re-running the focus-trap effect: callers
  // routinely pass a fresh closure each render, and re-running the setup steals
  // focus away from inputs (the cleanup refocuses the previously-active element,
  // then setup grabs the first focusable). Run setup once on mount instead.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Wait until the portal has actually rendered the overlay (first client
    // render returns null to match SSR), so focus-trap setup sees a real node.
    if (!mounted) return;
    const overlay = ref.current;
    const prev = document.activeElement as HTMLElement | null;
    const token = Symbol();
    stack.push(token);
    const topmost = () => stack[stack.length - 1] === token;

    if (overlay && !overlay.contains(document.activeElement)) {
      (overlay.querySelector<HTMLElement>(FOCUSABLE) ?? overlay).focus();
    }

    function onKey(e: KeyboardEvent) {
      if (!topmost() || !overlay) return;
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const f = [...overlay.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent);
      if (!f.length) {
        e.preventDefault();
        return;
      }
      // `f` is non-empty here (the length check above returns early), but the
      // compiler cannot see that through an index — read them as values it can
      // narrow instead.
      const first = f.at(0);
      const last = f.at(-1);
      if (!first || !last) return;
      const a = document.activeElement;
      if (e.shiftKey && (a === first || !overlay.contains(a))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (a === last || !overlay.contains(a))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(token), 1);
      prev?.focus?.();
    };
    // Runs once the overlay mounts: onClose is read through a ref so a fresh
    // closure each render doesn't re-run setup and disturb focus. (The
    // exhaustive-deps disable that used to sit here is gone — v7 of the plugin
    // no longer flags this, and a directive for a rule that isn't reporting is
    // just noise that outlives its reason.)
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    // Clicking the backdrop dismisses the dialog. The rule wants a keyboard
    // equivalent on the same element, but the keyboard equivalent for
    // dismissing a dialog is Escape -- bound above, on the document, per the
    // ARIA dialog pattern. A key handler here would be a second, worse one.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={ref}
      className={overlayClassName}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {children}
    </div>,
    document.body
  );
}
