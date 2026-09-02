import { defineConfig, devices } from "@playwright/test"

/**
 * Browser tests drive the real editor in Chromium.
 *
 * These need a Postgres database, so they are a separate script (`npm run
 * test:e2e`) rather than part of `npm test` — the unit, golden, compile and
 * runtime passes stay runnable with no services at all.
 *
 * `E2E_DATABASE_URL` points at a database the run is free to migrate and write
 * to; it falls back to `DATABASE_URL`.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // one shared database and one seeded workspace
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Use a pre-installed Chromium when one is provided (as in this
          // container image), rather than downloading a matching build.
          // Unset locally and Playwright resolves its own browser as usual.
          executablePath: process.env.CHROMIUM_PATH || undefined,
        },
      },
    },
  ],

  webServer: {
    // Production build: closer to what a user runs, and far faster to drive
    // than dev-mode compilation on first hit of each route.
    command: `npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
      DEV_USER_EMAIL: "e2e@localhost",
    },
  },
})
