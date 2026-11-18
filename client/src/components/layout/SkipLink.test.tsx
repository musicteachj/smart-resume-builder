import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { MAIN_CONTENT_ID, SkipLink } from "./SkipLink";

beforeAll(() => {
  // jsdom has no layout, so no scrollIntoView.
  Element.prototype.scrollIntoView ??= () => {};
});

describe("SkipLink", () => {
  it("targets the main landmark and is visually hidden until focused", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: "Skip to main content" });
    expect(link).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`);
    expect(link).toHaveClass("sr-only", "focus:not-sr-only");
  });

  it("moves focus into <main> without touching the URL hash", () => {
    render(
      <>
        <SkipLink />
        <main id={MAIN_CONTENT_ID} tabIndex={-1}>
          content
        </main>
      </>,
    );
    window.location.hash = "";
    const link = screen.getByRole("link", { name: "Skip to main content" });
    const notPrevented = fireEvent.click(link);
    expect(notPrevented).toBe(false); // default (hash navigation) was prevented
    expect(screen.getByRole("main")).toHaveFocus();
    expect(window.location.hash).toBe("");
  });

  it("does nothing (and keeps the URL hash) when the page has no <main> yet", () => {
    window.history.replaceState(null, "", "/reset-password#uid=abc&token=xyz");
    render(<SkipLink />);
    const notPrevented = fireEvent.click(screen.getByRole("link", { name: "Skip to main content" }));
    expect(notPrevented).toBe(false);
    expect(window.location.hash).toBe("#uid=abc&token=xyz");
  });
});
