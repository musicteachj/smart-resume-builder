import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CONTACT_EMAIL, LEGAL_LAST_UPDATED } from "@/lib/site";

import { PrivacyPage } from "./PrivacyPage";
import { TermsPage } from "./TermsPage";

beforeAll(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {}); // not implemented in jsdom
});

describe.each([
  ["Privacy Policy", PrivacyPage],
  ["Terms of Use", TermsPage],
])("%s page", (title, Page) => {
  it("has one h1, a last-updated date, sections, and the contact email", () => {
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    );
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(title);
    expect(screen.getByText(`Last updated: ${LEGAL_LAST_UPDATED}`)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(3);
    expect(screen.getByRole("link", { name: CONTACT_EMAIL })).toHaveAttribute("href", `mailto:${CONTACT_EMAIL}`);
    expect(screen.getByRole("link", { name: "ResumeIQ home" })).toHaveAttribute("href", "/");
  });
});

describe("public demo copy", () => {
  it("privacy states the retention and names every processor", () => {
    const { container } = render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    );
    for (const text of [
      "removed from the app after 24 hours",
      "up to 7 days",
      "(including IP addresses) are kept for 14 days",
      "Anthropic",
      "Cloudflare",
      "Amazon Web Services",
      "Please don't upload a real resume.",
    ]) {
      expect(container.textContent).toContain(text);
    }
  });

  it.each([
    ["Privacy", PrivacyPage],
    ["Terms", TermsPage],
  ])("%s has no account language and no em dashes", (_name, Page) => {
    const { container } = render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    );
    expect(container.textContent).not.toMatch(/\baccount\b|sign[- ]in\b|password reset/i);
    expect(container.textContent).not.toContain(String.fromCharCode(0x2014));
  });
});
