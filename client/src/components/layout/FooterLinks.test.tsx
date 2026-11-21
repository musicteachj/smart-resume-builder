import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// Accounts mode (the demo status comes from the server).
vi.mock("@/features/demo/useDemoStatus", () => ({
  useDemoStatus: () => ({ status: undefined, isLoading: false, demoMode: false }),
}));

import { LandingPage } from "@/features/marketing/LandingPage";
import { CONTACT_EMAIL } from "@/lib/site";

describe("footer links", () => {
  it("link the landing page to Privacy, Terms, and a contact email", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    const footer = screen.getByRole("navigation", { name: "Legal" });
    expect(footer).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
  });
});
