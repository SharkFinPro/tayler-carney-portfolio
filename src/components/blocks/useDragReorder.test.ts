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

// ── Keyboard reordering ──────────────────────────────────────────────────────
//
// The whole reason `keyboardReorder` exists: a drag-and-drop list that can only
// be reordered by dragging cannot be reordered at all without a pointer. That
// makes these key handlers the accessible path, not a convenience — and the
// announcement is the only feedback a screen-reader user gets, since the visual
// change is exactly what they cannot see.

/** Press `key` on the card for `id`, and report whether the default was suppressed. */
function press(result: { current: ReturnType<typeof useDragReorder<Item>> }, id: string, key: string) {
  const preventDefault = vi.fn();
  act(() => {
    result.current.keyboardReorder(id)({ key, preventDefault } as unknown as React.KeyboardEvent);
  });
  return { preventDefault };
}

describe("useDragReorder — keyboard reordering", () => {
  it.each(["ArrowUp", "ArrowLeft"])("moves a card one place earlier with %s", (key) => {
    const { result, current } = setup();

    press(result, "b", key);

    expect(current().map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it.each(["ArrowDown", "ArrowRight"])("moves a card one place later with %s", (key) => {
    const { result, current } = setup();

    press(result, "b", key);

    expect(current().map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  it("sends a card to the front with Home", () => {
    const { result, current } = setup();

    press(result, "c", "Home");

    expect(current().map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("sends a card to the back with End", () => {
    const { result, current } = setup();

    press(result, "a", "End");

    expect(current().map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it.each([
    ["ArrowUp", "a"],
    ["Home", "a"],
    ["ArrowDown", "c"],
    ["End", "c"],
  ])("leaves the list alone when %s cannot move %j any further", (key, id) => {
    const { result, current } = setup();

    press(result, id, key);

    expect(current().map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it.each(["Tab", "Enter", " ", "Escape", "a", "PageUp"])(
    "ignores %j, and lets the browser keep it",
    (key) => {
      const { result, current } = setup();

      const { preventDefault } = press(result, "b", key);

      expect(current().map((i) => i.id)).toEqual(["a", "b", "c"]);
      expect(preventDefault).not.toHaveBeenCalled();
    }
  );

  it.each(["ArrowUp", "ArrowDown", "Home", "End"])(
    "suppresses the browser default for %j, which would otherwise scroll",
    (key) => {
      const { result } = setup();

      const { preventDefault } = press(result, "b", key);

      expect(preventDefault).toHaveBeenCalledOnce();
    }
  );

  it("does nothing for a key that is not in the list", () => {
    const { result, current } = setup();

    press(result, "not-a-card", "ArrowUp");

    expect(current().map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("reorders repeatedly, each move starting from the previous result", () => {
    const { result, current } = setup();

    press(result, "a", "ArrowDown");
    press(result, "a", "ArrowDown");

    expect(current().map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(onCommit).toHaveBeenCalledTimes(2);
  });
});

describe("useDragReorder — what a screen reader is told", () => {
  // The visual change is precisely what this user cannot see, so the live
  // region is the entire feedback channel.
  it("announces the new position, one-based and with the total", () => {
    const { result } = setup();

    press(result, "a", "End");

    expect(result.current.announcement).toBe("Moved to position 3 of 3.");
  });

  it("announces each intermediate position as the card walks down", () => {
    const { result } = setup();

    press(result, "a", "ArrowDown");
    expect(result.current.announcement).toBe("Moved to position 2 of 3.");

    press(result, "a", "ArrowDown");
    expect(result.current.announcement).toBe("Moved to position 3 of 3.");
  });

  // Silence would read as "the key did nothing", which is indistinguishable
  // from a broken handler.
  it("says why nothing moved at the start of the list", () => {
    const { result } = setup();

    press(result, "a", "ArrowUp");

    expect(result.current.announcement).toBe("Already at the start of the list.");
  });

  it("says why nothing moved at the end of the list", () => {
    const { result } = setup();

    press(result, "c", "ArrowDown");

    expect(result.current.announcement).toBe("Already at the end of the list.");
  });
});
