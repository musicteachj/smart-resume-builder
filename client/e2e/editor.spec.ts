import type { Download, Locator, Page } from "@playwright/test";

import { IMPROVED_BULLET } from "./support/aiMocks";
import { createResumeViaApi, expect, expectAccessible, test } from "./support/fixtures";

/**
 * The live preview renders the résumé itself (fixed paper and ink colors, light in both app
 * themes, exactly what prints). It's scanned in its own test below; page-level scans leave
 * it out so a dark-mode pass only judges the app chrome.
 */
const PREVIEW = '[aria-label="Resume preview"]';

async function openEditor(page: Page, id: string) {
  await page.goto(`/resumes/${id}`);
  await expect(page.getByRole("textbox", { name: "Resume title" })).toBeVisible();
}

/**
 * Move the dragged item down one slot with the keyboard. Wait until dnd-kit announces the drag,
 * then press ArrowDown. dnd-kit measures drop targets just after pick-up and silently drops an
 * arrow pressed before that, so press again only while the announced slot is still the starting
 * one. Once the item has moved, never press again (retrying on a mismatch overshot on a slow CI
 * runner, landing on position 4 of 5).
 */
async function moveDownOne(page: Page, live: Locator, name: string, expected: string) {
  await expect(live).toHaveText(new RegExp(`^(Picked up ${name}, |${name} is over )position \\d+ of \\d+\\.$`));
  const slot = async () => ((await live.textContent()) ?? "").match(/position (\d+) of/)?.[1];
  const start = await slot();
  await expect(async () => {
    if ((await slot()) === start) await page.keyboard.press("ArrowDown");
    await expect(live).toHaveText(expected, { timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}

function fileName(download: Download) {
  return download.suggestedFilename().replace(/_/g, " ");
}

async function waitForSave(page: Page) {
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
}

test.describe("editor", () => {
  test("edit personal info and a work entry; the preview follows", async ({ page, user }) => {
    const resume = await createResumeViaApi(page, user);
    await openEditor(page, resume.id);
    await expect(page.getByRole("heading", { level: 1, name: /^Edit resume:/ })).toBeAttached();
    await expectAccessible(page, { exclude: [PREVIEW] });

    const preview = page.locator(PREVIEW);
    await page.getByLabel("Professional title").fill("Principal Engineer");
    await expect(preview).toContainText("Principal Engineer");

    await page.getByLabel("Company").first().fill("Initech");
    await // Bullet controls name their job, so they are unique across entries.
    await page.getByRole("textbox", { name: "Bullet 1 from Initech" }).fill("Led the payments migration.");
    await expect(preview).toContainText("Initech");
    await expect(preview).toContainText("Led the payments migration.");
    await waitForSave(page);

    // Survives a reload (autosaved).
    await page.reload();
    await expect(page.getByLabel("Company").first()).toHaveValue("Initech");

    // Invalid email: the error is under the field and tied to it.
    await page.getByLabel("Email").fill("not-an-email");
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    await expectAccessible(page, { exclude: [PREVIEW] });
  });

  test("the resume preview itself passes contrast and structure checks", async ({ page, user }) => {
    const resume = await createResumeViaApi(page, user);
    await openEditor(page, resume.id);
    // Scan only the preview. It ignores the app theme, so both passes should agree.
    await expectAccessible(page, { include: PREVIEW });
  });

  test("reorder sections and entries with the keyboard", async ({ page, user }) => {
    const resume = await createResumeViaApi(page, user);
    await openEditor(page, resume.id);

    const sectionHeadings = page.locator("main h2");
    await expect(sectionHeadings.nth(1)).toHaveText(/Summary/);

    // Pick up "Summary" (Space), move it down one (ArrowDown), drop it (Space).
    const handle = page.getByRole("button", { name: "Reorder Summary" });
    await handle.focus();
    await page.keyboard.press("Space");
    await expect(handle).toHaveAttribute("aria-pressed", "true");
    // Screen readers hear the section's name and place, not its internal id.
    const live = page.getByRole("status").filter({ hasText: /Summary/ });
    await moveDownOne(page, live, "Summary", "Summary is over position 2 of 5.");
    await page.keyboard.press("Space");
    await expect(live).toHaveText("Dropped Summary at position 2 of 5.");
    await expect(sectionHeadings.nth(2)).toHaveText(/Summary/);
    await expect(sectionHeadings.nth(1)).toHaveText(/Work experience/);

    // Same for work entries: move Acme Corp below Globex (entries are named by company).
    await expect(page.getByLabel("Company").first()).toHaveValue("Acme Corp");
    const entryHandle = page.getByRole("button", { name: "Reorder Acme Corp" });
    await entryHandle.focus();
    await page.keyboard.press("Space");
    await expect(entryHandle).toHaveAttribute("aria-pressed", "true");
    const entryLive = page.getByRole("status").filter({ hasText: "Acme Corp" });
    await moveDownOne(page, entryLive, "Acme Corp", "Acme Corp is over position 2 of 2.");
    await page.keyboard.press("Space");
    await expect(page.getByLabel("Company").first()).toHaveValue("Globex");
    await waitForSave(page);
  });

  test("template gallery: pick a template and a font", async ({ page, user }) => {
    const resume = await createResumeViaApi(page, user);
    await openEditor(page, resume.id);

    const opener = page.getByRole("button", { name: /^Template:/ });
    await opener.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Choose a template" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Classic template" })).toHaveAttribute("aria-pressed", "true");
    await expectAccessible(page, { exclude: [PREVIEW] });

    await dialog.getByRole("button", { name: "Modern template" }).click();
    await expect(dialog).toBeHidden();
    await expect(opener).toContainText("Modern");
    await expect(opener).toBeFocused();

    await opener.click();
    await page.getByRole("dialog").getByRole("button", { name: "Garamond" }).click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Garamond" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("export menu offers PDF, Word, and plain text", async ({ page, user }) => {
    const resume = await createResumeViaApi(page, user);
    await openEditor(page, resume.id);

    await page.getByRole("button", { name: "Export" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveText(["PDF", "Word (.docx)", "Plain text (.txt)"]);
    await expectAccessible(page, { exclude: [PREVIEW] });

    const download = page.waitForEvent("download");
    await menu.getByRole("menuitem", { name: "Plain text (.txt)" }).click();
    // Linux WebKit replaces spaces in download names with underscores; macOS and Chromium keep them.
    expect(fileName(await download)).toBe("Software Engineer.txt");

    await page.getByRole("button", { name: "Export" }).click();
    const docx = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Word (.docx)" }).click();
    expect(fileName(await docx)).toBe("Software Engineer.docx");
    // PDF opens the browser's print dialog, which automation can't drive (see the manual checklist).
  });

  test("tailor to a job description (mocked AI)", async ({ page, user }) => {
    const resume = await createResumeViaApi(page, user);
    await openEditor(page, resume.id);

    await page.getByRole("button", { name: "AI", exact: true }).click();
    await page.getByRole("menuitem", { name: "Tailor to job description" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expectAccessible(page, { exclude: [PREVIEW] });

    await dialog.getByRole("textbox", { name: "Job description" }).fill(
      "We're hiring a platform engineer with Kubernetes, GraphQL, and observability experience to scale our payments stack.",
    );
    await dialog.getByRole("button", { name: "Analyze match" }).click();
    await expect(dialog.getByText("68", { exact: true })).toBeVisible();
    const keyword = dialog.getByRole("button", { name: "Observability" });
    await expect(keyword).toHaveAttribute("aria-pressed", "false");
    await expectAccessible(page, { exclude: [PREVIEW] });

    // Pick the suggested rewrite and a keyword, then apply them here.
    await dialog.getByRole("button", { name: "Accept" }).click();
    await keyword.click();
    await expect(keyword).toHaveAttribute("aria-pressed", "true");
    await expectAccessible(page, { exclude: [PREVIEW] });
    await dialog.getByRole("button", { name: "Apply to this résumé" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator(PREVIEW)).toContainText("on Kubernetes, with GraphQL APIs");
    await expect(page.locator(PREVIEW)).toContainText("Observability");
  });

  test("improve a bullet (mocked AI) and accept it", async ({ page, user }) => {
    const resume = await createResumeViaApi(page, user);
    await openEditor(page, resume.id);

    const button = page.getByRole("button", { name: "Improve bullet 1 from Acme Corp with AI" });
    await button.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Improve with AI" });
    await expect(dialog.getByText(IMPROVED_BULLET)).toBeVisible();
    await expectAccessible(page, { exclude: [PREVIEW] });

    await dialog.getByRole("button", { name: "Accept" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Bullet 1 from Acme Corp" })).toHaveValue(IMPROVED_BULLET);
    await expect(button).toBeFocused();
  });

  test("version history: save a version, then restore it", async ({ page, user }) => {
    const resume = await createResumeViaApi(page, user);
    await openEditor(page, resume.id);

    const history = page.getByRole("button", { name: "History" });
    await history.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Version history" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: "Version name" }).fill("Before the rewrite");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByRole("button", { name: /Before the rewrite/ })).toBeVisible();
    await expectAccessible(page, { exclude: [PREVIEW] });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(history).toBeFocused();

    // Change the title field, then restore the saved version.
    await page.getByLabel("Professional title").fill("Something else entirely");
    await waitForSave(page);
    await history.click();
    await dialog.getByRole("button", { name: /Before the rewrite/ }).click();
    await dialog.getByRole("button", { name: "Restore" }).click();
    const confirm = page.getByRole("dialog", { name: /restore/i });
    await expect(confirm).toBeVisible();
    await expectAccessible(page, { exclude: [PREVIEW] });
    await confirm.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("Professional title")).toHaveValue("Senior Software Engineer");
  });
});
