import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";

/** OS color-scheme preference; used as the first-visit default. */
export function getSystemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Toggle the `.dark` class on <html> to switch the app chrome theme. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

/**
 * App-chrome theme store. Persists to localStorage (`srb-theme`); first visit with no
 * stored value defaults to the OS preference. The resume document stays light regardless
 * — `ResumeDocument` uses explicit paper/ink colors, not theme tokens.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: getSystemTheme(),
      toggle: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setTheme: (theme) => set({ theme }),
    }),
    { name: "srb-theme" },
  ),
);
