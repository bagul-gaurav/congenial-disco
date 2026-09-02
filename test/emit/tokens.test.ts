import { describe, expect, it } from "vitest"

import { emitComponent } from "@/emit/tsx"
import { addToken, updateToken } from "@/model/ops"
import { createDoc, createToken } from "@/model/defaults"

import { buttonFixture } from "../fixtures/button"
import { tokenizedFixture } from "../fixtures/tokenized"

describe("emitting design tokens", () => {
  it("produces a stable golden file", async () => {
    const { code } = emitComponent(tokenizedFixture().doc)
    await expect(code).toMatchFileSnapshot("./__snapshots__/TokenCard.tsx.snap")
  })

  it("emits a tokens object at module level", () => {
    const { code } = emitComponent(tokenizedFixture().doc)

    // Module level, not inside the component: tokens are static, and a reader
    // should see the design decisions before the markup that uses them.
    expect(code).toMatch(/^const tokens = \{/m)
    expect(code).toContain(`primary: "#3b5bfd",`)
    expect(code).toContain("space3: 12,")
    expect(code).toContain("} as const")
  })

  it("references tokens rather than repeating their values", () => {
    const { code } = emitComponent(tokenizedFixture().doc)

    expect(code).toContain("backgroundColor: tokens.primary,")
    expect(code).toContain("color: tokens.onPrimary,")
    expect(code).toContain("fontSize: tokens.body,")
    // The literal must appear once, in the tokens object, and nowhere else.
    expect(code.match(/#3b5bfd/g)).toHaveLength(1)
  })

  it("expands a shorthand into longhand when a part is a token", () => {
    const { code } = emitComponent(tokenizedFixture().doc)

    // `padding: "12px 12px..."` is a single string and cannot carry a
    // reference, so each side becomes its own property.
    expect(code).toContain("paddingTop: tokens.space3,")
    expect(code).toContain("paddingLeft: tokens.space3,")
    expect(code).toContain("borderTopLeftRadius: tokens.radiusMd,")
    expect(code).not.toMatch(/padding: "/)
  })

  it("keeps the shorthand when every part is a literal", () => {
    // The button fixture is entirely literal.
    const { code } = emitComponent(buttonFixture().doc)

    expect(code).toContain(`padding: "10px 18px 10px 18px"`)
    expect(code).not.toContain("paddingTop:")
  })

  it("emits only the tokens the component actually references", () => {
    let { doc } = tokenizedFixture()
    doc = addToken(doc, createToken("Unused", "color", "#abcabc"))

    const { code } = emitComponent(doc)

    // A component using three colours should not carry a whole design system.
    expect(code).not.toContain("#abcabc")
    expect(code).not.toContain("unused")
  })

  it("emits no tokens object when nothing references one", () => {
    const doc = addToken(createDoc("Plain"), createToken("Unused", "color", "#abcabc"))
    const { code } = emitComponent(doc)

    expect(code).not.toContain("const tokens")
  })

  it("sanitises token names into identifiers", () => {
    let { doc } = tokenizedFixture()
    doc = updateToken(doc, "t_primary", { name: "2 brand / colour!" })

    const { code } = emitComponent(doc)

    expect(code).toContain("_2BrandColour:")
    expect(code).toContain("backgroundColor: tokens._2BrandColour,")
  })

  it("keeps a token name that shadows a binding out of harm's way", () => {
    let { doc } = tokenizedFixture()
    doc = updateToken(doc, "t_primary", { name: "style" })

    const { code } = emitComponent(doc)

    // Tokens live inside their own object, so `tokens.style` would in fact be
    // safe. They go through the same identifier sanitiser as props anyway,
    // which reserves `style` — one implementation, and the cost is only a
    // slightly longer name in a rare case.
    expect(code).toContain("styleValue: ")
    expect(code).toContain("backgroundColor: tokens.styleValue,")
  })

  it("de-duplicates token names that sanitise to the same identifier", () => {
    let { doc } = tokenizedFixture()
    doc = updateToken(doc, "t_onprimary", { name: "Primary" })

    const { code } = emitComponent(doc)

    expect(code).toContain("primary:")
    expect(code).toContain("primary2:")
  })
})
