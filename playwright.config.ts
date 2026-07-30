import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src/test/e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    headless: true,
    trace: "retain-on-failure",
    baseURL: "http://localhost:1420",
  },
  webServer: [
    {
      command: "pnpm dev:test",
      url: "http://localhost:1420",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "pnpm build:share && npx vite preview --config vite.share.config.ts --port 4173",
      url: "http://localhost:4173/share.html",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
