import type { Page } from "@playwright/test";

import { createResumeViaApi, expect, expectVisibleFocus, test } from "./support/fixtures";

/**
 * Keyboard-only use. WebKit follows Safari's default of skipping links on Tab (Safari needs
 * Option+Tab, or "Press Tab to highlight each item" in its settings), so it walks with
 * Alt+Tab; Chromium uses plain Tab.
 */
function tabKey(browserName: string) {
  return browserName === "webkit" ? "Alt+Tab" : "Tab";
}

/** Tab through the page, asserting each stop shows a focus indicator. Returns the stops' names. */
async function tabThrough(page: Page, key: string, max = 30): Promise<string[]> {
  const stops: string[] = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(key);
    const name = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      // Roughly the accessible name: aria-label, else the text minus aria-hidden parts.
      const copy = el.cloneNode(true) as HTMLElement;
      copy.querySelectorAll("[aria-hidden='true']").forEach((n) => n.remove());
      return (el.getAttribute("aria-label") ?? copy.textContent ?? el.tagName).trim().replace(/\s+/g, " ");
    });
    if (name === null || (stops.length > 0 && name === stops[0])) break; // wrapped around
    await expectVisibleFocus(page);
    stops.push(name);
  }
  return stops;
}

test.describe("keyboard", () => {
  test("skip link is the first stop and jumps to the main content", async ({ page, browserName }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
    await page.keyboard.press(tabKey(browserName));
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    // Hidden until focused, then on screen.
    const box = await skip.boundingBox();
    expect(box && box.width > 1 && box.height > 1).toBe(true);
    await expectVisibleFocus(page);
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });

  test("landing: every stop is visible, in order", async ({ page, browserName }) => {
    await page.goto("/");
    await expect(page.locator("main")).toBeVisible();
    const stops = await tabThrough(page, tabKey(browserName));
    expect(stops.slice(0, 4)).toEqual(["Skip to main content", "Sign in", "Get started", "Build my resume"]);
    expect(stops).toEqual(expect.arrayContaining(["Privacy", "Terms", "Contact"]));
  });

  test("login: every stop is visible, and the form submits from the keyboard", async ({ page, browserName }) => {
    await page.goto("/login");
    await expect(page.locator("main")).toBeVisible();
    const stops = await tabThrough(page, tabKey(browserName));
    expect(stops).toEqual(expect.arrayContaining(["Show password", "Sign in", "Forgot?"]));

    await page.getByLabel("Email").focus();
    await page.keyboard.press("Enter");
    // Submitting empty puts focus on the first invalid field.
    await expect(page.getByLabel("Email")).toBeFocused();
    await expect(page.getByText("Email is required")).toBeVisible();
  });

  test("dashboard: stops are visible; dialogs trap focus and return it", async ({ page, user, browserName }) => {
    await createResumeViaApi(page, user, "Data Engineer");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Your resumes" })).toBeVisible();
    // Wait for the list: while it loads, the page has no buttons past the header.
    await expect(page.getByRole("article")).toBeVisible();
    const stops = await tabThrough(page, tabKey(browserName));
    expect(stops).toEqual(
      expect.arrayContaining(["Switch to dark mode", "Account menu", "New resume", "Options for Data Engineer", "Data Engineer"]),
    );

    // Open the card menu and the delete dialog with keys only.
    const options = page.getByRole("button", { name: "Options for Data Engineer" });
    await options.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("ArrowDown"); // Duplicate -> Delete
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Delete resume?" });
    await expect(dialog).toBeVisible();

    // Tab cycles inside the dialog.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
      await expectVisibleFocus(page);
    }

    // Esc closes it; focus goes back to the menu button the user started from.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(options).toBeFocused();

    // Delete it for real, by keyboard. The card (and the button focus came from) is gone,
    // so focus lands on <main>, not <body>.
    await options.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(page.locator("main#main")).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);

    // The theme toggle works from the keyboard and keeps focus.
    const theme = page.getByRole("button", { name: "Switch to dark mode" });
    await theme.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeFocused();
  });
});
