/**
 * The documents the codegen tests emit and check.
 *
 * Shared between the compile pass (`tsc --noEmit` over the output) and the
 * runtime pass (importing and rendering the output), so both exercise exactly
 * the same generated files.
 */

import { createDoc, createImage, createProp, createShape, createText } from "@/model/defaults"
import { addProp, bindField, insertNode, setNodeLayout } from "@/model/ops"
import type { ComponentDoc } from "@/model/types"

import { buttonFixture } from "./button"

export function generatedCases(): Record<string, ComponentDoc> {
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

  const button = buttonFixture().doc

  return {
    Button: button,
    // The same document under a second name: the compile pass checks it, and
    // the runtime pass imports this one and renders it.
    RuntimeButton: button,
    Empty: empty,
    Absolute: absolute,
    Media: media,
    OddNames: quoted,
  }
}
