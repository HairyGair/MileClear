import { defineConfig, devices } from "@playwright/test";

// The app runs against `next dev` with NEXT_PUBLIC_API_URL pointed at a dead
// local port. Every API call the tests care about is answered by page.route()
// fixtures (e2e/fixtures/api.ts), and anything unmocked fails to connect, so
// the suite can never reach the real API or database.
export const FAKE_API = "http://127.0.0.1:3999";
const PORT = 3100;

export default defineConfig({
  testDir: ".",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    cwd: "..",
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_API_URL: FAKE_API,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
