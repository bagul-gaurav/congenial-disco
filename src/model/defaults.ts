/**
 * Factory helpers producing well-formed model values.
 *
 * Every node the editor creates goes through here, so "what does a new frame
 * look like" has exactly one answer and tests can build fixtures cheaply.
 */

import {
  DOC_VERSION,
  type Bindable,
  type ComponentDoc,
  type Corners,
  type FrameNode,
  type ImageNode,
  type Node,
  type NodeId,
  type Padding,
  type PropDef,
  type PropType,
  type PropValue,
  type ShapeNode,
  type Size,
  type StateDef,
  type StateTrigger,
  type Token,
  type TokenType,
  type TextNode,
  type TextStyle,
  type Variant,
  type VariantSelector,
} from "./types"

let counter = 0

/**
 * Monotonic, collision-free within a session. Ids only need to be stable
 * within a document, and documents are edited by one client at a time in the
 * current slice; the random suffix keeps ids distinct across reloads so that
 * merging two documents never silently aliases nodes.
 */
export function newId(prefix: string): string {
  counter += 1
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${counter.toString(36)}${rand}`
}

/** Reset the id counter. Test-only — keeps golden files deterministic. */
export function __resetIdCounter(): void {
  counter = 0
}

export function padding(all: Bindable<number>): Padding
export function padding(vertical: Bindable<number>, horizontal: Bindable<number>): Padding
export function padding(a: Bindable<number>, b?: Bindable<number>): Padding {
  const v = a
  const h = b ?? a
  return { top: v, right: h, bottom: v, left: h }
}

export function corners(all: Bindable<number>): Corners {
  return { topLeft: all, topRight: all, bottomRight: all, bottomLeft: all }
}

export const defaultTextStyle = (): TextStyle => ({
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 16,
  fontWeight: 400,
  lineHeight: 1.4,
  letterSpacing: 0,
  textAlign: "left",
  color: "#111111",
})

export const fixed = (value: number): Size["width"] => ({ mode: "fixed", value })
export const fill = (): Size["width"] => ({ mode: "fill" })
export const hug = (): Size["width"] => ({ mode: "hug" })

export function createFrame(overrides: Partial<FrameNode> = {}): FrameNode {
  return {
    id: overrides.id ?? newId("n"),
    type: "frame",
    name: "Frame",
    position: { x: 0, y: 0 },
    size: { width: hug(), height: hug() },
    style: { fill: "#ffffff", corners: corners(0) },
    layout: {
      mode: "stack",
      direction: "row",
      gap: 8,
      padding: padding(12, 16),
      align: "center",
      justify: "start",
      wrap: false,
    },
    children: [],
    ...overrides,
  }
}

export function createText(overrides: Partial<TextNode> = {}): TextNode {
  return {
    id: overrides.id ?? newId("n"),
    type: "text",
    name: "Text",
    position: { x: 0, y: 0 },
    size: { width: hug(), height: hug() },
    style: { text: defaultTextStyle() },
    content: "Text",
    ...overrides,
  }
}

export function createShape(overrides: Partial<ShapeNode> = {}): ShapeNode {
  return {
    id: overrides.id ?? newId("n"),
    type: "shape",
    name: "Rectangle",
    kind: "rect",
    position: { x: 0, y: 0 },
    size: { width: fixed(100), height: fixed(100) },
    style: { fill: "#d4d4d8", corners: corners(4) },
    ...overrides,
  }
}

export function createImage(overrides: Partial<ImageNode> = {}): ImageNode {
  return {
    id: overrides.id ?? newId("n"),
    type: "image",
    name: "Image",
    position: { x: 0, y: 0 },
    size: { width: fixed(120), height: fixed(120) },
    style: { corners: corners(0) },
    src: "",
    fit: "cover",
    ...overrides,
  }
}

/** Sensible default value for a prop of the given type. */
export function defaultValueFor(type: PropType, options?: string[]): PropValue {
  switch (type) {
    case "text":
      return "Label"
    case "number":
      return 0
    case "boolean":
      return false
    case "enum":
      return options?.[0] ?? ""
    case "color":
      return "#000000"
    case "image":
      return ""
    case "link":
      return ""
    case "event":
      return null
  }
}

export function createProp(overrides: Partial<PropDef> & { name: string; type: PropType }): PropDef {
  return {
    id: overrides.id ?? newId("p"),
    exposed: true,
    defaultValue: overrides.defaultValue ?? defaultValueFor(overrides.type, overrides.options),
    ...overrides,
  }
}

export function createToken(
  name: string,
  type: TokenType,
  value: string | number,
  description?: string,
): Token {
  return { id: newId("t"), name, type, value, description }
}

/**
 * A starter set, offered rather than imposed.
 *
 * A design tool with an empty token list does not teach you what tokens are
 * for, but a set you did not ask for is noise in a component that needs two
 * colours. So new documents start empty and this is one click away.
 */
export function starterTokens(): Token[] {
  return [
    createToken("Primary", "color", "#3b5bfd"),
    createToken("Surface", "color", "#ffffff"),
    createToken("Text", "color", "#111111"),
    createToken("Muted", "color", "#71717a"),

    createToken("Space 1", "space", 4),
    createToken("Space 2", "space", 8),
    createToken("Space 3", "space", 12),
    createToken("Space 4", "space", 16),
    createToken("Space 5", "space", 24),

    createToken("Radius sm", "radius", 4),
    createToken("Radius md", "radius", 8),
    createToken("Radius lg", "radius", 16),

    createToken("Body", "fontSize", 16),
    createToken("Heading", "fontSize", 24),

    createToken("Sans", "fontFamily", "Inter, system-ui, sans-serif"),
  ]
}

export function createState(name: string, trigger: StateTrigger, propId?: string): StateDef {
  return { id: newId("s"), name, trigger, propId }
}

export function createVariant(name: string, selector: VariantSelector): Variant {
  return { id: newId("v"), name, selector, overrides: {} }
}

/**
 * A new document: one root frame holding one text layer. Starting from an
 * empty canvas makes the first minute of the tool worse, not better.
 */
export function createDoc(name = "Component"): ComponentDoc {
  const text = createText({ name: "Label", content: "Label" })
  const root = createFrame({
    name: "Root",
    children: [text.id],
    style: { fill: "#f4f4f5", corners: corners(8) },
  })

  const nodes: Record<NodeId, Node> = { [root.id]: root, [text.id]: text }

  return {
    id: newId("doc"),
    name,
    version: DOC_VERSION,
    description: "",
    props: [],
    states: [],
    tokens: [],
    nodes,
    root: root.id,
    variants: [],
  }
}
