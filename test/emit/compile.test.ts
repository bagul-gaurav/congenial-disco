import { execFileSync } from "node:child_process"
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

import { createDoc, createImage, createProp, createShape, createText } from "@/model/defaults"
import { addProp, bindField, insertNode, setNodeLayout } from "@/model/ops"
import { emitComponent } from "@/emit/tsx"
import type { ComponentDoc } from "@/model/types"

import { buttonFixture } from "../fixtures/button"

const OUT_DIR = path.resolve(__dirname, "../generated")

/**
 * Documents covering each codegen path. Every one is emitted to disk and type
 * checked, so a change that produces syntactically valid but ill-typed output
 * fails here rather than in Framer.
 */
function cases(): Record<string, ComponentDoc> {
  const empty = createDoc("Empty")

  let absolute = createDoc("Absolute Layout")
  absolute = setNodeLayout(absolute, absolute.root, { mode: "absolute" } as never)
  absolute = insertNode(absolute, absolute.root, createShape({ id: "n_box", name: "Box" }))

  let media = createDoc("Media Card")
  const srcProp = createProp({ id: "p_src", name: "image", type: "image", defaultValue: "" })
  const colorProp = createProp({ id: "p_c", name: "accent", type: "color", defaultValue: "#ff0000" })
  media = addProp(media, srcProp)
  media = addProp(media, colorProp)
  const img = createImage({ id: "n_img", name: "Cover" })
  media = insertNode(media, media.root, img)
  media = bindField(media, img.id, "src", srcProp.id)
  media = bindField(media, media.root, "fill", colorProp.id)

  let quoted = createDoc("Odd Names")
  quoted = insertNode(quoted, quoted.root, createText({ id: "n_q", name: "3 weird / name!" }))

  return {
    Button: buttonFixture().doc,
    Empty: empty,
    Absolute: absolute,
    Media: media,
    OddNames: quoted,
  }
}

describe("generated components", () => {
  beforeAll(() => {
    mkdirSync(OUT_DIR, { recursive: true })

    // Clear previously emitted components but leave the checked-in tsconfig,
    // which is what points `tsc` at the Framer shim.
    for (const file of readdirSync(OUT_DIR)) {
      if (file.endsWith(".tsx")) rmSync(path.join(OUT_DIR, file))
    }

    for (const [name, doc] of Object.entries(cases())) {
      writeFileSync(path.join(OUT_DIR, `${name}.tsx`), emitComponent(doc).code)
    }
  })

  it("writes a file per case", () => {
    const files = readdirSync(OUT_DIR).filter((f) => f.endsWith(".tsx"))
    expect(files.sort()).toEqual(["Absolute.tsx", "Button.tsx", "Empty.tsx", "Media.tsx", "OddNames.tsx"])
  })

  it("type checks against Framer's module surface", () => {
    // The real check. `tsc` sees the same imports Framer would resolve, so a
    // malformed identifier, a bad control shape or a broken JSX tree fails here
    // instead of silently producing a red box on the Framer canvas.
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
