import type { Page } from "@playwright/test";

/**
 * Cloudflare's Turnstile script, replaced in the browser so no spec reaches Cloudflare. The fake
 * `window.turnstile` answers `execute` by calling the rendered widget's callback with Cloudflare's
 * published dummy token, which the e2e server accepts for its test secret.
 */
const SCRIPT = `
(() => {
  const widgets = new Map();
  let next = 0;
  window.turnstile = {
    render(container, options) {
      const id = "mock-widget-" + next++;
      widgets.set(id, options);
      return id;
    },
    execute(target) {
      const options = widgets.get(target);
      if (options) setTimeout(() => options.callback("XXXX.DUMMY.TOKEN.XXXX"), 0);
    },
    reset() {},
    remove(id) { widgets.delete(id); },
  };
})();
`;

export async function mockTurnstile(page: Page) {
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: SCRIPT }),
  );
}
