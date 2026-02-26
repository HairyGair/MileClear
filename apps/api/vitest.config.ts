import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Point @mileclear/shared at its TypeScript source so we don't need a
      // compiled dist/ when running API tests.
      "@mileclear/shared": path.resolve(
        __dirname,
        "../../packages/shared/src/index.ts"
      ),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globals: true,
    // Ensure env vars are available for JWT signing in tests
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-jwt-secret-at-least-32-chars-long!!",
      JWT_REFRESH_SECRET: "test-refresh-secret-at-least-32-chars!!",
    },
  },
});
