import { defineConfig } from "@playwright/test";

import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  testDir: "./src/tests",
  // Aborts a CI run if portals cannot be created and really deleted.
  globalSetup: process.env.CI ? "./src/fixtures/preflight.ts" : undefined,
  retries: process.env.CI ? 1 : 0,
  workers: 4,

  outputDir: `./test-output/${process.env.JOB_NAME ?? "local"}`,
  reporter: [
    [
      "html",
      {
        outputFolder: `./playwright-report/${process.env.JOB_NAME ?? "local"}`,
        open: "never",
      },
    ],
    [
      "junit",
      {
        outputFile: `./playwright-report/${process.env.JOB_NAME ?? "local"}/test-results.xml`,
      },
    ],
  ],
  use: {
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "api-tests",
      testMatch: "**/*.spec.ts",
    },
  ],
  timeout: 240000,
});
