"use client";

import { ReactNode, useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Module-level stack so only the topmost dialog handles keys — nested dialogs
// (e.g. picker → uploader) behave correctly.
const stack: symbol[] = [];

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

  // Keep the latest onClose without re-running the focus-trap effect: callers
  // routinely pass a fresh closure each render, and re-running the setup steals
  // focus away from inputs (the cleanup refocuses the previously-active element,
  // then setup grabs the first focusable). Run setup once on mount instead.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
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
      const first = f[0];
      const last = f[f.length - 1];
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
    // Mount-once: onClose is read through a ref so a fresh closure each render
    // doesn't re-run setup and disturb focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
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
    </div>
  );
}
