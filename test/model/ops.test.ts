import { describe, expect, it } from "vitest"

import {
  createDoc,
  createFrame,
  createProp,
  createState,
  createText,
  createVariant,
} from "@/model/defaults"
import {
  addProp,
  addState,
  addVariant,
  bindField,
  insertNode,
  isDescendant,
  nodesBoundTo,
  parentOf,
  removeNode,
  removeProp,
  removeState,
  reorderChild,
  reparentNode,
  setOverride,
  subtreeIds,
  validate,
} from "@/model/ops"
import { isBinding } from "@/model/types"

describe("tree structure", () => {
  it("keeps a new document valid", () => {
    expect(validate(createDoc())).toEqual([])
  })

  it("inserts a node under a frame and keeps the document valid", () => {
    const doc = createDoc()
    const child = createText({ name: "Second" })
    const next = insertNode(doc, doc.root, child)

    expect(parentOf(next, child.id)?.id).toBe(doc.root)
    expect(validate(next)).toEqual([])
  })

  it("removes a whole subtree and leaves no orphans", () => {
    let doc = createDoc()
    const group = createFrame({ name: "Group" })
    const leaf = createText({ name: "Leaf" })
    doc = insertNode(doc, doc.root, group)
    doc = insertNode(doc, group.id, leaf)

    const next = removeNode(doc, group.id)

    expect(next.nodes[group.id]).toBeUndefined()
    expect(next.nodes[leaf.id]).toBeUndefined()
    expect(validate(next)).toEqual([])
  })

  it("refuses to remove the root", () => {
    const doc = createDoc()
    expect(removeNode(doc, doc.root)).toBe(doc)
  })

  it("reparents a node between frames", () => {
    let doc = createDoc()
    const a = createFrame({ name: "A" })
    const b = createFrame({ name: "B" })
    const leaf = createText({ name: "Leaf" })
    doc = insertNode(doc, doc.root, a)
    doc = insertNode(doc, doc.root, b)
    doc = insertNode(doc, a.id, leaf)

    const next = reparentNode(doc, leaf.id, b.id)

    expect(parentOf(next, leaf.id)?.id).toBe(b.id)
    expect((next.nodes[a.id] as { children: string[] }).children).not.toContain(leaf.id)
    expect(validate(next)).toEqual([])
  })

  it("refuses to move a node into its own subtree", () => {
    let doc = createDoc()
    const outer = createFrame({ name: "Outer" })
    const inner = createFrame({ name: "Inner" })
    doc = insertNode(doc, doc.root, outer)
    doc = insertNode(doc, outer.id, inner)

    expect(isDescendant(doc, outer.id, inner.id)).toBe(true)
    // Would detach the whole subtree from the root — must be a no-op.
    expect(reparentNode(doc, outer.id, inner.id)).toBe(doc)
  })

  it("reorders siblings", () => {
    let doc = createDoc()
    const a = createText({ name: "A" })
    const b = createText({ name: "B" })
    doc = insertNode(doc, doc.root, a)
    doc = insertNode(doc, doc.root, b)

    const next = reorderChild(doc, b.id, 0)
    const children = (next.nodes[doc.root] as { children: string[] }).children

    expect(children[0]).toBe(b.id)
    expect(validate(next)).toEqual([])
  })

  it("lists a subtree parents-first", () => {
    let doc = createDoc()
    const group = createFrame({ name: "Group" })
    const leaf = createText({ name: "Leaf" })
    doc = insertNode(doc, doc.root, group)
    doc = insertNode(doc, group.id, leaf)

    const ids = subtreeIds(doc, group.id)
    expect(ids[0]).toBe(group.id)
    expect(ids).toContain(leaf.id)
  })
})

describe("props and bindings", () => {
  it("normalises prop names into identifiers and de-duplicates them", () => {
    let doc = createDoc()
    doc = addProp(doc, createProp({ name: "On click!", type: "event" }))
    doc = addProp(doc, createProp({ name: "on click", type: "event" }))

    expect(doc.props.map((p) => p.name)).toEqual(["onClick", "onClick2"])
  })

  it("binds a text layer to a prop and reports the dependency", () => {
    let doc = createDoc()
    const label = createText({ name: "Label" })
    doc = insertNode(doc, doc.root, label)
    const prop = createProp({ name: "label", type: "text", defaultValue: "Click me" })
    doc = addProp(doc, prop)
    doc = bindField(doc, label.id, "content", prop.id)

    expect(isBinding(doc.nodes[label.id] && (doc.nodes[label.id] as { content: unknown }).content))
      .toBe(true)
    expect(nodesBoundTo(doc, prop.id)).toContain(label.id)
  })

  it("reverts bindings to literals when the prop is deleted", () => {
    let doc = createDoc()
    const label = createText({ name: "Label" })
    doc = insertNode(doc, doc.root, label)
    const prop = createProp({ name: "label", type: "text", defaultValue: "Click me" })
    doc = addProp(doc, prop)
    doc = bindField(doc, label.id, "content", prop.id)

    const next = removeProp(doc, prop.id)

    // A dangling binding would emit a reference to a prop that no longer exists.
    expect((next.nodes[label.id] as { content: unknown }).content).toBe("Click me")
    expect(next.props).toHaveLength(0)
    expect(validate(next)).toEqual([])
  })

  it("drops variants selected by a deleted prop", () => {
    let doc = createDoc()
    const prop = createProp({ name: "tone", type: "enum", options: ["primary", "ghost"] })
    doc = addProp(doc, prop)
    doc = addVariant(doc, createVariant("Ghost", { kind: "prop", propId: prop.id, value: "ghost" }))

    const next = removeProp(doc, prop.id)

    expect(next.variants).toHaveLength(0)
    expect(validate(next)).toEqual([])
  })
})

describe("states and variants", () => {
  it("drops variants designed for a deleted state", () => {
    let doc = createDoc()
    const state = createState("Hover", "hover")
    doc = addState(doc, state)
    doc = addVariant(doc, createVariant("Hover", { kind: "state", stateId: state.id }))

    expect(removeState(doc, state.id).variants).toHaveLength(0)
  })

  it("merges successive overrides on the same node", () => {
    let doc = createDoc()
    const variant = createVariant("Hover", { kind: "state", stateId: "s1" })
    doc = addVariant(doc, variant)

    doc = setOverride(doc, variant.id, doc.root, { style: { fill: "#ff0000" } })
    doc = setOverride(doc, variant.id, doc.root, { style: { opacity: 0.5 } })

    const override = doc.variants[0].overrides[doc.root]
    // The second edit must not discard the first — that is what makes a variant
    // accumulate a design rather than hold only the last thing you touched.
    expect(override.style).toEqual({ fill: "#ff0000", opacity: 0.5 })
  })

  it("removes overrides for nodes that are deleted", () => {
    let doc = createDoc()
    const leaf = createText({ name: "Leaf" })
    doc = insertNode(doc, doc.root, leaf)
    const variant = createVariant("Hover", { kind: "state", stateId: "s1" })
    doc = addVariant(doc, variant)
    doc = setOverride(doc, variant.id, leaf.id, { hidden: true })

    const next = removeNode(doc, leaf.id)

    expect(next.variants[0].overrides[leaf.id]).toBeUndefined()
  })
})
