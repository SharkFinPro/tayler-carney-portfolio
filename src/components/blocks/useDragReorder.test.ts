// @vitest-environment happy-dom
//
// One property is under test here, and it is the one that was wrong: what the
// list looked like BEFORE a reorder started.
//
// A pointer drag reorders live, on every pointermove, so by the time the drag
// commits the caller's own state already holds the new arrangement. A caller
// that wants to undo the drag therefore cannot reconstruct the previous order
// from anything it owns — it has to be handed it. When it wasn't, "Undo" after
// a drag restored the order that had just been committed, i.e. did nothing.

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDragReorder } from "./useDragReorder";

type Item = { id: string };
const ITEMS: Item[] = [{ id: "a" }, { id: "b" }, { id: "c" }];

/**
 * Stack the cards vertically at known coordinates.
 *
 * happy-dom reports every rect as zeroes, and the drag decides where to insert
 * from the cards' midpoints — so without this the list can never reorder and
 * the test would pass for the wrong reason.
 */
function layoutRows(height = 100) {
  const tops = new Map<HTMLElement, number>();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const top = tops.get(this) ?? 0;
      return {
        top,
        bottom: top + height,
        left: 0,
        right: 200,
        width: 200,
        height,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    }
  );
  return {
    place(el: HTMLElement, row: number) {
      tops.set(el, row * height);
    },
  };
}

function pointerEvent(type: string, y: number) {
  const e = new Event(type, { bubbles: true }) as Event & { clientX: number; clientY: number };
  e.clientX = 10;
  e.clientY = y;
  return e;
}

let onCommit: ReturnType<typeof vi.fn<(ordered: string[], before: string[]) => void>>;

beforeEach(() => {
  onCommit = vi.fn<(ordered: string[], before: string[]) => void>();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setup() {
  const layout = layoutRows();
  let items = [...ITEMS];
  const { result, rerender } = renderHook(() =>
    useDragReorder<Item>({
      items,
      setItems: (next) => {
        items = next;
      },
      getKey: (i) => i.id,
      onCommit,
    })
  );

  // Register a real element per card, laid out in list order.
  const els = ITEMS.map((item, row) => {
    const el = document.createElement("div");
    document.body.append(el);
    layout.place(el, row);
    act(() => result.current.registerCard(item.id)(el));
    return el;
  });

  return { result, rerender, els, current: () => items };
}

describe("useDragReorder — the order before the interaction", () => {
  it("reports the pre-drag order alongside the committed one", () => {
    const { result, current } = setup();

    act(() => {
      result.current.startDrag(0, "a", {
        button: 0,
        clientX: 10,
        clientY: 0,
        preventDefault: () => {},
      } as unknown as React.PointerEvent);
    });

    // Drag "a" down past the last card and drop it.
    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", 260));
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup", 260));
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    const [ordered, before] = onCommit.mock.calls[0] as [string[], string[]];

    // The live list really did change — otherwise this test proves nothing.
    expect(ordered).not.toEqual(["a", "b", "c"]);
    expect(current().map((i) => i.id)).toEqual(ordered);

    // And the caller is handed what it looked like beforehand, which by this
    // point exists nowhere else.
    expect(before).toEqual(["a", "b", "c"]);
  });

  it("reports it for keyboard reordering too", () => {
    const { result } = setup();

    act(() => {
      result.current.keyboardReorder("a")({
        key: "ArrowDown",
        preventDefault: () => {},
      } as unknown as React.KeyboardEvent);
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    const [ordered, before] = onCommit.mock.calls[0] as [string[], string[]];
    expect(ordered).toEqual(["b", "a", "c"]);
    expect(before).toEqual(["a", "b", "c"]);
  });

  it("does not commit when the drag ends where it began", () => {
    const { result } = setup();

    act(() => {
      result.current.startDrag(0, "a", {
        button: 0,
        clientX: 10,
        clientY: 0,
        preventDefault: () => {},
      } as unknown as React.PointerEvent);
    });
    act(() => {
      window.dispatchEvent(pointerEvent("pointerup", 0));
    });

    const [ordered, before] = onCommit.mock.calls[0] as [string[], string[]];
    expect(ordered).toEqual(before);
  });
});
