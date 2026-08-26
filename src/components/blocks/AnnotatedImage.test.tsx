// @vitest-environment happy-dom
//
// The accessibility contract of this block is the part a reviewer cannot see
// by reading it, and the part that quietly breaks: that every note is readable
// without operating anything, and that each marker is a real control tied to
// the note it points at. Those are what this pins.

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AnnotatedImage from "./AnnotatedImage";
import type { ImageAnnotation } from "./blocks";

// next/image needs no mock here: with width/height set it renders a plain
// <img>, which is all these assertions look at.

const IMAGE = { url: "https://media.graphassets.com/abc", altText: "A wool blazer" };

const POINTS: ImageAnnotation[] = [
  { x: 25, y: 40, label: "Shoulder seam", detail: "Set 1cm forward of the anatomical line." },
  { x: 70, y: 80, label: "Bar tack", detail: "Reinforces the pocket mouth." },
];

afterEach(cleanup);

function renderBlock(points = POINTS) {
  return render(<AnnotatedImage image={IMAGE} points={points} heading="Construction detail" />);
}

describe("AnnotatedImage — the legend", () => {
  it("renders every note as text, with nothing to operate first", () => {
    renderBlock();
    // Not "appears on hover", not "appears when selected" — present on load.
    expect(screen.getByText("Shoulder seam")).toBeTruthy();
    expect(screen.getByText("Set 1cm forward of the anatomical line.")).toBeTruthy();
    expect(screen.getByText("Bar tack")).toBeTruthy();
  });

  it("is an ordered list, so the numbering is structural rather than painted on", () => {
    const { container } = renderBlock();
    expect(container.querySelector("ol")).toBeTruthy();
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
  });
});

describe("AnnotatedImage — the markers", () => {
  it("renders one real button per point", () => {
    renderBlock();
    const markers = screen.getAllByRole("button");
    expect(markers).toHaveLength(2);
    expect(markers.map((m) => m.textContent)).toEqual(["1", "2"]);
  });

  it("points each marker at its own note, so it announces the text and not just a number", () => {
    const { container } = renderBlock();
    const markers = screen.getAllByRole("button");

    markers.forEach((marker, i) => {
      const describedBy = marker.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      const note = container.querySelector(`#${CSS.escape(describedBy as string)}`);
      expect(note?.textContent).toContain(POINTS[i]?.label);
      expect(note?.textContent).toContain(POINTS[i]?.detail);
    });
  });

  it("gives each note a distinct id", () => {
    const { container } = renderBlock();
    const ids = [...container.querySelectorAll("ol > li")].map((li) => li.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("positions by percentage, so a marker holds its place at any width", () => {
    renderBlock();
    const [first] = screen.getAllByRole("button");
    expect(first?.style.left).toBe("25%");
    expect(first?.style.top).toBe("40%");
  });

  it("toggles pressed state on and back off", () => {
    renderBlock();
    const [first] = screen.getAllByRole("button");
    expect(first?.getAttribute("aria-pressed")).toBe("false");

    act(() => first?.click());
    expect(first?.getAttribute("aria-pressed")).toBe("true");

    act(() => first?.click());
    expect(first?.getAttribute("aria-pressed")).toBe("false");
  });

  it("selects one marker at a time", () => {
    renderBlock();
    const [first, second] = screen.getAllByRole("button");

    act(() => first?.click());
    act(() => second?.click());
    expect(first?.getAttribute("aria-pressed")).toBe("false");
    expect(second?.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("AnnotatedImage — degenerate input", () => {
  it("renders the image alone when there are no markers", () => {
    const { container } = renderBlock([]);
    expect(container.querySelector("img")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("uses the asset's alt text for the image", () => {
    renderBlock();
    expect(screen.getByAltText("A wool blazer")).toBeTruthy();
  });

  it("falls back to the heading when the asset has no alt text", () => {
    render(
      <AnnotatedImage image={{ url: IMAGE.url }} points={POINTS} heading="Construction detail" />
    );
    expect(screen.getByAltText("Construction detail")).toBeTruthy();
  });
});
