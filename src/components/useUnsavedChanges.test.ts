// @vitest-environment happy-dom
//
// The guard that stands between an admin mid-edit and a closed tab.
//
// Twenty lines, and worth pinning because both failure directions are silent.
// A listener that stops being registered loses someone's draft with no error
// anywhere; one that stops being removed warns about unsaved changes on a page
// that has none, which trains the person to click through the dialog — and
// then it does not protect them the time it matters.

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUnsavedChanges } from "./useUnsavedChanges";

type Listener = Parameters<typeof window.addEventListener>[1];

let add: ReturnType<typeof vi.spyOn>;
let remove: ReturnType<typeof vi.spyOn>;

/**
 * The `beforeunload` handlers registered on window so far, in order.
 *
 * The cast is because `vi.spyOn`'s recorded calls are `unknown[]` here; the
 * shape is fixed by `addEventListener`'s own signature, which is what the
 * tuple below names.
 */
const registered = (): Listener[] =>
  (add.mock.calls as unknown as [type: string, listener: Listener][])
    .filter(([type]) => type === "beforeunload")
    .map(([, listener]) => listener);

beforeEach(() => {
  add = vi.spyOn(window, "addEventListener");
  remove = vi.spyOn(window, "removeEventListener");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("while there is nothing to lose", () => {
  it("registers no listener", () => {
    renderHook(() => useUnsavedChanges(false));
    expect(registered()).toHaveLength(0);
  });

  it("registers none when the editor goes clean again", () => {
    const { rerender } = renderHook(({ dirty }) => useUnsavedChanges(dirty), {
      initialProps: { dirty: true },
    });
    expect(registered()).toHaveLength(1);

    rerender({ dirty: false });

    // Removed on the way out, and not replaced.
    expect(remove).toHaveBeenCalledWith("beforeunload", registered()[0]);
    expect(registered()).toHaveLength(1);
  });
});

describe("while there are unsaved changes", () => {
  it("registers a beforeunload listener", () => {
    renderHook(() => useUnsavedChanges(true));
    expect(registered()).toHaveLength(1);
  });

  // Browsers differ on which of the two they honour, so the handler does both.
  // Dropping either one means no dialog in some browser and no way to notice.
  it("both preventDefault()s and sets returnValue", () => {
    renderHook(() => useUnsavedChanges(true));

    const handler = registered()[0] as (e: BeforeUnloadEvent) => void;
    const event = { preventDefault: vi.fn(), returnValue: undefined } as unknown as BeforeUnloadEvent & {
      preventDefault: ReturnType<typeof vi.fn>;
    };

    handler(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe("");
  });

  it("removes the listener on unmount, so a closed editor stops warning", () => {
    const { unmount } = renderHook(() => useUnsavedChanges(true));
    const handler = registered()[0];

    unmount();

    expect(remove).toHaveBeenCalledWith("beforeunload", handler);
  });

  // A warning that fires on a saved page is worse than none: it teaches the
  // admin to dismiss the dialog without reading it.
  it("stops warning once the changes are saved", () => {
    const { rerender } = renderHook(({ dirty }) => useUnsavedChanges(dirty), {
      initialProps: { dirty: true },
    });
    const handler = registered()[0];

    rerender({ dirty: false });

    expect(remove).toHaveBeenCalledWith("beforeunload", handler);
  });

  it("warns again if the editor becomes dirty a second time", () => {
    const { rerender } = renderHook(({ dirty }) => useUnsavedChanges(dirty), {
      initialProps: { dirty: true },
    });

    rerender({ dirty: false });
    rerender({ dirty: true });

    expect(registered()).toHaveLength(2);
  });

  // The effect depends on `dirty` alone, so a re-render that changes nothing
  // must not churn the listener.
  it("does not re-register on a re-render that changes nothing", () => {
    const { rerender } = renderHook(({ dirty }) => useUnsavedChanges(dirty), {
      initialProps: { dirty: true },
    });

    rerender({ dirty: true });
    rerender({ dirty: true });

    expect(registered()).toHaveLength(1);
  });
});
