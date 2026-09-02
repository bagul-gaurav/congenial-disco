import { execFileSync } from "node:child_process"
import { readdirSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { generatedCases } from "../fixtures/cases"

/**
 * Type checks every generated component against Framer's module surface.
 *
 * The files are emitted by `test/globalSetup.ts`. `tsc` sees the same imports
 * Framer would resolve, so a malformed identifier, a bad control shape, an
 * invalid CSS value or a broken JSX tree fails here rather than showing up as a
 * red box on the Framer canvas with no useful message.
 */
const OUT_DIR = path.resolve(__dirname, "../generated")

describe("generated components", () => {
  it("writes a file per case", () => {
    const files = readdirSync(OUT_DIR)
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => f.replace(/\.tsx$/, ""))
      .sort()

    expect(files).toEqual(Object.keys(generatedCases()).sort())
  })

  it("type checks against Framer's module surface", () => {
    try {
      execFileSync("npx", ["tsc", "--noEmit", "--project", path.join(OUT_DIR, "tsconfig.json")], {
        stdio: "pipe",
        encoding: "utf8",
      })
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string }
      throw new Error(`Generated components failed to compile:\n${err.stdout ?? ""}${err.stderr ?? ""}`)
    }
  }, 120_000)
})
