import { startDemo, expect, expectAccessible, test } from "../support/fixtures";

test.describe("demo AI refusals", () => {
  test("the landing says when today's live AI budget is used", async ({ page }) => {
    await page.route("**/api/demo/status", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          demo_mode: true,
          turnstile_site_key: "1x00000000000000000000AA",
          ai_available: false,
          ai_reason: "daily_used",
          guest_start_available: true,
        }),
      }),
    );
    await page.goto("/");
    await expect(
      page.getByRole("status").filter({ hasText: "Today's live AI budget is used up." }),
    ).toBeAttached();
    // The demo still starts: only the live AI is off.
    await expect(page.getByRole("button", { name: "Try the live demo" })).toBeEnabled();
    await expectAccessible(page);
  });

  test("an AI refusal shows the free-path copy", async ({ page }) => {
    const detail =
      "Today's live AI budget for the demo is used up. You can still edit, switch templates, and export your resume as a PDF or Word file.";
    await page.route("**/api/ai/generate-summary", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ detail, code: "ai_daily_used" }),
      }),
    );
    await startDemo(page);
    await page.getByRole("button", { name: "AI", exact: true }).click();
    await page.getByRole("menuitem", { name: "Generate summary" }).click();
    const dialog = page.getByRole("dialog", { name: "Generate summary" });
    await expect(dialog.getByText(detail)).toBeVisible();
    await expectAccessible(page, { exclude: ['[aria-label="Resume preview"]'] });
  });
});
