import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { MAIN_CONTENT_ID } from "@/components/layout/SkipLink";

import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";

/** A controlled Modal with no Radix Trigger, opened from a plain button, like every modal in the app. */
function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1}>
      <button onClick={() => setOpen(true)}>Open it</button>
      <Modal open={open} onOpenChange={setOpen} title="Assist">
        <p>body</p>
      </Modal>
    </main>
  );
}

describe("dialog focus return", () => {
  it("puts focus back on the button that opened the dialog", async () => {
    render(<ModalHarness />);
    const opener = screen.getByRole("button", { name: "Open it" });
    act(() => opener.focus());
    fireEvent.click(opener);
    await screen.findByRole("dialog");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("falls back to the enclosing dialog when a nested dialog's opener is gone", async () => {
    function Harness() {
      const [confirming, setConfirming] = useState(false);
      const [showRow, setShowRow] = useState(true);
      return (
        <main id={MAIN_CONTENT_ID} tabIndex={-1}>
          <Modal open onOpenChange={() => {}} title="Cover letters">
            {showRow ? <button onClick={() => setConfirming(true)}>Delete letter</button> : <p>No letters</p>}
          </Modal>
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Delete cover letter?"
            onConfirm={() => {
              setShowRow(false); // the row (and its Delete button) is gone
              setConfirming(false);
            }}
          />
        </main>
      );
    }
    render(<Harness />);
    const opener = await screen.findByRole("button", { name: "Delete letter" });
    act(() => opener.focus());
    fireEvent.click(opener);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    const outer = screen.getByRole("dialog", { name: "Cover letters" });
    await waitFor(() => expect(outer.contains(document.activeElement)).toBe(true));
  });

  it("falls back to the main landmark when the opener is gone", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const [showOpener, setShowOpener] = useState(true);
      return (
        <main id={MAIN_CONTENT_ID} tabIndex={-1}>
          {showOpener && <button onClick={() => setOpen(true)}>Delete card</button>}
          <ConfirmDialog
            open={open}
            onOpenChange={setOpen}
            title="Delete?"
            onConfirm={() => {
              setShowOpener(false); // the card (and its button) is deleted
              setOpen(false);
            }}
          />
        </main>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Delete card" });
    act(() => opener.focus());
    fireEvent.click(opener);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  });
});
