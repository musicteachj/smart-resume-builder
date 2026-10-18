import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "./Modal";

function renderModal(when: boolean, onOpenChange = vi.fn()) {
  render(
    <Modal open onOpenChange={onOpenChange} title="Assist" confirmDiscard={{ when }}>
      <p>body</p>
    </Modal>,
  );
  return onOpenChange;
}

describe("Modal confirmDiscard", () => {
  it("closes immediately when there is nothing to lose", () => {
    const onOpenChange = renderModal(false);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText(/discard ai suggestions/i)).not.toBeInTheDocument();
  });

  it("asks before closing, and Cancel keeps the modal open", async () => {
    const onOpenChange = renderModal(true);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByText(/discard ai suggestions/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("closes after the user confirms Discard", async () => {
    const onOpenChange = renderModal(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
