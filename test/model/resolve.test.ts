import { describe, expect, it } from "vitest"

import { createDoc, createProp, createState, createText, createVariant } from "@/model/defaults"
import { addProp, addState, addVariant, insertNode, setOverride } from "@/model/ops"
import { resolve, variantsAffecting, walk } from "@/model/resolve"
import type { ComponentDoc, Variant } from "@/model/types"

/** A document with a labelled root, a hover variant and a tone variant. */
function fixture(): {
  doc: ComponentDoc
  labelId: string
  hover: Variant
  ghost: Variant
} {
  let doc = createDoc("Button")
  const label = createText({ name: "Label", content: "Click me" })
  doc = insertNode(doc, doc.root, label)

  const state = createState("Hover", "hover")
  doc = addState(doc, state)
  const tone = createProp({ name: "tone", type: "enum", options: ["primary", "ghost"] })
  doc = addProp(doc, tone)

  const hover = createVariant("Hover", { kind: "state", stateId: state.id })
  const ghost = createVariant("Ghost", { kind: "prop", propId: tone.id, value: "ghost" })
  doc = addVariant(doc, hover)
  doc = addVariant(doc, ghost)

  doc = setOverride(doc, hover.id, doc.root, { style: { fill: "#0000ff" } })
  doc = setOverride(doc, ghost.id, doc.root, { style: { fill: "#eeeeee", opacity: 0.9 } })

  return { doc, labelId: label.id, hover, ghost }
}

describe("resolve", () => {
  it("returns the base design when no variant is active", () => {
    const { doc } = fixture()
    const tree = resolve(doc)

    expect(tree.root.node.style.fill).toBe("#f4f4f5")
  })

  it("folds an active variant's overrides into the node", () => {
    const { doc, hover } = fixture()
    const tree = resolve(doc, { activeVariantIds: [hover.id] })

    expect(tree.root.node.style.fill).toBe("#0000ff")
  })

  it("leaves fields the variant did not touch on their base values", () => {
    const { doc, ghost } = fixture()
    const tree = resolve(doc, { activeVariantIds: [ghost.id] })

    // Ghost overrides fill and opacity but not corners — the base radius must
    // survive, which is the whole point of storing deltas rather than copies.
    expect(tree.root.node.style.corners?.topLeft).toBe(8)
    expect(tree.root.node.style.opacity).toBe(0.9)
  })

  it("lets a state variant win over a prop variant", () => {
    const { doc, hover, ghost } = fixture()
    const tree = resolve(doc, { activeVariantIds: [ghost.id, hover.id] })

    // What the component *is* (ghost) is applied first; what is happening to it
    // (hover) is applied on top.
    expect(tree.root.node.style.fill).toBe("#0000ff")
    expect(tree.root.node.style.opacity).toBe(0.9)
  })

  it("is order-independent with respect to the active list", () => {
    const { doc, hover, ghost } = fixture()
    const a = resolve(doc, { activeVariantIds: [ghost.id, hover.id] })
    const b = resolve(doc, { activeVariantIds: [hover.id, ghost.id] })

    expect(a.root.node.style).toEqual(b.root.node.style)
  })

  it("always exposes every variant's delta regardless of what is active", () => {
    const { doc, hover, ghost } = fixture()
    const tree = resolve(doc)

    // The exporter needs all deltas at once to emit conditional styles.
    expect(Object.keys(tree.root.variantStyles).sort()).toEqual([hover.id, ghost.id].sort())
  })

  it("indexes every node by id", () => {
    const { doc, labelId } = fixture()
    const tree = resolve(doc)

    expect(tree.byId[labelId]).toBeDefined()
    expect(tree.byId[doc.root].children).toHaveLength(2)
  })

  it("walks parents before children", () => {
    const { doc, labelId } = fixture()
    const seen: string[] = []
    walk(resolve(doc).root, (node) => seen.push(node.node.id))

    expect(seen[0]).toBe(doc.root)
    expect(seen).toContain(labelId)
  })

  it("reports which variants affect a node in precedence order", () => {
    const { doc, hover, ghost } = fixture()
    const affecting = variantsAffecting(resolve(doc), doc.root)

    expect(affecting.map((v) => v.id)).toEqual([ghost.id, hover.id])
  })

  it("throws when the root is missing rather than rendering nothing", () => {
    const doc = createDoc()
    const broken = { ...doc, root: "does-not-exist" }

    expect(() => resolve(broken)).toThrow(/root node/)
  })
})
