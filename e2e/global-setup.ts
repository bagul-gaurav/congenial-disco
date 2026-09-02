import { execFileSync } from "node:child_process"

/**
 * Resets the demo component before each run.
 *
 * Several editor tests are destructive by nature — one deletes a layer, others
 * change its fill — and the database persists between runs, so without this the
 * suite passes once and then fails against the wreckage of the previous run.
 * The seed upserts by name, so this restores a known starting point.
 */
export default function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error("E2E needs E2E_DATABASE_URL or DATABASE_URL")

  execFileSync("npx", ["tsx", "prisma/seed.ts"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DEV_USER_EMAIL: "e2e@localhost" },
  })
}
