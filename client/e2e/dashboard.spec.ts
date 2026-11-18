import { createResumeViaApi, expect, expectAccessible, test } from "./support/fixtures";
import { makePdf } from "./support/pdf";

test.describe("dashboard", () => {
  test("empty state, create, rename, and delete a resume", async ({ page, user }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Your resumes" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Create your first resume" })).toBeVisible();
    await expectAccessible(page);

    // Account menu (Radix dropdown) open.
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("menu")).toContainText(user.email);
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Account menu" })).toBeFocused();

    // Create: lands in the editor.
    await page.getByRole("button", { name: "New resume" }).first().click();
    await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]+$/);

    // Rename from the editor's title field, then come back.
    const title = page.getByRole("textbox", { name: "Resume title" });
    await expect(title).toHaveValue("Untitled resume");
    await title.fill("Staff Engineer, Platform");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Back to dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const card = page.getByRole("article").filter({ hasText: "Staff Engineer, Platform" });
    await expect(card).toBeVisible();
    await expectAccessible(page);

    // Card menu, then delete through the confirm dialog.
    await card.getByRole("button", { name: /options/i }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete resume?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Staff Engineer, Platform");
    await expectAccessible(page);

    // Cancel first: nothing is deleted.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: /options/i }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const deleted = page.waitForResponse(
      (r) => r.request().method() === "DELETE" && r.url().includes("/api/resumes/"),
    );
    await page.getByRole("dialog", { name: "Delete resume?" }).getByRole("button", { name: "Delete" }).click();
    expect((await deleted).status()).toBe(204);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: "Create your first resume" })).toBeVisible();
  });

  test("duplicate a resume and open it from its card", async ({ page, user }) => {
    await createResumeViaApi(page, user, "Backend Engineer");
    await page.goto("/dashboard");
    const card = page.getByRole("article").filter({ hasText: "Backend Engineer" });
    await card.getByRole("button", { name: /options/i }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect(page.getByRole("article")).toHaveCount(2);
    await expectAccessible(page);

    await page.getByRole("link", { name: "Backend Engineer", exact: true }).first().click();
    await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]+$/);
  });

  test("clicking the card while its menu is open only closes the menu", async ({ page, user }) => {
    await createResumeViaApi(page, user, "Frontend Engineer");
    await page.goto("/dashboard");
    const card = page.getByRole("article").filter({ hasText: "Frontend Engineer" });
    await card.getByRole("button", { name: /options/i }).click();
    await expect(page.getByRole("menu")).toBeVisible();

    // The card body is under the title's stretched link; this press must not open the editor.
    await card.click({ position: { x: 30, y: 110 } });
    await expect(page.getByRole("menu")).toBeHidden();
    await page.waitForTimeout(300); // give a stray navigation time to happen
    await expect(page).toHaveURL(/\/dashboard$/);

    // With the menu closed, the same click opens the résumé.
    await card.click({ position: { x: 30, y: 110 } });
    await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]+$/);
  });

  test("import modal opens, is accessible, and returns focus", async ({ page, user }) => {
    void user; // signs the page in
    await page.goto("/dashboard");
    // Keyboard-open it: WebKit, like Safari, doesn't focus a button on click.
    await page.getByRole("button", { name: "Import resume" }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Import resume" })).toBeFocused();
  });

  test("import from an uploaded PDF (pdf.js in the browser, mocked AI parse)", async ({ page, user }) => {
    void user; // signs the page in
    let parsedText = "";
    await page.route("**/api/ai/parse-resume", async (route) => {
      parsedText = (route.request().postDataJSON() as { text: string }).text;
      await route.fallback(); // the shared AI mock answers
    });
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Import resume" }).click();
    const dialog = page.getByRole("dialog", { name: "Import a resume" });
    await dialog.getByLabel("Upload résumé file").setInputFiles({
      name: "resume.pdf",
      mimeType: "application/pdf",
      buffer: makePdf([
        "Jordan Rivera",
        "Software Engineer, Acme Corp, 2021 to present",
        "Built the billing service used by 2 million customers.",
      ]),
    });
    await dialog.getByRole("button", { name: "Parse résumé" }).click();
    // Review step: a preview of the parsed résumé, then create it.
    await expect(dialog.getByRole("button", { name: "Open in editor" })).toBeVisible();
    expect(parsedText).toContain("Built the billing service");
    await expectAccessible(page);
    await dialog.getByRole("button", { name: "Open in editor" }).click();
    await expect(page).toHaveURL(/\/resumes\/[0-9a-f-]+$/);
    await expect(page.getByLabel("Company").first()).toHaveValue("Acme Corp");
  });
});
