import type { Config } from "tailwindcss";

/**
 * Editorial Ink design tokens — single source of truth is docs/DESIGN.md.
 * Colors reference CSS variables defined in src/index.css (:root / .dark)
 * so components never hardcode hex values.
 */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        surface: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          variant: "hsl(var(--surface-variant) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          foreground: "hsl(var(--foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--surface-variant) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--border) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          foreground: "hsl(var(--success-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--surface) / <alpha-value>)",
          foreground: "hsl(var(--foreground) / <alpha-value>)",
        },
      },
      fontFamily: {
        // App chrome only — the resume document uses font-document (ATS-safe).
        display: ["Newsreader", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        document: ["Georgia", "Times New Roman", "serif"],
        "document-sans": ["Arial", "Helvetica", "sans-serif"],
      },
      borderRadius: {
        sm: "6px",
        md: "8px",
        lg: "12px",
      },
      boxShadow: {
        light: "0 1px 2px rgb(27 27 26 / 0.04), 0 2px 8px rgb(27 27 26 / 0.05)",
        medium: "0 4px 12px rgb(27 27 26 / 0.08)",
        heavy: "0 12px 32px rgb(27 27 26 / 0.12)",
        accent: "0 8px 24px rgb(15 81 50 / 0.22)",
      },
      zIndex: {
        header: "10",
        dropdown: "20",
        drawer: "40",
        modal: "100",
        toast: "1000",
      },
      keyframes: {
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
