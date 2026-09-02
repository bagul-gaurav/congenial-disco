/**
 * Prop definitions → Framer property controls.
 *
 * This is the half of the export that makes the component *editable* in Framer
 * rather than just present on the canvas. Only props the user explicitly marked
 * as exposed get a control, which is why the generated control list stays
 * readable instead of listing every text layer in the design.
 */

import type { PropDef, PropType } from "@/model/types"

/** Framer's ControlType member for each of our prop types. */
const CONTROL_TYPE: Record<PropType, string> = {
  text: "String",
  number: "Number",
  boolean: "Boolean",
  enum: "Enum",
  color: "Color",
  image: "Image",
  link: "Link",
  event: "EventHandler",
}

function literal(value: unknown): string {
  return JSON.stringify(value ?? null)
}

/**
 * `"onTap"` → `"On Tap"`. Prop names are identifiers because they become
 * destructured bindings; the control title is what a designer reads in Framer's
 * right-hand panel, so it gets spaced and capitalised.
 */
function humanTitle(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** One `{ type: ControlType.X, ... }` entry. */
export function controlFor(prop: PropDef): string {
  const parts: string[] = [`type: ControlType.${CONTROL_TYPE[prop.type]}`]

  if (prop.description) parts.push(`description: ${literal(prop.description)}`)

  parts.push(`title: ${literal(humanTitle(prop.name))}`)

  // Event handlers carry no value, so a default would be meaningless.
  if (prop.type !== "event") parts.push(`defaultValue: ${literal(prop.defaultValue)}`)

  if (prop.type === "enum") {
    const options = prop.options ?? []
    parts.push(`options: ${literal(options)}`)
    // Without optionTitles Framer shows the raw values, which are often
    // lowercase slugs; titling them keeps the right-hand panel readable.
    parts.push(
      `optionTitles: ${literal(options.map((o) => o.charAt(0).toUpperCase() + o.slice(1)))}`,
    )
  }

  return `{ ${parts.join(", ")} }`
}

/** The full `addPropertyControls(...)` call, or "" when nothing is exposed. */
export function emitPropertyControls(componentName: string, props: PropDef[]): string {
  const exposed = props.filter((p) => p.exposed)
  if (exposed.length === 0) return ""

  const entries = exposed
    .map((prop) => `    ${prop.name}: ${controlFor(prop)},`)
    .join("\n")

  return `addPropertyControls(${componentName}, {\n${entries}\n})`
}
