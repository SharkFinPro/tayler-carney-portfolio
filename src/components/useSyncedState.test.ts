// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useResetOnChange, useSyncedState } from "./useSyncedState";

describe("useSyncedState", () => {
  it("starts at the source value", () => {
    const { result } = renderHook(() => useSyncedState("a"));
    expect(result.current[0]).toBe("a");
  });

  it("keeps local edits while the source is unchanged", () => {
    const { result, rerender } = renderHook(({ src }) => useSyncedState(src), {
      initialProps: { src: "a" },
    });

    act(() => result.current[1]("edited"));
    expect(result.current[0]).toBe("edited");

    // A re-render with the same source must not clobber the edit — that would
    // discard whatever the admin just typed.
    rerender({ src: "a" });
    expect(result.current[0]).toBe("edited");
  });

  it("resets when the source changes", () => {
    const { result, rerender } = renderHook(({ src }) => useSyncedState(src), {
      initialProps: { src: "a" },
    });

    act(() => result.current[1]("edited"));
    rerender({ src: "b" });
    expect(result.current[0]).toBe("b");
  });

  it("compares by identity, so a new array with equal contents still resets", () => {
    // The page clients pass a memoized array; a genuinely new one means the
    // server sent new content.
    const first = ["x"];
    const { result, rerender } = renderHook(({ src }) => useSyncedState(src), {
      initialProps: { src: first },
    });

    act(() => result.current[1](["edited"]));
    rerender({ src: ["x"] });
    expect(result.current[0]).toEqual(["x"]);
  });

  it("accepts an updater function like useState", () => {
    const { result } = renderHook(() => useSyncedState(1));
    act(() => result.current[1]((n) => n + 1));
    expect(result.current[0]).toBe(2);
  });

  it("handles a source changing several times", () => {
    const { result, rerender } = renderHook(({ src }) => useSyncedState(src), {
      initialProps: { src: "a" },
    });
    rerender({ src: "b" });
    expect(result.current[0]).toBe("b");
    rerender({ src: "c" });
    expect(result.current[0]).toBe("c");
  });
});

describe("useResetOnChange", () => {
  it("starts at the reset value, not the key", () => {
    const { result } = renderHook(() => useResetOnChange("k", false));
    expect(result.current[0]).toBe(false);
  });

  it("keeps local state while the key is unchanged", () => {
    const { result, rerender } = renderHook(({ k }) => useResetOnChange(k, false), {
      initialProps: { k: "k1" },
    });

    act(() => result.current[1](true));
    rerender({ k: "k1" });
    expect(result.current[0]).toBe(true);
  });

  it("resets to the fixed value when the key changes", () => {
    // The project page closes its editor when you navigate to another project.
    const { result, rerender } = renderHook(({ k }) => useResetOnChange(k, false), {
      initialProps: { k: "project-a" },
    });

    act(() => result.current[1](true));
    rerender({ k: "project-b" });
    expect(result.current[0]).toBe(false);
  });

  it("resets to the fixed value rather than to the key", () => {
    const { result, rerender } = renderHook(({ k }) => useResetOnChange(k, "closed"), {
      initialProps: { k: 1 },
    });
    act(() => result.current[1]("open"));
    rerender({ k: 2 });
    expect(result.current[0]).toBe("closed");
  });
});
