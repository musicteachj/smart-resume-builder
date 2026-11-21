import { expect, expectAccessible, startDemo, test } from "../support/fixtures";

test.describe("end demo", () => {
  test("sign out and end demo removes the demo", async ({ page }) => {
    const id = await startDemo(page);
    // The account menu is in the app header, which the dashboard shows (the editor has its own top bar).
    await page.getByRole("button", { name: "Back to dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out and end demo" }).click();
    const dialog = page.getByRole("dialog", { name: "End your demo?" });
    await expect(dialog).toBeVisible();
    await expectAccessible(page);
    await dialog.getByRole("button", { name: "End demo" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "Try the live demo" })).toBeVisible();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/$/);
    await page.goto(`/resumes/${id}`);
    await expect(page).toHaveURL(/\/$/);
  });
});
