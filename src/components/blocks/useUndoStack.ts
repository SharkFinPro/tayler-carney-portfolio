"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Undo history for the block editor.
 *
 * Every structural change in the editor writes and publishes immediately, so
 * deleting a block, dropping it in the wrong place, or overwriting a paragraph
 * had no recovery path at all — `ConfirmDialog` warns that a delete "can't be
 * undone", which was accurate but not much comfort.
 *
 * ## Why this is in-session rather than stored in the CMS
 *
 * The obvious design is to keep the last N layouts in the CMS alongside the
 * current one. That was the plan, and measuring it changed my mind: a block
 * layout is the entire page body, so five versions is five copies of every
 * heading, caption, and image reference. There is no way to select part of a
 * Hygraph JSON field, so **every visitor read would transfer all of them** —
 * paying a permanent bandwidth cost on the public site to serve an admin-only
 * feature.
 *
 * A separate `…History` field would avoid that, since public queries simply
 * would not select it — but that needs a Hygraph schema change, which is not
 * something this code can make for you.
 *
 * So this covers the realistic failure — "I just did that by accident" — with
 * no storage cost and no risk to the read path. It does not survive a reload,
 * and the UI says so rather than implying a durability it doesn't have.
 */
export type UndoStack<T> = {
  /** Record the state *before* a change. Call immediately prior to mutating. */
  push: (snapshot: T) => void;
  /** Most recent snapshot, or null when there is nothing to undo. */
  pop: () => T | null;
  /** Discard everything — e.g. after the underlying entry is reloaded. */
  clear: () => void;
  /** How many undo steps are available. Drives the button's label and state. */
  depth: number;
};

/**
 * Bounded so a long editing session can't grow without limit. Twenty steps is
 * far more than the "undo the thing I just did" this exists for.
 */
const MAX_DEPTH = 20;

export function useUndoStack<T>(): UndoStack<T> {
  // The stack lives in a ref so pushing doesn't re-render; `depth` is the
  // separate piece of state the UI actually needs.
  const stack = useRef<T[]>([]);
  const [depth, setDepth] = useState(0);

  const push = useCallback((snapshot: T) => {
    stack.current = [...stack.current, snapshot].slice(-MAX_DEPTH);
    setDepth(stack.current.length);
  }, []);

  const pop = useCallback((): T | null => {
    if (stack.current.length === 0) return null;
    const next = [...stack.current];
    const snapshot = next.pop() ?? null;
    stack.current = next;
    setDepth(next.length);
    return snapshot;
  }, []);

  const clear = useCallback(() => {
    stack.current = [];
    setDepth(0);
  }, []);

  return { push, pop, clear, depth };
}
