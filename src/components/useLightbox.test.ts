// @vitest-environment happy-dom
//
// This hook replaced four copy-pasted controllers that had already drifted
// apart in user-visible ways. These tests pin down the behavior all four are
// now expected to share — particularly the two that differed.

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLightbox } from "./useLightbox";
import type { ImageGridItem } from "@/components/blocks/ImageGrid";
import { at } from "@/test/at";

const items: ImageGridItem[] = [
  { url: "https://media.graphassets.com/a.jpg", title: "A" },
  { url: "https://media.graphassets.com/b.jpg", title: "B" },
  { url: "https://media.graphassets.com/c.jpg", title: "C" },
];

beforeEach(() => {
  vi.useFakeTimers();
  // happy-dom has no rAF scheduling under fake timers; run the callback
  // immediately so the two-frame reveal resolves deterministically.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Dispatch a real keydown on window, as the hook's listener expects. */
function press(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key }));
  });
}

describe("useLightbox", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => useLightbox());
    expect(result.current.modal).toBeNull();
    expect(result.current.visible).toBe(false);
  });

  it("opens at the requested index and becomes visible", () => {
    const { result } = renderHook(() => useLightbox());
    act(() => result.current.open(at(items, 1).url, at(items, 1).title, items, 1));

    expect(result.current.modal).toEqual({ items, index: 1 });
    expect(result.current.visible).toBe(true);
  });

  it("advances and wraps forward", () => {
    const { result } = renderHook(() => useLightbox());
    act(() => result.current.open("", "", items, 2));

    act(() => result.current.next());
    expect(result.current.modal?.index).toBe(0); // wrapped
  });

  it("goes back and wraps around", () => {
    const { result } = renderHook(() => useLightbox());
    act(() => result.current.open("", "", items, 0));

    act(() => result.current.prev());
    expect(result.current.modal?.index).toBe(2); // wrapped backwards
  });

  it("handles a single-item gallery without dividing by zero", () => {
    const one = [at(items, 0)];
    const { result } = renderHook(() => useLightbox());
    act(() => result.current.open("", "", one, 0));

    act(() => result.current.next());
    expect(result.current.modal?.index).toBe(0);
    act(() => result.current.prev());
    expect(result.current.modal?.index).toBe(0);
  });

  describe("closing", () => {
    it("hides immediately but keeps the modal mounted for the fade", () => {
      const { result } = renderHook(() => useLightbox());
      act(() => result.current.open("", "", items, 0));

      act(() => result.current.close());
      // Still mounted so the CSS transition can run...
      expect(result.current.visible).toBe(false);
      expect(result.current.modal).not.toBeNull();

      act(() => vi.advanceTimersByTime(300));
      // ...and only then unmounted.
      expect(result.current.modal).toBeNull();
    });

    it("cancels a pending close when reopened mid-fade", () => {
      // Without cancelling, the in-flight timer would null the modal ~300ms
      // after the user had already reopened it.
      const { result } = renderHook(() => useLightbox());
      act(() => result.current.open("", "", items, 0));
      act(() => result.current.close());
      act(() => result.current.open("", "", items, 2));

      act(() => vi.advanceTimersByTime(600));
      expect(result.current.modal).toEqual({ items, index: 2 });
      expect(result.current.visible).toBe(true);
    });

    it("does not set state after unmount", () => {
      const { result, unmount } = renderHook(() => useLightbox());
      act(() => result.current.open("", "", items, 0));
      act(() => result.current.close());
      unmount();
      // The pending timer must not fire into a gone component.
      expect(() => act(() => vi.advanceTimersByTime(600))).not.toThrow();
    });
  });

  describe("arrow keys", () => {
    // Contact never registered this listener at all, so the same gallery
    // navigated with the keyboard on three pages and not on the fourth.
    it("advances on ArrowRight while open", () => {
      const { result } = renderHook(() => useLightbox());
      act(() => result.current.open("", "", items, 0));

      press("ArrowRight");
      expect(result.current.modal?.index).toBe(1);
    });

    it("goes back on ArrowLeft while open", () => {
      const { result } = renderHook(() => useLightbox());
      act(() => result.current.open("", "", items, 1));

      press("ArrowLeft");
      expect(result.current.modal?.index).toBe(0);
    });

    // About and Atelier bound this unconditionally; the project page did not.
    it("ignores arrow keys while closed, so ordinary browsing is unaffected", () => {
      const { result } = renderHook(() => useLightbox());
      press("ArrowRight");
      press("ArrowLeft");
      expect(result.current.modal).toBeNull();
    });

    it("stops listening after the modal fully closes", () => {
      const { result } = renderHook(() => useLightbox());
      act(() => result.current.open("", "", items, 0));
      act(() => result.current.close());
      act(() => vi.advanceTimersByTime(300));

      press("ArrowRight");
      expect(result.current.modal).toBeNull();
    });

    it("ignores keys it does not handle", () => {
      const { result } = renderHook(() => useLightbox());
      act(() => result.current.open("", "", items, 1));

      for (const key of ["ArrowUp", "ArrowDown", "a", "Enter", " "]) press(key);
      expect(result.current.modal?.index).toBe(1);
    });

    it("removes its listener on unmount", () => {
      const remove = vi.spyOn(window, "removeEventListener");
      const { result, unmount } = renderHook(() => useLightbox());
      act(() => result.current.open("", "", items, 0));
      unmount();
      expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
      remove.mockRestore();
    });
  });

  it("never touches body scroll — Modal owns that with a refcount", () => {
    // The four page clients each set body.style.overflow directly, and their
    // unconditional cleanup fought Modal's reference count.
    const { result } = renderHook(() => useLightbox());
    act(() => result.current.open("", "", items, 0));
    expect(document.body.style.overflow).toBe("");

    act(() => result.current.close());
    act(() => vi.advanceTimersByTime(300));
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps stable callback identities across renders", () => {
    // BlockSection receives `open` as a prop; a new identity each render would
    // defeat memoization down the tree.
    const { result, rerender } = renderHook(() => useLightbox());
    const first = { ...result.current };
    rerender();
    expect(result.current.open).toBe(first.open);
    expect(result.current.close).toBe(first.close);
    expect(result.current.next).toBe(first.next);
    expect(result.current.prev).toBe(first.prev);
  });
});
