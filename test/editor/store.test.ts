import { beforeEach, describe, expect, it } from "vitest"

import { useEditor } from "@/editor/store"
import { createDoc, createState, createVariant } from "@/model/defaults"
import { addState, addVariant } from "@/model/ops"

function reset() {
  const doc = createDoc("Test")
  useEditor.setState({
    doc,
    past: [],
    future: [],
    selection: [],
    activeVariantId: null,
    forcedStates: [],
    dirty: false,
  })
  return doc
}

describe("editor store", () => {
  beforeEach(reset)

  it("records an edit on the base design when no variant is active", () => {
    const { doc, edit } = useEditor.getState()
    edit(doc.root, { style: { fill: "#ff0000" } })

    const next = useEditor.getState().doc
    expect(next.nodes[doc.root].style.fill).toBe("#ff0000")
    expect(next.variants).toHaveLength(0)
  })

  it("records an edit as an override when a variant is active", () => {
    const doc = reset()
    const state = createState("Hover", "hover")
    const variant = createVariant("Hover", { kind: "state", stateId: state.id })

    useEditor.getState().apply((d) => addVariant(addState(d, state), variant))
    useEditor.getState().setActiveVariant(variant.id)
    useEditor.getState().edit(doc.root, { style: { fill: "#00ff00" } })

    const next = useEditor.getState().doc
    // This is the rule the whole variant model rests on: editing while a
    // variant is selected must never rewrite the base design.
    expect(next.nodes[doc.root].style.fill).toBe("#f4f4f5")
    expect(next.variants[0].overrides[doc.root].style?.fill).toBe("#00ff00")
  })

  it("undoes and redoes an edit", () => {
    const doc = reset()
    const original = doc.nodes[doc.root].style.fill

    useEditor.getState().edit(doc.root, { style: { fill: "#123456" } })
    useEditor.getState().undo()
    expect(useEditor.getState().doc.nodes[doc.root].style.fill).toBe(original)

    useEditor.getState().redo()
    expect(useEditor.getState().doc.nodes[doc.root].style.fill).toBe("#123456")
  })

  it("does not consume an undo step for a no-op", () => {
    // `apply` returning the same document means nothing changed; spending a
    // history entry on it would make undo feel broken.
    useEditor.getState().apply((doc) => doc)
    expect(useEditor.getState().past).toHaveLength(0)
    expect(useEditor.getState().dirty).toBe(false)
  })

  it("drops selection of nodes that no longer exist after undo", () => {
    const doc = reset()
    useEditor.getState().select([doc.root, "gone"])
    useEditor.getState().edit(doc.root, { style: { fill: "#abcdef" } })
    useEditor.getState().undo()

    expect(useEditor.getState().selection).toEqual([doc.root])
  })

  it("clears history when a document is loaded", () => {
    const doc = reset()
    useEditor.getState().edit(doc.root, { style: { fill: "#111111" } })
    useEditor.getState().replaceDoc(createDoc("Other"), { resetHistory: true })

    // Otherwise undo would walk back into a different component's history.
    expect(useEditor.getState().past).toHaveLength(0)
    expect(useEditor.getState().dirty).toBe(false)
  })

  it("clears an active variant that the loaded document does not have", () => {
    useEditor.setState({ activeVariantId: "v_missing" })
    useEditor.getState().replaceDoc(createDoc("Other"))

    expect(useEditor.getState().activeVariantId).toBeNull()
  })
})
