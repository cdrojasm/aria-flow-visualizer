import { defineConfig, devices } from "@playwright/test";

const realApi = process.env.ARIA_E2E_REAL === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: !realApi,
  use: {
    // Real E2E goes through nginx so /api/v0 exercises the same-origin proxy.
    baseURL:
      process.env.ARIA_E2E_BASE_URL ?? (realApi ? "http://localhost" : "http://127.0.0.1:4173"),
    trace: "on-first-retry",
  },
  webServer: realApi
    ? undefined
    : {
        command: "npm run dev -- --host 127.0.0.1 --port 4173",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
