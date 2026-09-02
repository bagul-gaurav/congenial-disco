/**
 * Seeds a demo component so there is something real to open, edit and export
 * on a fresh database — a button with a bound label, a tone enum, a disabled
 * flag, a tap handler, and hover/press states already designed.
 *
 * Relative imports rather than the `@/` alias: this runs under tsx, outside
 * Next.js's module resolution.
 */

import { PrismaClient } from "@prisma/client"

import {
  corners,
  createFrame,
  createProp,
  createState,
  createText,
  createVariant,
  hug,
  padding,
} from "../src/model/defaults"
import {
  addProp,
  addState,
  addVariant,
  bindField,
  insertNode,
  setOverride,
  validate,
} from "../src/model/ops"
import { DOC_VERSION, type ComponentDoc } from "../src/model/types"

const prisma = new PrismaClient()

function demoButton(): ComponentDoc {
  const root = createFrame({
    id: "n_root",
    name: "Button",
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
    size: { width: hug(), height: hug() },
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
    id: "doc_demo",
    name: "Primary Button",
    version: DOC_VERSION,
    description: "A button with a tone, a disabled flag and real hover feedback.",
    props: [],
    states: [],
    tokens: [],
    nodes: { [root.id]: root },
    root: root.id,
    variants: [],
  }

  doc = insertNode(doc, root.id, label)

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
    nodes: {
      ...doc.nodes,
      [root.id]: { ...(doc.nodes[root.id] as typeof root), onTapPropId: tapProp.id },
    },
  }

  doc = addState(doc, { ...createState("Hover", "hover"), id: "s_hover" })
  doc = addState(doc, { ...createState("Pressed", "tap"), id: "s_press" })
  doc = addState(doc, {
    ...createState("Disabled", "disabled", disabledProp.id),
    id: "s_disabled",
  })

  const hover = { ...createVariant("Hover", { kind: "state", stateId: "s_hover" }), id: "v_hover" }
  const pressed = { ...createVariant("Pressed", { kind: "state", stateId: "s_press" }), id: "v_press" }
  const ghost = {
    ...createVariant("Ghost", { kind: "prop", propId: toneProp.id, value: "ghost" }),
    id: "v_ghost",
  }
  const off = {
    ...createVariant("Disabled", { kind: "state", stateId: "s_disabled" }),
    id: "v_disabled",
  }

  for (const variant of [hover, pressed, ghost, off]) doc = addVariant(doc, variant)

  doc = setOverride(doc, hover.id, root.id, { style: { fill: "#2f4ad0" } })
  doc = setOverride(doc, pressed.id, root.id, { style: { scale: 0.97 } })
  doc = setOverride(doc, ghost.id, root.id, {
    style: { fill: "#ffffff", border: { width: 1, color: "#3b5bfd", style: "solid" } },
  })
  doc = setOverride(doc, ghost.id, label.id, {
    style: { text: { color: "#3b5bfd" } as never },
  })
  doc = setOverride(doc, off.id, root.id, { style: { opacity: 0.4 } })

  return doc
}

async function main() {
  const email = process.env.DEV_USER_EMAIL ?? "you@localhost"
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "You" },
  })

  const project =
    (await prisma.project.findFirst({ where: { userId: user.id } })) ??
    (await prisma.project.create({ data: { name: "My components", userId: user.id } }))

  const doc = demoButton()

  const issues = validate(doc)
  if (issues.length > 0) {
    throw new Error(`Demo document is invalid:\n${issues.map((i) => i.message).join("\n")}`)
  }

  const existing = await prisma.component.findFirst({
    where: { projectId: project.id, name: doc.name },
  })

  const component = existing
    ? await prisma.component.update({
        where: { id: existing.id },
        data: { doc: doc as never, docVersion: doc.version },
      })
    : await prisma.component.create({
        data: {
          name: doc.name,
          projectId: project.id,
          doc: doc as never,
          docVersion: doc.version,
        },
      })

  console.log(`Seeded "${component.name}"  ->  http://localhost:3000/c/${component.id}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
