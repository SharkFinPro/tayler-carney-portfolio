// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useUndoStack } from "./useUndoStack";

describe("useUndoStack", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useUndoStack<string>());
    expect(result.current.depth).toBe(0);
    expect(result.current.pop()).toBeNull();
  });

  it("returns snapshots most-recent-first", () => {
    const { result } = renderHook(() => useUndoStack<string>());
    act(() => {
      result.current.push("one");
      result.current.push("two");
    });

    expect(result.current.depth).toBe(2);
    let popped: string | null = null;
    act(() => {
      popped = result.current.pop();
    });
    expect(popped).toBe("two");
    expect(result.current.depth).toBe(1);
  });

  it("reports null once exhausted rather than throwing", () => {
    const { result } = renderHook(() => useUndoStack<string>());
    act(() => result.current.push("only"));
    act(() => {
      result.current.pop();
    });
    expect(result.current.pop()).toBeNull();
    expect(result.current.depth).toBe(0);
  });

  it("bounds the stack so a long session cannot grow without limit", () => {
    const { result } = renderHook(() => useUndoStack<number>());
    act(() => {
      for (let i = 0; i < 60; i++) result.current.push(i);
    });
    expect(result.current.depth).toBe(20);
  });

  it("drops the OLDEST entries when bounded, keeping recent history", () => {
    // The whole point is undoing what you just did, so the newest steps are
    // the ones that must survive.
    const { result } = renderHook(() => useUndoStack<number>());
    act(() => {
      for (let i = 0; i < 25; i++) result.current.push(i);
    });
    let popped: number | null = null;
    act(() => {
      popped = result.current.pop();
    });
    expect(popped).toBe(24);
  });

  it("clears everything", () => {
    const { result } = renderHook(() => useUndoStack<string>());
    act(() => {
      result.current.push("a");
      result.current.push("b");
      result.current.clear();
    });
    expect(result.current.depth).toBe(0);
    expect(result.current.pop()).toBeNull();
  });

  it("does not mutate the snapshots it is given", () => {
    const { result } = renderHook(() => useUndoStack<string[]>());
    const original = ["a", "b"];
    act(() => result.current.push(original));

    let popped: string[] | null = null;
    act(() => {
      popped = result.current.pop();
    });
    expect(popped).toBe(original);
    expect(original).toEqual(["a", "b"]);
  });

  it("keeps stable function identities across renders", () => {
    const { result, rerender } = renderHook(() => useUndoStack<string>());
    const first = { ...result.current };
    rerender();
    expect(result.current.push).toBe(first.push);
    expect(result.current.pop).toBe(first.pop);
    expect(result.current.clear).toBe(first.clear);
  });
});
