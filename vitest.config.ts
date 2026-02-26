import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only pick up test files inside our source packages, not node_modules
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/api/src/**/*.test.ts",
    ],
    exclude: ["node_modules", "**/dist/**"],
    environment: "node",
    globals: true,
    // Each test file gets its own isolated module environment so vi.mock() scoping
    // behaves predictably between the shared-utils and api suites.
    isolate: true,
  },
});
