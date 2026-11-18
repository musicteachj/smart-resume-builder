import { expect, expectAccessible, test } from "./support/fixtures";

test.describe("public pages", () => {
  test("landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "The resume that writes itself well." })).toBeVisible();
    await expectAccessible(page);

    // Header actions are single links (no button nested in a link).
    const signIn = page.getByRole("link", { name: "Sign in" });
    await expect(signIn).toHaveAttribute("href", "/login");
    await expect(signIn.locator("button")).toHaveCount(0);
    await page.getByRole("link", { name: "Build my resume" }).click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("privacy and terms open directly by URL", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
    await expectAccessible(page);

    await page.goto("/terms");
    await expect(page.getByRole("heading", { level: 1, name: "Terms of Use" })).toBeVisible();
    await expectAccessible(page);
  });

  test("privacy and terms open from the footer", async ({ page }) => {
    await page.goto("/");
    const legal = page.getByRole("navigation", { name: "Legal" });
    await legal.getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();

    await page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Terms" }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { level: 1, name: "Terms of Use" })).toBeVisible();
  });

  test("a persisted dark theme applies on load", async ({ page }) => {
    await page.addInitScript(() =>
      window.localStorage.setItem("resumeiq-theme", JSON.stringify({ state: { theme: "dark" }, version: 0 })),
    );
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  });
});
