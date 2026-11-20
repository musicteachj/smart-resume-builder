import { defineConfig, devices } from "@playwright/test";

import {
  API_PORT,
  CLIENT_PORT,
  CLIENT_URL,
  DEMO_API_PORT,
  DEMO_CLIENT_PORT,
  DEMO_CLIENT_URL,
  DJANGO_DEMO_ENV,
  DJANGO_ENV,
  PYTHON,
} from "./e2e/support/env";

/**
 * End-to-end + accessibility suite (`npm run test:e2e`). Boots its own Django and Vite on
 * side ports (8012/5181) against a throwaway database, so it never touches dev data or the
 * usual 8000/5173 servers. Every AI endpoint is mocked in the specs.
 */
const desktop = { viewport: { width: 1280, height: 800 } };
/** The demo specs and the landing-screenshot capture run in their own projects against their own servers. */
const otherProjects = /(demo|screenshots)\/.*\.spec\.ts/;

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
      testIgnore: [/tablet\.spec\.ts/, otherProjects],
      use: { ...devices["Desktop Chrome"], ...desktop },
    },
    {
      name: "webkit",
      testIgnore: [/tablet\.spec\.ts/, otherProjects],
      use: { ...devices["Desktop Safari"], ...desktop },
    },
    // One tablet pass over the main pages: iPad portrait size, Safari's engine.
    {
      name: "tablet",
      testMatch: /tablet\.spec\.ts/,
      use: { ...devices["Desktop Safari"], viewport: { width: 820, height: 1180 } },
    },
    // Demo mode: the same suite shape against the demo Django (8013) and Vite (5182).
    {
      name: "demo-chromium",
      testMatch: /demo\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], ...desktop, baseURL: DEMO_CLIENT_URL },
    },
    {
      name: "demo-webkit",
      testMatch: /demo\/.*\.spec\.ts/,
      use: { ...devices["Desktop Safari"], ...desktop, baseURL: DEMO_CLIENT_URL },
    },
    // Landing screenshots (`npm run screenshots`); not part of the regular run.
    ...(process.env.SCREENSHOTS === "1"
      ? [
          {
            name: "screenshots",
            testMatch: /screenshots\/.*\.spec\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              ...desktop,
              baseURL: DEMO_CLIENT_URL,
              colorScheme: "light" as const,
            },
          },
        ]
      : []),
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
    {
      // The demo Django: demo mode on, Cloudflare's always-pass Turnstile test keys, its own database.
      command: [
        `"${PYTHON}" e2e/server/ensure_db.py`,
        `"${PYTHON}" ../server/manage.py migrate --noinput`,
        `"${PYTHON}" ../server/manage.py runserver 127.0.0.1:${DEMO_API_PORT} --noreload`,
      ].join(" && "),
      url: `http://127.0.0.1:${DEMO_API_PORT}/health`,
      env: DJANGO_DEMO_ENV,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "ignore",
    },
    {
      command: `npx vite --port ${DEMO_CLIENT_PORT} --strictPort`,
      url: DEMO_CLIENT_URL,
      env: { VITE_API_TARGET: `http://127.0.0.1:${DEMO_API_PORT}` },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
