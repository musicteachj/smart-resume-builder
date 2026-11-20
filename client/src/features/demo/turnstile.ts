// Cloudflare Turnstile, loaded only when a visitor presses "Try the live demo", never on page
// load: visitors who only read the landing page never contact Cloudflare. One widget is rendered
// per start in a slot under the button, executed at once, and removed when it answers, so every
// start carries a fresh single-use token. In `interaction-only` mode the widget stays invisible
// unless Cloudflare needs a click, and then its checkbox appears in the slot. The site key comes
// from `GET /api/demo/status`. Modeled on Open Door's `apps/web/src/lib/turnstile.ts`.
// Source: developers.cloudflare.com/turnstile, read 2026-11-20.

export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** The action the server's check expects. */
const ACTION = "start-demo";

/** How long Cloudflare's script may take to load before the start gives up. */
export const SCRIPT_TIMEOUT_MS = 10_000;

/**
 * How long a widget may take to answer. Long enough for a person to find and solve an
 * interactive checkbox; it only bounds a widget that never calls back at all, so the start
 * can't hang until a reload.
 */
export const TOKEN_TIMEOUT_MS = 120_000;

type TurnstileOptions = {
  sitekey: string;
  action: string;
  execution: "execute" | "render";
  appearance: "always" | "execute" | "interaction-only";
  callback: (token: string) => void;
  "error-callback": (code?: string) => unknown;
  "expired-callback": () => void;
  "timeout-callback": () => void;
};

export type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileOptions) => string | undefined;
  execute: (container: HTMLElement | string) => void;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Our script element, if one is still on the page (loading, or loaded with its API). */
function findScript(): HTMLScriptElement | undefined {
  return [...document.querySelectorAll<HTMLScriptElement>("script")].find((s) => s.src === TURNSTILE_SCRIPT_URL);
}

/** Adds Cloudflare's script. It stays on the page until it fails or loads without its API,
 * even after a wait for it gives up, so a slow script is waited on again, never duplicated. */
function addScript(): HTMLScriptElement {
  const script = document.createElement("script");
  script.src = TURNSTILE_SCRIPT_URL;
  script.async = true;
  // Removed when it can never work, so the next press loads a fresh copy.
  script.addEventListener("error", () => script.remove());
  script.addEventListener("load", () => {
    if (!window.turnstile) script.remove();
  });
  document.head.append(script);
  return script;
}

/** Waits up to `SCRIPT_TIMEOUT_MS` for the script to load. */
function waitForScript(script: HTMLScriptElement): Promise<TurnstileApi> {
  return new Promise<TurnstileApi>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
    const onLoad = () => {
      done();
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("The Turnstile script loaded without its API."));
    };
    const onError = () => {
      done();
      reject(new Error("The Turnstile script could not be loaded."));
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error("The Turnstile script took too long to load."));
    }, SCRIPT_TIMEOUT_MS);
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
  });
}

/**
 * Loads Cloudflare's script once. A failure, or no answer within `SCRIPT_TIMEOUT_MS`, rejects
 * and is forgotten, so a later press tries again: it waits on a script that is still loading
 * rather than adding a second copy (Cloudflare's runtime doesn't expect two), and loads a fresh
 * one only after a failure removed the first. The script comes from Cloudflare directly, as they ask.
 */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (scriptPromise) return scriptPromise;
  const existing = findScript();
  // A script that outlived an earlier wait may have finished since (one that loaded without
  // its API removed itself, so a script still on the page with the API defined is ready).
  if (existing && window.turnstile) return Promise.resolve(window.turnstile);
  const loading = waitForScript(existing ?? addScript());
  scriptPromise = loading;
  loading.catch(() => {
    if (scriptPromise === loading) scriptPromise = null;
  });
  return loading;
}

/**
 * A fresh token for one demo start. Renders one widget in `container`, executes it, and
 * resolves with the token; rejects on an error, a timeout, an expiry, or no answer at all
 * within `TOKEN_TIMEOUT_MS`. The widget is always removed after.
 */
export async function getTurnstileToken(container: HTMLElement, siteKey: string): Promise<string> {
  const turnstile = await loadTurnstile();
  return new Promise<string>((resolve, reject) => {
    let widgetId: string | undefined;
    let settled = false;
    const timer = setTimeout(
      () => finish(() => reject(new Error("The Turnstile check did not answer."))),
      TOKEN_TIMEOUT_MS,
    );
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (widgetId !== undefined) turnstile.remove(widgetId);
      } catch {
        // A widget that is already gone is the state wanted.
      }
      settle();
    };
    try {
      widgetId = turnstile.render(container, {
        sitekey: siteKey,
        action: ACTION,
        execution: "execute",
        appearance: "interaction-only",
        callback: (token) => finish(() => resolve(token)),
        "error-callback": (code) =>
          finish(() => reject(new Error(`The Turnstile check failed (${code ?? "unknown"}).`))),
        "expired-callback": () => finish(() => reject(new Error("The Turnstile token expired."))),
        "timeout-callback": () => finish(() => reject(new Error("The Turnstile check timed out."))),
      });
      turnstile.execute(widgetId ?? container);
    } catch (error) {
      finish(() => reject(error instanceof Error ? error : new Error("The Turnstile check failed.")));
    }
  });
}

/** For tests: forget the loaded script. */
export function resetTurnstileForTests(): void {
  scriptPromise = null;
}
