import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "packages/core/test/e2e",
  timeout: 120_000,
  retries: 0,
  use: {
    headless: true,
    baseURL: "http://127.0.0.1:4173"
  },
  webServer: {
    command: "npm run test:e2e:serve",
    port: 4173,
    reuseExistingServer: true,
    timeout: 120_000
  }
});
