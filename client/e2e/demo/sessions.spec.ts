import { expect, expectAccessible, expireGuests, installMocks, startDemo, test } from "../support/fixtures";

const ENDED = "Your demo ended.";

test.describe("demo sessions", () => {
  test("two tabs reloading together both stay in the demo", async ({ page, context }) => {
    await startDemo(page);
    const second = await context.newPage();
    await installMocks(second);
    await second.goto(page.url());
    await expect(second).toHaveURL(/\/resumes\//);
    await Promise.all([page.reload(), second.reload()]);
    for (const p of [page, second]) {
      await expect(p).toHaveURL(/\/resumes\//);
      await expect(p.getByRole("textbox", { name: "Resume title" })).toBeVisible();
    }
  });

  test("an ended demo shows the notice, not an error", async ({ page }) => {
    const id = await startDemo(page);
    expireGuests(id);
    await page.reload();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("status").filter({ hasText: ENDED })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Try the live demo" })).toBeVisible();
    await expectAccessible(page);
  });

  test("autosave after the demo ends lands on the ended notice", async ({ page }) => {
    const id = await startDemo(page);
    await expect(page.getByRole("textbox", { name: "Resume title" })).toBeVisible();
    expireGuests(id);
    await page.getByPlaceholder("A 2–3 sentence professional overview…").fill("Changed after the demo ended.");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("status").filter({ hasText: ENDED })).toBeVisible();
  });
});
