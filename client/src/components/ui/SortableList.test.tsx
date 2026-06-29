import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SortableList } from "./SortableList";

const items = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
];

describe("SortableList", () => {
  it("renders each item via the render-prop with a labeled drag handle", () => {
    render(
      <SortableList items={items} getId={(i) => i.id} onReorder={() => {}}>
        {(item, handle) => (
          <div>
            {handle}
            <span>{item.label}</span>
          </div>
        )}
      </SortableList>,
    );
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Drag to reorder" })).toHaveLength(2);
  });
});
