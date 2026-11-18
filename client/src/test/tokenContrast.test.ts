/// <reference types="node" />
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Read from disk (Vitest runs from client/): it stubs CSS imports (`css: false`), even `?raw` ones.
const css = readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");

/**
 * axe's color-contrast rule only checks text, so non-text contrast (WCAG 1.4.11) for the
 * form-field border token is checked here, from the CSS variables themselves.
 */
function tokens(block: ":root" | ".dark"): Record<string, [number, number, number]> {
  const start = css.indexOf(`${block} {`);
  const body = css.slice(start, css.indexOf("}", start));
  const out: Record<string, [number, number, number]> = {};
  for (const [, name, h, s, l] of body.matchAll(/--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)) {
    out[name] = [Number(h), Number(s), Number(l)];
  }
  return out;
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(hslToRgb(a)), luminance(hslToRgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("design tokens: non-text contrast", () => {
  for (const theme of [":root", ".dark"] as const) {
    it(`input-border is at least 3:1 against page, card, and surface-variant (${theme})`, () => {
      const t = tokens(theme);
      expect(t["input-border"]).toBeDefined();
      for (const bg of ["background", "surface", "surface-variant"]) {
        expect(contrast(t["input-border"], t[bg]), `${theme} input-border on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
