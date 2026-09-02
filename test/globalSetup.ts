/**
 * Emits the generated components before the test run.
 *
 * They have to exist on disk before Vite transforms the test files, because the
 * runtime test imports one of them — so this cannot be a `beforeAll`.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

import { emitComponent } from "../src/emit/tsx"
import { generatedCases } from "./fixtures/cases"

const OUT_DIR = path.resolve(__dirname, "./generated")

export default function setup() {
  mkdirSync(OUT_DIR, { recursive: true })

  // Clear stale output but keep the checked-in tsconfig that points `tsc` at
  // the Framer type shim.
  for (const file of readdirSync(OUT_DIR)) {
    if (file.endsWith(".tsx")) rmSync(path.join(OUT_DIR, file))
  }

  for (const [name, doc] of Object.entries(generatedCases())) {
    writeFileSync(path.join(OUT_DIR, `${name}.tsx`), emitComponent(doc).code)
  }
}
