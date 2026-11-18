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
