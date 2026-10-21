import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    // Real E2E goes through nginx so /api/v0 exercises the same-origin proxy.
    baseURL: process.env.ARIA_E2E_BASE_URL ?? "http://localhost",
    trace: "on-first-retry",
  },
  webServer: undefined,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
