import type { Page } from "@playwright/test";

import type { TailorJDResponse } from "../src/api/generated/model";
import { AI_USAGE, GENERATED_SUMMARY } from "./support/aiMocks";
import { createResumeViaApi, expect, expectAccessible, test } from "./support/fixtures";

/** The live preview is the résumé document (light in both themes); see editor.spec.ts. */
const PREVIEW = '[aria-label="Resume preview"]';
const JD = "Platform engineer: Kubernetes, GraphQL, observability, and on-call ownership of payments.";

async function openAiItem(page: Page, item: string) {
  await page.getByRole("button", { name: "AI", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test.describe("AI tools (mocked)", () => {
  // Each score band gets a contrast pass in both themes: the band color is the label's text color.
  for (const [score, label] of [
    [42, "Needs work"],
    [68, "Good"],
    [91, "Strong"],
  ] as const) {
    test(`score meter, ${label.toLowerCase()} band (${score})`, async ({ page, user }) => {
      await page.route("**/api/ai/tailor-jd", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            match_score: score,
            missing_keywords: ["Kubernetes"],
            suggestions: [],
            ai_usage: AI_USAGE,
          } satisfies TailorJDResponse),
        }),
      );
      const resume = await createResumeViaApi(page, user);
      await page.goto(`/resumes/${resume.id}`);
      await openAiItem(page, "Tailor to job description");
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("textbox", { name: "Job description" }).fill(JD);
      await dialog.getByRole("button", { name: "Analyze match" }).click();
      // Never color alone: the band is also a word, and the meter says it to screen readers.
      await expect(dialog.getByText(label, { exact: true })).toBeVisible();
      await expect(dialog.getByRole("progressbar")).toHaveAccessibleName(
        `ATS match score ${score} of 100: ${label}`,
      );
      await expectAccessible(page, { exclude: [PREVIEW] });
    });
  }

  test("generate a summary and use it", async ({ page, user }) => {
    const resume = await createResumeViaApi(page, user);
    await page.goto(`/resumes/${resume.id}`);
    await openAiItem(page, "Generate summary");
    const dialog = page.getByRole("dialog", { name: "Generate summary" });
    await expect(dialog.getByText(GENERATED_SUMMARY)).toBeVisible();
    await expectAccessible(page, { exclude: [PREVIEW] });
    await dialog.getByRole("button", { name: "Use this summary" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(PREVIEW)).toContainText(GENERATED_SUMMARY);
  });

  test("ATS health check", async ({ page, user }) => {
    const resume = await createResumeViaApi(page, user);
    await page.goto(`/resumes/${resume.id}`);
    await openAiItem(page, "ATS health check");
    const dialog = page.getByRole("dialog", { name: "ATS health check" });
    await expect(dialog.getByText("Two bullets start with the same verb.")).toBeVisible();
    await expectAccessible(page, { exclude: [PREVIEW] });
  });

  test("cover letters: generate, save, list, delete", async ({ page, user }) => {
    const resume = await createResumeViaApi(page, user);
    await page.goto(`/resumes/${resume.id}`);
    await openAiItem(page, "Cover letters");
    const dialog = page.getByRole("dialog", { name: "Cover letters" });
    await expect(dialog.getByText("No saved cover letters yet.", { exact: false })).toBeVisible();
    await expectAccessible(page, { exclude: [PREVIEW] });

    await dialog.getByRole("button", { name: "New cover letter" }).click();
    await dialog.getByRole("textbox", { name: "Job description" }).fill(JD);
    await expectAccessible(page, { exclude: [PREVIEW] });
    await dialog.getByRole("button", { name: "Generate" }).click();
    await expect(dialog.getByRole("textbox", { name: "Cover letter" })).toHaveValue(/I am excited to apply/);
    await expectAccessible(page, { exclude: [PREVIEW] });
    await dialog.getByRole("textbox", { name: "Title" }).fill("Platform role");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Delete Platform role" })).toBeVisible();
    await expectAccessible(page, { exclude: [PREVIEW] });

    // Delete by keyboard. The row's Delete button is gone afterward, so focus returns into
    // the Cover letters dialog (not <body>, not behind the dialog).
    await dialog.getByRole("button", { name: "Delete Platform role" }).focus();
    await page.keyboard.press("Enter");
    const confirm = page.getByRole("dialog", { name: "Delete cover letter?" });
    await confirm.getByRole("button", { name: "Delete" }).focus();
    await page.keyboard.press("Enter");
    await expect(confirm).toBeHidden();
    await expect(dialog.getByText("No saved cover letters yet.", { exact: false })).toBeVisible();
    await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  });
});
