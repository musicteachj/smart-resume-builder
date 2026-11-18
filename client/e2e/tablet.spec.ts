import type { Page } from "@playwright/test";

import { createResumeViaApi, expect, expectAccessible, test } from "./support/fixtures";

/**
 * Tablet pass (820x1180, the "tablet" project): the main pages lay out without sideways
 * scrolling and pass the same axe checks as desktop.
 */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(0);
}

test.describe("tablet", () => {
  test("public pages", async ({ page }) => {
    for (const [path, heading] of [
      ["/", "The resume that writes itself well."],
      ["/login", "Welcome back"],
      ["/register", "Create your account"],
      ["/forgot-password", "Reset your password"],
      ["/privacy", "Privacy Policy"],
      ["/terms", "Terms of Use"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAccessible(page);
    }
  });

  test("dashboard, account, and editor", async ({ page, user }) => {
    const resume = await createResumeViaApi(page, user);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Your resumes" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);

    await page.goto("/account");
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);

    await page.goto(`/resumes/${resume.id}`);
    const title = page.getByRole("textbox", { name: "Resume title" });
    await expect(title).toBeVisible();
    // The top bar's actions all fit on screen.
    for (const name of ["History", "AI", "Export"]) {
      const button = page.getByRole("button", { name, exact: true });
      await expect(button).toBeInViewport();
    }
    await expectNoHorizontalScroll(page);
    // The preview (light-only résumé document) is scanned in editor.spec.ts.
    await expectAccessible(page, { exclude: ['[aria-label="Resume preview"]'] });

    // The form and the preview both get room on a portrait tablet.
    await expect(page.getByLabel("Full name")).toBeInViewport();
    const preview = page.locator('[aria-label="Resume preview"]');
    const box = await preview.boundingBox();
    expect(box && box.height > 200, "preview is visible").toBe(true);

    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByRole("dialog", { name: "Version history" })).toBeVisible();
    await expectAccessible(page, { exclude: ['[aria-label="Resume preview"]'] });
  });
});
