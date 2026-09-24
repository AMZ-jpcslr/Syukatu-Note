import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Isolated demo capture: no production database or real user session is used.
export default defineConfig({
  ...base,
  testDir: "./scripts",
  testMatch: "capture-readme.spec.ts",
  outputDir: "test-results/readme",
  projects: [
    { name: "readme", use: { viewport: { width: 1440, height: 1000 } } },
  ],
});
