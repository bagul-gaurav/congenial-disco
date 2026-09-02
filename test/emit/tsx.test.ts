import { describe, expect, it } from "vitest"

import { createDoc, createProp, createText } from "@/model/defaults"
import { addProp, bindField, insertNode } from "@/model/ops"
import { emitComponent } from "@/emit/tsx"

import { buttonFixture } from "../fixtures/button"

describe("emitComponent", () => {
  it("produces a stable golden file for the button fixture", async () => {
    const { code } = emitComponent(buttonFixture().doc)
    // Reviewed by eye once; from here on any codegen change shows up as a diff.
    await expect(code).toMatchFileSnapshot("./__snapshots__/Button.tsx.snap")
  })

  it("names the component from the document name", () => {
    const { componentName, code } = emitComponent(buttonFixture().doc)

    expect(componentName).toBe("PrimaryButton")
    expect(code).toContain("export default function PrimaryButton(props: Props)")
  })

  it("imports only modules Framer can resolve", () => {
    const { code } = emitComponent(buttonFixture().doc)
    const imports = [...code.matchAll(/from "([^"]+)"/g)].map((m) => m[1])

    expect(new Set(imports)).toEqual(new Set(["react", "framer", "framer-motion"]))
  })

  it("emits property controls for exposed props only", () => {
    let { doc } = buttonFixture()
    doc = { ...doc, props: doc.props.map((p) => (p.name === "tone" ? { ...p, exposed: false } : p)) }

    const { code } = emitComponent(doc)

    expect(code).toContain("label: { type: ControlType.String")
    expect(code).not.toMatch(/^\s+tone: \{ type: ControlType\.Enum/m)
  })

  it("turns an enum prop into an Enum control with titled options", () => {
    const { code } = emitComponent(buttonFixture().doc)

    expect(code).toContain(`options: ["primary","ghost"]`)
    expect(code).toContain(`optionTitles: ["Primary","Ghost"]`)
  })

  it("emits hover and press states as motion props, not as manual props", () => {
    const { code } = emitComponent(buttonFixture().doc)

    expect(code).toContain(`whileHover={disabled ? undefined : "hover"}`)
    expect(code).toContain(`whileTap={disabled ? undefined : "pressed"}`)
    // The whole point of the "real runtime behavior" choice: hover must not
    // appear as something a designer flips in the property panel.
    expect(code).not.toMatch(/hover: \{ type: ControlType/)
  })

  it("drives nested state deltas from the root, not from the layer itself", () => {
    const { code } = emitComponent(buttonFixture().doc)

    // The arrow is display:none until hover reveals it, so it can never be
    // hovered itself. It must declare a labelled variant and let the root's
    // hover propagate down; a `whileHover` on the arrow would never fire.
    expect(code).toContain("variants={arrowMotion}")
    expect(code).not.toMatch(/<motion\.p[\s\S]*?whileHover/)

    const root = code.slice(code.indexOf("<motion.div"))
    expect(root).toContain(`initial="rest"`)
  })

  it("gives every animated property a resting value to return to", () => {
    const { code } = emitComponent(buttonFixture().doc)

    // Without a `rest` entry naming each animated property, framer-motion has
    // nothing to animate back to and the layer sticks on the hover value.
    expect(code).toContain(`display: arrowStyle.display ?? "none",`)
    // `scale` is absent from the base style, so a resting value is synthesised.
    expect(code).toContain("scale: rootStyle.scale ?? 1,")
  })

  it("rests on the composed style, not the base style", () => {
    const { code } = emitComponent(buttonFixture().doc)

    // Reading the base here would make a ghost button animate back to the
    // primary fill on pointer-out — a resting value it is not wearing.
    expect(code).toContain(`backgroundColor: rootStyle.backgroundColor ?? "#3b5bfd",`)
    expect(code).toMatch(/const rootStyle: React\.CSSProperties = \{\s*\n\s*\.\.\.rootBase,/)
  })

  it("emits a prop-driven variant as a conditional style spread", () => {
    const { code } = emitComponent(buttonFixture().doc)

    expect(code).toContain(`...(tone === "ghost" ? rootGhost : null)`)
  })

  it("emits a disabled state as a conditional style rather than an animation", () => {
    const { code } = emitComponent(buttonFixture().doc)

    expect(code).toContain("...(disabled ? rootDisabled : null)")
    expect(code).not.toContain("whileDisabled")
  })

  it("spreads Framer's style prop onto the root so the canvas can resize it", () => {
    const { code } = emitComponent(buttonFixture().doc)

    expect(code).toContain("...style,")
    expect(code).toContain("@framerSupportedLayoutWidth auto")
  })

  it("renders a bound text layer as an expression and a literal as text", () => {
    const { code } = emitComponent(buttonFixture().doc)

    expect(code).toMatch(/<p\b[\s\S]*?>\s*\{label\}/)
    expect(code).toContain("→")
  })

  it("omits a layer hidden in the base that no variant reveals", () => {
    let doc = createDoc("Card")
    const ghostLayer = createText({ id: "n_ghost", name: "Never", hidden: true })
    doc = insertNode(doc, doc.root, ghostLayer)

    const { code } = emitComponent(doc)

    expect(code).not.toContain("neverStyle")
  })

  it("keeps a hidden layer that a variant reveals, toggling display", () => {
    const { code } = emitComponent(buttonFixture().doc)

    expect(code).toContain("arrowStyle")
    expect(code).toContain(`display: "none"`)
    expect(code).toContain(`display: "block"`)
  })

  it("does not import framer-motion when nothing animates", () => {
    let doc = createDoc("Static")
    const prop = createProp({ id: "p_t", name: "title", type: "text", defaultValue: "Hi" })
    doc = addProp(doc, prop)
    const text = createText({ id: "n_t", name: "Title" })
    doc = insertNode(doc, doc.root, text)
    doc = bindField(doc, text.id, "content", prop.id)

    const { code } = emitComponent(doc)

    expect(code).not.toContain("framer-motion")
    expect(code).not.toContain("motion.")
  })

  it("escapes text that would otherwise break JSX", () => {
    let doc = createDoc("Tricky")
    doc = insertNode(doc, doc.root, createText({ id: "n_x", name: "X", content: "a < b && {c}" }))

    const { code } = emitComponent(doc)

    expect(code).toContain(JSON.stringify("a < b && {c}"))
  })

  it("sanitises a document name that is not a valid identifier", () => {
    const doc = { ...buttonFixture().doc, name: "2 cool buttons!" }

    expect(emitComponent(doc).componentName).toBe("_2CoolButtons")
  })
})
