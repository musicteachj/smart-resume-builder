import { defineConfig } from "orval";

/**
 * Generates a typed axios + TanStack Query client from the Django OpenAPI schema.
 * Zod generation is intentionally OFF — we own form validation with hand-written
 * Zod schemas. Regenerate with `npm run gen:api`. The generated folder is never
 * hand-edited.
 */
export default defineConfig({
  resume: {
    input: "./openapi.yaml",
    output: {
      mode: "tags-split",
      target: "./src/api/generated",
      schemas: "./src/api/generated/model",
      client: "react-query",
      httpClient: "axios",
      clean: true,
      override: {
        mutator: { path: "./src/api/axios.ts", name: "customAxios" },
      },
    },
  },
});
