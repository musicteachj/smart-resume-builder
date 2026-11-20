import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import { expect, startDemo, test } from "../support/fixtures";

/**
 * Captures the landing page's screenshots (`npm run screenshots`). They show only the fictional
 * sample resume the demo starts with, with the AI mocked, in the light theme at 1280 x 800.
 */
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/features/marketing/screenshots");
const JD =
  "Platform engineer: Kubernetes, GraphQL, observability, and on-call ownership of the payments platform. " +
  "You will design reliable services and mentor other engineers.";

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Freeze transitions so a shot never catches a fade.
  await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; animation: none !important; }" });
}

async function shoot(page: Page, name: string) {
  await settle(page);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 80 });
}

test.describe("landing screenshots", () => {
  test("editor, templates, and tailoring", async ({ page }) => {
    await startDemo(page);
    await expect(page.getByRole("textbox", { name: "Resume title" })).toBeVisible();
    await expect(page.locator('[aria-label="Resume preview"]')).toContainText("Riley Chen");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await shoot(page, "editor");

    await page.getByRole("button", { name: /Template:/ }).click();
    const gallery = page.getByRole("dialog", { name: "Choose a template" });
    await expect(gallery).toBeVisible();
    await shoot(page, "templates");
    await page.keyboard.press("Escape");
    await expect(gallery).toBeHidden();

    await page.getByRole("button", { name: "AI", exact: true }).click();
    await page.getByRole("menuitem", { name: "Tailor to job description" }).click();
    const tailor = page.getByRole("dialog", { name: "Tailor to job description" });
    await tailor.getByRole("textbox", { name: "Job description" }).fill(JD);
    await tailor.getByRole("button", { name: "Analyze match" }).click();
    await expect(tailor.getByRole("progressbar")).toBeVisible();
    await shoot(page, "tailor");
  });
});
