import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Shared by playwright.config.ts (to boot Django) and the specs (to run its helper scripts). */
const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SERVER_DIR = path.resolve(clientDir, "../server");
export const E2E_SERVER_HELPERS = path.join(clientDir, "e2e/server");

const venvPython = path.join(SERVER_DIR, ".venv/bin/python");
/** CI installs the server deps into the runner's Python; locally the repo venv has them. */
export const PYTHON = process.env.E2E_PYTHON ?? (existsSync(venvPython) ? venvPython : "python3.12");

export const API_PORT = 8012;
export const CLIENT_PORT = 5181;
export const CLIENT_URL = `http://localhost:${CLIENT_PORT}`;

/** Environment for every Django process the suite starts (the server and helper scripts). */
export const DJANGO_ENV: Record<string, string> = {
  DEBUG: "True",
  DJANGO_SETTINGS_MODULE: "e2e_settings",
  PYTHONPATH: [E2E_SERVER_HELPERS, SERVER_DIR].join(path.delimiter),
  CLIENT_URL,
  E2E_DATABASE_URL:
    process.env.E2E_DATABASE_URL ?? "postgres://resume_user:resume_pass@localhost:5432/resume_builder_e2e",
};
