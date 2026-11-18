import path from "node:path";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // Forward API calls to the Django dev server. VITE_API_TARGET points it elsewhere
      // (the e2e suite runs Django on a side port).
      "/api": process.env.VITE_API_TARGET ?? "http://localhost:8000",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    restoreMocks: true,
    // Playwright specs run under `npm run test:e2e`, not Vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
