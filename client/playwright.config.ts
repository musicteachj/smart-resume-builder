import { defineConfig, devices } from "@playwright/test";

import { API_PORT, CLIENT_PORT, CLIENT_URL, DJANGO_ENV, PYTHON } from "./e2e/support/env";

/**
 * End-to-end + accessibility suite (`npm run test:e2e`). Boots its own Django and Vite on
 * side ports (8012/5181) against a throwaway database, so it never touches dev data or the
 * usual 8000/5173 servers. Every AI endpoint is mocked in the specs.
 */
const desktop = { viewport: { width: 1280, height: 800 } };

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: CLIENT_URL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /tablet\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], ...desktop },
    },
    {
      name: "webkit",
      testIgnore: /tablet\.spec\.ts/,
      use: { ...devices["Desktop Safari"], ...desktop },
    },
    // One tablet pass over the main pages: iPad portrait size, Safari's engine.
    {
      name: "tablet",
      testMatch: /tablet\.spec\.ts/,
      use: { ...devices["Desktop Safari"], viewport: { width: 820, height: 1180 } },
    },
  ],
  webServer: [
    {
      // Create and migrate the throwaway database, then serve the API (no autoreloader).
      command: [
        `"${PYTHON}" e2e/server/ensure_db.py`,
        `"${PYTHON}" ../server/manage.py migrate --noinput`,
        `"${PYTHON}" ../server/manage.py runserver 127.0.0.1:${API_PORT} --noreload`,
      ].join(" && "),
      url: `http://127.0.0.1:${API_PORT}/health`,
      env: DJANGO_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "ignore",
    },
    {
      command: `npx vite --port ${CLIENT_PORT} --strictPort`,
      url: CLIENT_URL,
      env: { VITE_API_TARGET: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
