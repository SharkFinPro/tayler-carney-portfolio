"use client";

import { useCallback, useRef, useState } from "react";

interface DragReorder {
  /** Live announcement for an aria-live region. */
  announcement: string;
  /** Ref for the list container (used to locate items during pointer drag). */
  listRef: React.RefObject<HTMLDivElement | null>;
  /** Index currently being pointer-dragged, or null. */
  dragIndex: number | null;
  /** Props to spread onto each item's drag handle. */
  handleProps: (index: number, label: string) => {
    onKeyDown: (e: React.KeyboardEvent) => void;
    onPointerDown: (e: React.PointerEvent) => void;
    "aria-label": string;
    role: string;
    tabIndex: number;
  };
}

// Pointer + keyboard reorder for a vertical list. Keyboard: ArrowUp/Down move by
// one, Home/End jump to ends — each move announces the new position for screen
// readers. Pointer: drag the handle; the item under the pointer's midpoint
// becomes the new position, committed live.
export function useDragReorder(
  count: number,
  onReorder: (from: number, to: number) => void
): DragReorder {
  const [announcement, setAnnouncement] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  const move = useCallback(
    (from: number, to: number, label: string) => {
      const clamped = Math.max(0, Math.min(count - 1, to));
      if (clamped === from) return;
      onReorder(from, clamped);
      setAnnouncement(`${label}: moved to position ${clamped + 1} of ${count}.`);
    },
    [count, onReorder]
  );

  const handleProps = useCallback(
    (index: number, label: string) => ({
      role: "button",
      tabIndex: 0,
      "aria-label": `Reorder ${label}. Use arrow keys to move.`,
      onKeyDown: (e: React.KeyboardEvent) => {
        let to: number | null = null;
        if (e.key === "ArrowUp") to = index - 1;
        else if (e.key === "ArrowDown") to = index + 1;
        else if (e.key === "Home") to = 0;
        else if (e.key === "End") to = count - 1;
        if (to === null) return;
        e.preventDefault();
        move(index, to, label);
      },
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        dragIndexRef.current = index;
        setDragIndex(index);

        const onPointerMove = (ev: PointerEvent) => {
          const from = dragIndexRef.current;
          const list = listRef.current;
          if (from === null || !list) return;
          const children = Array.from(list.querySelectorAll<HTMLElement>("[data-block-item]"));
          let target = from;
          for (let i = 0; i < children.length; i++) {
            const rect = children[i].getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            if (ev.clientY < mid) {
              target = i;
              break;
            }
            target = i;
          }
          if (target !== from) {
            onReorder(from, target);
            dragIndexRef.current = target;
            setDragIndex(target);
          }
        };

        const onPointerUp = () => {
          const final = dragIndexRef.current;
          if (final !== null) setAnnouncement(`${label}: moved to position ${final + 1} of ${count}.`);
          dragIndexRef.current = null;
          setDragIndex(null);
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
      },
    }),
    [count, move, onReorder]
  );

  return { announcement, listRef, dragIndex, handleProps };
}
