import { expect, expectAccessible, startDemo, test } from "../support/fixtures";

test.describe("demo start", () => {
  test("one click starts a guest on the sample resume", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Try the live demo" })).toBeEnabled();
    await expectAccessible(page);
    await startDemo(page);
    await expect(page.getByText("Riley Chen").first()).toBeVisible();
    await expectAccessible(page, { exclude: ['[aria-label="Resume preview"]'] });
  });

  test("account pages are closed in demo mode", async ({ page }) => {
    for (const path of ["/login", "/register", "/forgot-password"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
    }
  });
});
