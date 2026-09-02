import { describe, expect, it } from "vitest"

import { corners, createDoc, createText, createToken, padding, starterTokens } from "@/model/defaults"
import {
  addToken,
  addTokens,
  insertNode,
  nodesUsingToken,
  removeToken,
  setNodeStyle,
  updateToken,
  validate,
} from "@/model/ops"
import { literalOf, resolveValue, tokensOfType } from "@/model/values"
import { isTokenRef } from "@/model/types"

import { tokenizedFixture } from "../fixtures/tokenized"

describe("token operations", () => {
  it("adds a token", () => {
    const token = createToken("Primary", "color", "#ff0000")
    expect(addToken(createDoc(), token).tokens).toEqual([token])
  })

  it("skips names the document already has when adding a set", () => {
    let doc = addToken(createDoc(), createToken("Primary", "color", "#ff0000"))
    doc = addTokens(doc, starterTokens())

    // Adding the starter set twice must not leave two "Primary" colours.
    expect(doc.tokens.filter((t) => t.name === "Primary")).toHaveLength(1)
    // ...and the one that survives is the one already in the document.
    expect(doc.tokens.find((t) => t.name === "Primary")?.value).toBe("#ff0000")
  })

  it("distinguishes tokens of different types with the same name", () => {
    let doc = addToken(createDoc(), createToken("Body", "fontSize", 16))
    doc = addTokens(doc, [createToken("Body", "color", "#111111")])

    expect(doc.tokens).toHaveLength(2)
  })

  it("updates a token's value", () => {
    const { doc, ids } = tokenizedFixture()
    const next = updateToken(doc, ids.primary, { value: "#00ff00" })

    expect(next.tokens.find((t) => t.id === ids.primary)?.value).toBe("#00ff00")
    // Layers point at the token, so nothing about them changes.
    expect(next.nodes[ids.root].style.fill).toEqual({ token: ids.primary })
  })

  it("offers only tokens of a matching type", () => {
    const { doc } = tokenizedFixture()

    expect(tokensOfType(doc, "color").map((t) => t.name)).toEqual(["Primary", "On primary"])
    expect(tokensOfType(doc, "radius").map((t) => t.name)).toEqual(["Radius md"])
  })

  it("reports which nodes read a token", () => {
    const { doc, ids } = tokenizedFixture()

    expect(nodesUsingToken(doc, ids.primary)).toEqual([ids.root])
    expect(nodesUsingToken(doc, ids.body)).toEqual([ids.label])
    // Space drives both gap and padding on the root.
    expect(nodesUsingToken(doc, ids.space)).toEqual([ids.root])
  })
})

describe("deleting a token", () => {
  it("inlines the value everywhere it was used", () => {
    const { doc, ids } = tokenizedFixture()
    const next = removeToken(doc, ids.primary)

    // A dangling reference would silently lose the colour and emit a lookup
    // into a `tokens` object that no longer has the key.
    expect(next.nodes[ids.root].style.fill).toBe("#3b5bfd")
    expect(next.tokens.find((t) => t.id === ids.primary)).toBeUndefined()
    expect(validate(next)).toEqual([])
  })

  it("inlines into nested style fields", () => {
    const { doc, ids } = tokenizedFixture()
    const next = removeToken(doc, ids.body)

    expect(next.nodes[ids.label].style.text?.fontSize).toBe(15)
  })

  it("inlines into layout gap and padding", () => {
    const { doc, ids } = tokenizedFixture()
    const next = removeToken(doc, ids.space)
    const root = next.nodes[ids.root]

    expect(root.type === "frame" && root.layout.mode === "stack" && root.layout.gap).toBe(12)
    expect(root.type === "frame" && root.layout.padding.top).toBe(12)
  })

  it("inlines into corner radius", () => {
    const { doc, ids } = tokenizedFixture()
    const next = removeToken(doc, ids.radius)

    expect(next.nodes[ids.root].style.corners?.topLeft).toBe(8)
  })

  it("inlines into variant overrides", () => {
    let doc = createDoc()
    const token = createToken("Accent", "color", "#123456")
    doc = addToken(doc, token)
    doc = {
      ...doc,
      variants: [
        {
          id: "v1",
          name: "Hover",
          selector: { kind: "state", stateId: "s1" },
          overrides: { [doc.root]: { style: { fill: { token: token.id } } } },
        },
      ],
    }

    const next = removeToken(doc, token.id)
    expect(next.variants[0].overrides[doc.root].style?.fill).toBe("#123456")
  })

  it("leaves other tokens' references alone", () => {
    const { doc, ids } = tokenizedFixture()
    const next = removeToken(doc, ids.primary)

    expect(isTokenRef(next.nodes[ids.root].style.corners?.topLeft)).toBe(true)
  })
})

describe("reading values", () => {
  it("returns the literal when there is one", () => {
    expect(literalOf(12, 0)).toBe(12)
    expect(literalOf("#fff", "#000")).toBe("#fff")
  })

  it("falls back for a reference, which has no literal to show", () => {
    expect(literalOf({ token: "t1" }, 0)).toBe(0)
    expect(literalOf({ bind: "p1" }, 0)).toBe(0)
    expect(literalOf(undefined, 7)).toBe(7)
  })

  it("resolves a token reference to the token's value", () => {
    const token = createToken("Space", "space", 20)
    expect(resolveValue({ token: token.id }, { tokens: [token] }, 0)).toBe(20)
  })

  it("falls back when a token no longer exists", () => {
    // A deleted token should degrade to a sane value rather than rendering
    // `undefined` into the DOM.
    expect(resolveValue({ token: "gone" }, { tokens: [] }, 4)).toBe(4)
  })

  it("resolves a prop binding against supplied values", () => {
    expect(resolveValue({ bind: "p1" }, { tokens: [], props: { p1: "#abc" } }, "#000")).toBe("#abc")
  })
})

describe("documents without tokens", () => {
  it("still validate and keep literal values", () => {
    let doc = createDoc()
    doc = insertNode(doc, doc.root, createText({ name: "Plain" }))
    doc = setNodeStyle(doc, doc.root, { corners: corners(4) })

    expect(doc.tokens).toEqual([])
    expect(doc.nodes[doc.root].style.corners?.topLeft).toBe(4)
    expect(validate(doc)).toEqual([])
  })

  it("accepts a padding helper given a token", () => {
    const p = padding({ token: "t1" })
    expect(p.top).toEqual({ token: "t1" })
  })
})
