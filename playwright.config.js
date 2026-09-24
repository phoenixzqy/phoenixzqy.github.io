import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.js",
  testIgnore: "**/*.pdf.spec.js",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
    {
      name: "pdf",
      testMatch: "**/*.pdf.spec.js",
      testIgnore: [],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
