import { defineConfig, devices } from "@playwright/test";

const requestedWorkers = Number(process.env.E2E_PLAYWRIGHT_WORKERS ?? 1);
const workers = Number.isInteger(requestedWorkers) && requestedWorkers > 0 ? requestedWorkers : 1;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Default to serial until a selected set is known to have isolated state.
  // Independent spec files can opt into concurrency via E2E_PLAYWRIGHT_WORKERS.
  workers,
  use: {
    // Real E2E goes through nginx so /api/v0 exercises the same-origin proxy.
    baseURL: process.env.ARIA_E2E_BASE_URL ?? "http://localhost",
    trace: "on-first-retry",
  },
  webServer: undefined,
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
