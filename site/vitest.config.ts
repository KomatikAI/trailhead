import { defineConfig } from "vitest/config";
import path from "node:path";

// Self-contained: the repo root has its own vitest config that scans src/**.
// This config keeps site/ tests isolated to site/__tests__ and wires the `@/`
// path alias used by the app (matches tsconfig paths).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
});
