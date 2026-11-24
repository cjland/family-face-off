import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

config({ path: ".env.local" });
config();

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Start the app automatically unless E2E_BASE_URL points at a running server.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm start",
        url: `${baseURL}/api/health`,
        reuseExistingServer: true,
        timeout: 240_000,
        env: { ENABLE_DEMO_TOOLS: "true" },
      },
});
