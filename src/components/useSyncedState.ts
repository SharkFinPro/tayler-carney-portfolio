"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

/**
 * State that resets when the value it was derived from changes.
 *
 * Every page client here holds an editable copy of server-supplied content, and
 * each did the resync in an effect:
 *
 *     const [blocks, setBlocks] = useState(initialBlocks);
 *     useEffect(() => { setBlocks(initialBlocks); }, [initialBlocks]);
 *
 * That renders the stale value first, then re-renders — so a navigation shows
 * the previous page's content for one frame. It is also what
 * `react-hooks/set-state-in-effect` is pointing at.
 *
 * Comparing during render and setting immediately is React's documented
 * alternative: React discards the in-progress render and restarts with the new
 * state *before* the browser paints, so the stale frame never reaches the
 * screen. Setting state during render is only legal for this specific
 * pattern — updating a component's own state in response to a changed prop.
 */
export function useSyncedState<T>(source: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(source);
  const [lastSource, setLastSource] = useState(source);

  if (lastSource !== source) {
    setLastSource(source);
    setValue(source);
  }

  return [value, setValue];
}

/**
 * State that resets to a fixed value whenever `key` changes.
 *
 * The variant needed where the reset target is not the source itself — the
 * project page closes its editor whenever the project changes, rather than
 * tracking a prop.
 */
export function useResetOnChange<T>(
  key: unknown,
  resetTo: T
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(resetTo);
  const [lastKey, setLastKey] = useState(key);

  if (lastKey !== key) {
    setLastKey(key);
    setValue(resetTo);
  }

  return [value, setValue];
}
