import type { KeyboardEvent } from "react";

// Props that make a non-<button> element (a <div>/<figure> wrapping an image,
// say) operable by keyboard and exposed to assistive tech as a button. Use this
// where a native <button> can't be used because the element wraps flow content
// (headings, captions) that isn't valid inside a button.
export function clickableProps(onActivate: () => void, label: string) {
  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": label,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
