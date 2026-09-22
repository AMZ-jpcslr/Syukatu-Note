import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://localhost:3100",
    headless: true,
    actionTimeout: 15000,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next dev --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    env: { NEXT_PUBLIC_DEMO_MODE: "true" },
    timeout: 120000,
  },
});
