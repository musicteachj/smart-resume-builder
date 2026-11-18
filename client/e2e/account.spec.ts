import { createResumeViaApi, expect, expectAccessible, test } from "./support/fixtures";

test.describe("account", () => {
  test("reach Account from the header menu", async ({ page, user }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Account" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    await expect(page.getByText(user.email)).toBeVisible();
    await expectAccessible(page);
  });

  test("sign out from the header menu returns to landing", async ({ page, user }) => {
    void user; // signs the page in
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "The resume that writes itself well." })).toBeVisible();
  });

  test("delete account: wrong password, then success returns to landing", async ({ page, user }) => {
    await createResumeViaApi(page, user);
    await page.goto("/account");
    const open = page.getByRole("button", { name: "Delete account" });
    await open.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Delete your account?" });
    await expect(dialog).toBeVisible();
    await expectAccessible(page);

    // Empty submit, then a wrong password: each error is tied to the field.
    await dialog.getByRole("button", { name: "Delete account" }).click();
    const password = dialog.getByLabel("Password", { exact: true });
    await expect(password).toHaveAttribute("aria-invalid", "true");
    await password.fill("definitely-wrong-password");
    await dialog.getByRole("button", { name: "Delete account" }).click();
    await expect(dialog.getByText("Incorrect password.")).toBeVisible();
    await expectAccessible(page);

    // Cancel returns focus to the button that opened the dialog.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();

    await open.click();
    await dialog.getByLabel("Password", { exact: true }).fill(user.password);
    await dialog.getByRole("button", { name: "Delete account" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "The resume that writes itself well." })).toBeVisible();

    // The session is gone and the credentials no longer work.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    const login = await page.request.post("/api/auth/login", { data: { email: user.email, password: user.password } });
    expect(login.status()).toBe(401);
  });
});
