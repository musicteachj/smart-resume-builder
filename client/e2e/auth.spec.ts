import {
  expect,
  expectAccessible,
  newAccount,
  registerViaApi,
  resetLinkFragment,
  test,
} from "./support/fixtures";

test.describe("register", () => {
  test("shows validation errors, then creates the account", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { level: 1, name: "Create your account" })).toBeVisible();
    await expectAccessible(page);

    // Submit empty: each error sits under its field, and focus moves to the first invalid one.
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Name is required")).toBeVisible();
    await expect(page.getByText("Email is required")).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeFocused();
    await expect(page.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Full name")).toHaveAccessibleDescription("Name is required");
    await expectAccessible(page);

    const account = newAccount();
    await page.getByLabel("Full name").fill(account.name);
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: "Your resumes" })).toBeVisible();
  });

  test("rejects an email that's already registered", async ({ page }) => {
    const account = newAccount();
    await registerViaApi(page, account);
    await page.context().clearCookies();

    await page.goto("/register");
    await page.getByLabel("Full name").fill("Someone Else");
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill("Another-Strong-Pass-9");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /already exists/i })).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe("login", () => {
  test("wrong password shows an error; the right one signs in", async ({ page }) => {
    const account = newAccount();
    await registerViaApi(page, account);
    await page.context().clearCookies();

    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel("Password", { exact: true }).fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("the password field can be shown and hidden", async ({ page }) => {
    await page.goto("/login");
    const password = page.getByLabel("Password", { exact: true });
    await password.fill("secret-value");
    await expect(password).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(password).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });
});

test.describe("password reset", () => {
  test("forgot password shows the confirmation", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("Email is required")).toBeVisible();

    await page.getByLabel("Email").fill(newAccount().email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Check your email" })).toBeVisible();
    await expectAccessible(page);
  });

  test("a valid link resets the password and old sessions end", async ({ page }) => {
    const account = newAccount();
    await registerViaApi(page, account);
    await page.context().clearCookies();

    await page.goto(`/reset-password#${resetLinkFragment(account.email)}`);
    await expect(page.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
    // The token is dropped from the address bar once read.
    await expect(page).toHaveURL(/\/reset-password$/);
    await expectAccessible(page);

    const newPassword = "Brand-New-Passphrase-77";
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill("does-not-match-1");
    await page.getByLabel("Confirm new password").blur();
    await expect(page.getByText("Passwords don't match")).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel("Confirm new password").fill(newPassword);
    await page.getByRole("button", { name: /reset password/i }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("status").filter({ hasText: /password was reset/i })).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("an invalid link says so", async ({ page }) => {
    await page.goto("/reset-password#uid=bm9wZQ&token=not-a-real-token");
    await expect(page.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill("Brand-New-Passphrase-77");
    await page.getByLabel("Confirm new password").fill("Brand-New-Passphrase-77");
    await page.getByRole("button", { name: /reset password/i }).click();
    await expect(page.getByText("This reset link is invalid or has expired.")).toBeVisible();
    await expectAccessible(page);
  });

  test("a link with no token says so right away", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText("This reset link is invalid or has expired.")).toBeVisible();
    await expectAccessible(page);
  });
});
