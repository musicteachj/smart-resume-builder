import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyTheme, getSystemTheme, useThemeStore } from "./theme";

function mockMatchMedia(prefersDark: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: prefersDark && query.includes("dark"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    useThemeStore.setState({ theme: "light" });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("getSystemTheme reads the OS preference", () => {
    mockMatchMedia(true);
    expect(getSystemTheme()).toBe("dark");
    mockMatchMedia(false);
    expect(getSystemTheme()).toBe("light");
  });

  it("toggle flips the theme", () => {
    expect(useThemeStore.getState().theme).toBe("light");
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe("dark");
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("persists the theme to localStorage under srb-theme", () => {
    useThemeStore.getState().setTheme("dark");
    expect(localStorage.getItem("srb-theme")).toContain("dark");
  });

  it("applyTheme toggles the .dark class on <html>", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
