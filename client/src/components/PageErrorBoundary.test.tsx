import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageErrorBoundary } from "./PageErrorBoundary";

function Broken(): never {
  throw new Error("Failed to fetch dynamically imported module");
}

describe("PageErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders its children when nothing goes wrong", () => {
    render(
      <PageErrorBoundary>
        <p>page</p>
      </PageErrorBoundary>,
    );
    expect(screen.getByText("page")).toBeInTheDocument();
  });

  it("offers a reload instead of a blank screen when the page fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(
      <PageErrorBoundary>
        <Broken />
      </PageErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/didn't load/i);
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(reload).toHaveBeenCalled();
  });

  it("clears the error when the route changes", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(
      <PageErrorBoundary resetKey="/dashboard">
        <Broken />
      </PageErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(
      <PageErrorBoundary resetKey="/resumes/1">
        <p>next page</p>
      </PageErrorBoundary>,
    );
    expect(screen.getByText("next page")).toBeInTheDocument();
  });
});
