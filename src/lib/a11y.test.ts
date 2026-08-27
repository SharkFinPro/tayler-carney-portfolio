// The keyboard half of `clickableProps`.
//
// This helper exists so a non-<button> element that wraps flow content is still
// operable without a mouse, which is a promise nothing else in the codebase
// checks: the jsx-a11y rules can see that `role`/`tabIndex`/`onKeyDown` are
// present, but not that pressing Space actually activates the thing, and not
// that the page does not scroll when it does. Both are silent failures — the
// element looks correct in review and in the DOM, and simply does nothing for
// a keyboard user.

import { describe, expect, it, vi } from "vitest";
import type { KeyboardEvent } from "react";
import { clickableProps } from "./a11y";

/** A KeyboardEvent stand-in with only the two members the handler touches. */
function keyEvent(key: string) {
  return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
  };
}

describe("clickableProps — the assistive-tech contract", () => {
  it("exposes the element as a button, in the tab order, with its label", () => {
    const props = clickableProps(vi.fn(), "Open the lightbox");

    expect(props.role).toBe("button");
    expect(props.tabIndex).toBe(0);
    expect(props["aria-label"]).toBe("Open the lightbox");
  });

  it("activates on click", () => {
    const onActivate = vi.fn();
    clickableProps(onActivate, "x").onClick();

    expect(onActivate).toHaveBeenCalledOnce();
  });
});

describe("clickableProps — keyboard activation", () => {
  // The two keys that activate a native <button>. Anything operable by mouse
  // has to answer to both, or the element is a trap for keyboard users.
  it.each(["Enter", " "])("activates on %j", (key) => {
    const onActivate = vi.fn();
    const event = keyEvent(key);

    clickableProps(onActivate, "x").onKeyDown(event);

    expect(onActivate).toHaveBeenCalledOnce();
  });

  // Space scrolls the page by default. Activating *and* scrolling is arguably
  // worse than not activating at all: the thing opens and the viewport jumps.
  it.each(["Enter", " "])("suppresses the browser default for %j", (key) => {
    const event = keyEvent(key);

    clickableProps(vi.fn(), "x").onKeyDown(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it.each(["Tab", "Escape", "a", "ArrowDown", "Shift", "", "enter", "Spacebar"])(
    "ignores %j, and lets the browser keep it",
    (key) => {
      const onActivate = vi.fn();
      const event = keyEvent(key);

      clickableProps(onActivate, "x").onKeyDown(event);

      expect(onActivate).not.toHaveBeenCalled();
      // Tab in particular: swallowing it would break focus navigation.
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
  );

  it("activates once per keypress rather than once per element", () => {
    const onActivate = vi.fn();
    const props = clickableProps(onActivate, "x");

    props.onKeyDown(keyEvent("Enter"));
    props.onKeyDown(keyEvent(" "));

    expect(onActivate).toHaveBeenCalledTimes(2);
  });
});
