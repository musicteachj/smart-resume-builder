import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Page } from "@playwright/test";

import type { AuthResponse, Resume, ResumeContent } from "../../src/api/generated/model";
import { mockAi } from "./aiMocks";
import { DJANGO_ENV, E2E_SERVER_HELPERS, PYTHON, SERVER_DIR } from "./env";

export interface Account {
  name: string;
  email: string;
  password: string;
}

export interface SignedInUser extends Account {
  access: string;
}

/** A fresh, unregistered account (unique per test, so specs never share data). */
export function newAccount(): Account {
  return {
    name: "Jordan Rivera",
    email: `e2e-${randomUUID()}@example.com`,
    password: "Correct-Horse-Battery-42",
  };
}

/** Register through the app's proxy, so the httpOnly refresh cookie lands in the page's context. */
export async function registerViaApi(page: Page, account: Account): Promise<SignedInUser> {
  const res = await page.request.post("/api/auth/register", { data: account });
  expect(res.status(), await res.text()).toBe(201);
  const body = (await res.json()) as AuthResponse;
  return { ...account, access: body.access };
}

export const SAMPLE_CONTENT: ResumeContent = {
  personalInfo: {
    name: "Jordan Rivera",
    headline: "Senior Software Engineer",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Portland, OR",
    linkedin: "https://www.linkedin.com/in/example",
  },
  summary: "Engineer who ships reliable products.",
  workExperience: [
    {
      id: randomUUID(),
      company: "Acme Corp",
      position: "Software Engineer",
      location: "Remote",
      startDate: "2021-03",
      endDate: null,
      bullets: ["Built the billing service.", "Mentored three engineers."],
    },
    {
      id: randomUUID(),
      company: "Globex",
      position: "Junior Developer",
      location: "Seattle, WA",
      startDate: "2018-06",
      endDate: "2021-02",
      bullets: ["Shipped the onboarding flow."],
    },
  ],
  education: [
    {
      id: randomUUID(),
      school: "Oregon State University",
      degree: "B.S.",
      field: "Computer Science",
      graduationDate: "2018-06",
    },
  ],
  skills: ["TypeScript", "Python", "PostgreSQL"],
  projects: [],
};

/** Create a résumé for a signed-in user straight through the API. */
export async function createResumeViaApi(
  page: Page,
  user: SignedInUser,
  title = "Software Engineer",
  content: ResumeContent = SAMPLE_CONTENT,
): Promise<Resume> {
  const res = await page.request.post("/api/resumes/", {
    headers: { Authorization: `Bearer ${user.access}` },
    data: { title, template: "classic", content },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as Resume;
}

/** The `uid=...&token=...` fragment of a real reset link, built by Django the same way the email builds it. */
export function resetLinkFragment(email: string): string {
  return execFileSync(PYTHON, [path.join(E2E_SERVER_HELPERS, "reset_link.py"), email], {
    cwd: SERVER_DIR,
    env: { ...process.env, ...DJANGO_ENV },
    encoding: "utf8",
  }).trim();
}

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

interface A11yOptions {
  /** Scan only this part of the page. */
  include?: string;
  /** CSS selectors to leave out of the scan. Each call site says why. */
  exclude?: string[];
}

/**
 * Run axe (WCAG 2.0/2.1 A + AA) in the light AND dark app themes and assert zero violations.
 * The theme is switched with the same `.dark` class on <html> the theme store toggles, so
 * open modals and menus stay open between the two scans.
 */
export async function expectAccessible(page: Page, options: A11yOptions = {}) {
  // Freeze transitions so contrast is measured on final colors, not mid-fade.
  const freeze = await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation-duration: 0s !important; }",
  });
  const initialDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  const failures: string[] = [];
  for (const dark of [false, true]) {
    await page.evaluate((d) => document.documentElement.classList.toggle("dark", d), dark);
    let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
    if (options.include) builder = builder.include(options.include);
    for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
    const { violations } = await builder.analyze();
    for (const v of violations) {
      const targets = v.nodes.map((n) => {
        const related = n.any.concat(n.all, n.none).flatMap((c) => c.relatedNodes ?? []).map((r) => r.html.slice(0, 160));
        const summary = n.failureSummary ? `\n      ${n.failureSummary.replace(/\n/g, "\n      ")}` : "";
        return `${n.target.join(" ")} ${n.html.slice(0, 160)}${summary}${related.length ? `\n      related: ${related.join("\n               ")}` : ""}`;
      });
      failures.push(`[${dark ? "dark" : "light"}] ${v.id} (${v.impact}): ${v.help}\n    ${targets.join("\n    ")}`);
    }
  }
  await page.evaluate((d) => document.documentElement.classList.toggle("dark", d), initialDark);
  await freeze.evaluate((el) => (el as HTMLElement).remove());
  expect(failures, `axe violations on ${page.url()}:\n${failures.join("\n")}`).toEqual([]);
}

/** The element with keyboard focus must show a visible focus indicator (ring, outline, or box-shadow). */
export async function expectVisibleFocus(page: Page) {
  const style = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    // Stretched links (dashboard cards) draw their ring on ::after.
    const after = getComputedStyle(el, "::after");
    return {
      tag: el.tagName,
      text: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40),
      outline: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0,
      shadow: cs.boxShadow !== "none" || after.boxShadow !== "none",
    };
  });
  expect(style, "something should have focus").not.toBeNull();
  expect(style!.outline || style!.shadow, `focus is not visible on <${style!.tag}> "${style!.text}"`).toBe(true);
}

/** Every page gets the AI mocks, so no spec can reach a real model by accident. */
export const test = base.extend<{ user: SignedInUser }>({
  page: async ({ page }, use) => {
    await mockAi(page);
    await use(page);
  },
  /** A registered, signed-in user (refresh cookie in the page's context). */
  user: async ({ page }, use) => {
    await use(await registerViaApi(page, newAccount()));
  },
});

export { expect };
