/**
 * The fixture the golden-file and compile tests are built on: a button with a
 * bound label, a tone enum, a disabled flag, a tap handler, a hover state and a
 * pressed state. It exercises every codegen path the slice supports.
 *
 * Ids are assigned explicitly rather than generated so golden files stay
 * byte-stable across runs.
 */

import {
  corners,
  createFrame,
  createProp,
  createState,
  createText,
  createVariant,
  fixed,
  hug,
  padding,
} from "@/model/defaults"
import { addProp, addState, addVariant, bindField, insertNode, setOverride } from "@/model/ops"
import type { ComponentDoc } from "@/model/types"
import { DOC_VERSION } from "@/model/types"

export interface ButtonFixture {
  doc: ComponentDoc
  ids: {
    root: string
    label: string
    label2: string
    labelProp: string
    toneProp: string
    disabledProp: string
    tapProp: string
    hoverVariant: string
    pressedVariant: string
    ghostVariant: string
    disabledVariant: string
  }
}

export function buttonFixture(): ButtonFixture {
  const root = createFrame({
    id: "n_root",
    name: "Button",
    size: { width: hug(), height: hug() },
    style: { fill: "#3b5bfd", corners: corners(8) },
    layout: {
      mode: "stack",
      direction: "row",
      gap: 8,
      padding: padding(10, 18),
      align: "center",
      justify: "center",
      wrap: false,
    },
    children: [],
  })

  const label = createText({
    id: "n_label",
    name: "Label",
    content: "Click me",
    style: {
      text: {
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 15,
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: 0,
        textAlign: "center",
        color: "#ffffff",
      },
    },
  })

  let doc: ComponentDoc = {
    id: "doc_button",
    name: "Primary Button",
    version: DOC_VERSION,
    description: "A button with tone and disabled states.",
    props: [],
    states: [],
    nodes: { [root.id]: root },
    root: root.id,
    variants: [],
  }

  doc = insertNode(doc, root.id, label)

  // A second, hidden layer that only the hover variant reveals — proves that
  // visibility rides the same override machinery as any other property.
  const label2 = createText({
    id: "n_arrow",
    name: "Arrow",
    content: "→",
    hidden: true,
    size: { width: fixed(12), height: hug() },
  })
  doc = insertNode(doc, root.id, label2)

  const labelProp = createProp({
    id: "p_label",
    name: "label",
    type: "text",
    defaultValue: "Click me",
    description: "The button's caption.",
  })
  const toneProp = createProp({
    id: "p_tone",
    name: "tone",
    type: "enum",
    options: ["primary", "ghost"],
    defaultValue: "primary",
  })
  const disabledProp = createProp({
    id: "p_disabled",
    name: "disabled",
    type: "boolean",
    defaultValue: false,
  })
  const tapProp = createProp({ id: "p_tap", name: "onTap", type: "event", defaultValue: null })

  doc = addProp(doc, labelProp)
  doc = addProp(doc, toneProp)
  doc = addProp(doc, disabledProp)
  doc = addProp(doc, tapProp)

  doc = bindField(doc, label.id, "content", labelProp.id)
  doc = {
    ...doc,
    nodes: { ...doc.nodes, [root.id]: { ...(doc.nodes[root.id] as typeof root), onTapPropId: tapProp.id } },
  }

  const hover = createState("Hover", "hover")
  const pressed = createState("Pressed", "tap")
  const disabledState = createState("Disabled", "disabled", disabledProp.id)
  doc = addState(doc, { ...hover, id: "s_hover" })
  doc = addState(doc, { ...pressed, id: "s_press" })
  doc = addState(doc, { ...disabledState, id: "s_disabled" })

  const hoverVariant = { ...createVariant("Hover", { kind: "state", stateId: "s_hover" }), id: "v_hover" }
  const pressedVariant = { ...createVariant("Pressed", { kind: "state", stateId: "s_press" }), id: "v_press" }
  const ghostVariant = {
    ...createVariant("Ghost", { kind: "prop", propId: toneProp.id, value: "ghost" }),
    id: "v_ghost",
  }
  const disabledVariant = {
    ...createVariant("Disabled", { kind: "state", stateId: "s_disabled" }),
    id: "v_disabled",
  }

  doc = addVariant(doc, hoverVariant)
  doc = addVariant(doc, pressedVariant)
  doc = addVariant(doc, ghostVariant)
  doc = addVariant(doc, disabledVariant)

  doc = setOverride(doc, hoverVariant.id, root.id, { style: { fill: "#2f4ad0" } })
  doc = setOverride(doc, hoverVariant.id, label2.id, { hidden: false })
  doc = setOverride(doc, pressedVariant.id, root.id, { style: { scale: 0.97 } })
  doc = setOverride(doc, ghostVariant.id, root.id, {
    style: { fill: "#ffffff", border: { width: 1, color: "#3b5bfd", style: "solid" } },
  })
  doc = setOverride(doc, ghostVariant.id, label.id, {
    style: { text: { color: "#3b5bfd" } as never },
  })
  doc = setOverride(doc, disabledVariant.id, root.id, { style: { opacity: 0.4 } })

  return {
    doc,
    ids: {
      root: root.id,
      label: label.id,
      label2: label2.id,
      labelProp: labelProp.id,
      toneProp: toneProp.id,
      disabledProp: disabledProp.id,
      tapProp: tapProp.id,
      hoverVariant: hoverVariant.id,
      pressedVariant: pressedVariant.id,
      ghostVariant: ghostVariant.id,
      disabledVariant: disabledVariant.id,
    },
  }
}
