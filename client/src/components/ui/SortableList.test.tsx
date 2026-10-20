import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SortableList } from "./SortableList";

const items = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
];

function renderList() {
  return render(
    <SortableList items={items} getId={(i) => i.id} onReorder={() => {}}>
      {(item, handle) => (
        <div>
          {handle}
          <span>{item.label}</span>
        </div>
      )}
    </SortableList>,
  );
}

describe("SortableList", () => {
  it("renders each item via the render-prop with a labeled drag handle", () => {
    renderList();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Drag to reorder" })).toHaveLength(2);
  });

  it("moves a dragged item without stretching it to the size of the item it's over", async () => {
    // jsdom has no layout, so give the two items different heights: a short Alpha above a tall Beta.
    const sizes: Record<string, { top: number; height: number }> = {
      Alpha: { top: 0, height: 50 },
      Beta: { top: 60, height: 200 },
    };
    let container: HTMLElement | null = null;
    // Each list item (a direct child of the render container) and everything inside it gets
    // that item's size; anything else (the container itself) gets a box around both.
    const rectFor = (el: HTMLElement): DOMRect => {
      let item: HTMLElement | null = el;
      while (item && item.parentElement !== container) item = item.parentElement;
      const { top, height } = item ? sizes[item.textContent?.includes("Alpha") ? "Alpha" : "Beta"] : { top: 0, height: 300 };
      return { x: 0, y: top, top, left: 0, width: 300, height, right: 300, bottom: top + height, toJSON: () => ({}) } as DOMRect;
    };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return rectFor(this);
    });
    ({ container } = renderList());

    // Keyboard drag: pick Alpha up, then move it down over Beta.
    const handle = screen.getAllByRole("button", { name: "Drag to reorder" })[0];
    handle.focus();
    fireEvent.keyDown(handle, { code: "Space", key: " " });
    await act(() => new Promise((r) => setTimeout(r, 0)));
    fireEvent.keyDown(handle, { code: "ArrowDown", key: "ArrowDown" });
    await act(() => new Promise((r) => setTimeout(r, 0)));

    const dragged = screen.getByText("Alpha").closest<HTMLElement>("[style]")!;
    expect(dragged.style.transform).toMatch(/translate3d\(0px, [1-9]\d*px, 0\)/);
    expect(dragged.style.transform).not.toMatch(/scale/);
  });
});
