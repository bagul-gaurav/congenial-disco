/**
 * Node → CSS.
 *
 * Shared by both emitters. The live preview renders these objects directly; the
 * .tsx exporter serialises the same objects into source. Because there is one
 * implementation, a style that looks right on the canvas is the style that ends
 * up in Framer — fidelity is structural, not something to keep in sync.
 *
 * Bound values survive as `{ __bind: propId }` sentinels. Each emitter decides
 * what a binding means: the preview substitutes the current prop value, the
 * exporter writes the prop's identifier as an expression.
 */

import { isBinding } from "@/model/types"
import type {
  Bindable,
  Corners,
  FrameNode,
  Layout,
  Node,
  NodeStyle,
  PropId,
  Size,
  SizeValue,
  StackAlign,
  StackJustify,
} from "@/model/types"

/** A value that is only known once props are supplied. */
export interface BindRef {
  __bind: PropId
}

export type StyleValue = string | number | BindRef
export type CSSObject = Record<string, StyleValue>

export function isBindRef(value: unknown): value is BindRef {
  return typeof value === "object" && value !== null && "__bind" in value
}

function bindable<T extends string | number>(value: Bindable<T> | undefined): StyleValue | undefined {
  if (value === undefined) return undefined
  return isBinding(value) ? { __bind: value.bind } : value
}

// ---------------------------------------------------------------------------
// Sizing
// ---------------------------------------------------------------------------

const ALIGN: Record<StackAlign, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
}

const JUSTIFY: Record<StackJustify, string> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
}

/**
 * How a size behaves depends on the parent's layout: "fill" means grow along
 * the parent's main axis but stretch across its cross axis, and means 100% when
 * there is no stack parent at all.
 */
function sizeStyles(size: Size, parent: FrameNode | null): CSSObject {
  const out: CSSObject = {}
  const stack = parent && parent.layout.mode === "stack" ? parent.layout : null
  const mainAxis: "width" | "height" = stack?.direction === "column" ? "height" : "width"

  const apply = (axis: "width" | "height", value: SizeValue) => {
    if (value.mode === "fixed") {
      out[axis] = value.value
      return
    }
    if (value.mode === "hug") {
      // A stack that hugs must not be squashed by a sibling that fills.
      out[axis] = "fit-content"
      if (stack && axis === mainAxis) out.flexShrink = 0
      return
    }
    // fill
    if (!stack) {
      out[axis] = "100%"
      return
    }
    if (axis === mainAxis) {
      out.flexGrow = 1
      out.flexBasis = 0
      out[axis] = "auto"
    } else {
      out.alignSelf = "stretch"
      out[axis] = "auto"
    }
  }

  apply("width", size.width)
  apply("height", size.height)
  return out
}

// ---------------------------------------------------------------------------
// Decoration
// ---------------------------------------------------------------------------

function cornerRadius(corners: Corners): string | number {
  const { topLeft, topRight, bottomRight, bottomLeft } = corners
  if (topLeft === topRight && topRight === bottomRight && bottomRight === bottomLeft) {
    return topLeft
  }
  return `${topLeft}px ${topRight}px ${bottomRight}px ${bottomLeft}px`
}

function decorationStyles(style: NodeStyle): CSSObject {
  const out: CSSObject = {}

  const fill = bindable(style.fill)
  if (fill !== undefined) out.backgroundColor = fill

  if (style.opacity !== undefined && style.opacity !== 1) out.opacity = style.opacity
  if (style.corners) {
    const radius = cornerRadius(style.corners)
    if (radius !== 0) out.borderRadius = radius
  }
  if (style.border && style.border.width > 0) {
    out.border = `${style.border.width}px ${style.border.style} ${style.border.color}`
  }
  if (style.shadows && style.shadows.length > 0) {
    out.boxShadow = style.shadows
      .map((s) => `${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`)
      .join(", ")
  }
  if (style.scale !== undefined && style.scale !== 1) out.scale = style.scale

  return out
}

function textStyles(style: NodeStyle): CSSObject {
  const text = style.text
  if (!text) return {}

  const out: CSSObject = {
    fontFamily: text.fontFamily,
    fontSize: text.fontSize,
    fontWeight: text.fontWeight,
    lineHeight: text.lineHeight,
    textAlign: text.textAlign,
  }
  if (text.letterSpacing !== 0) out.letterSpacing = `${text.letterSpacing}px`

  const color = bindable(text.color)
  if (color !== undefined) out.color = color

  return out
}

function layoutStyles(layout: Layout): CSSObject {
  const { padding } = layout
  const out: CSSObject = {}

  if (padding.top || padding.right || padding.bottom || padding.left) {
    out.padding = `${padding.top}px ${padding.right}px ${padding.bottom}px ${padding.left}px`
  }

  if (layout.mode === "absolute") {
    // Children of an absolute frame are positioned against it.
    out.position = "relative"
    return out
  }

  out.display = "flex"
  out.flexDirection = layout.direction
  out.alignItems = ALIGN[layout.align]
  out.justifyContent = JUSTIFY[layout.justify]
  if (layout.gap !== 0) out.gap = layout.gap
  if (layout.wrap) out.flexWrap = "wrap"

  return out
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StyleContext {
  /** The node's parent, or null for the root. Decides how "fill" behaves. */
  parent: FrameNode | null
}

/** The complete style object for one node. */
export function styleFor(node: Node, ctx: StyleContext): CSSObject {
  const out: CSSObject = {}

  // A node inside an absolute frame is placed by its own coordinates.
  if (ctx.parent && ctx.parent.layout.mode === "absolute") {
    out.position = "absolute"
    out.left = node.position.x
    out.top = node.position.y
  }

  Object.assign(out, sizeStyles(node.size, ctx.parent))

  if (node.type === "frame") Object.assign(out, layoutStyles(node.layout))
  Object.assign(out, decorationStyles(node.style))
  Object.assign(out, textStyles(node.style))

  if (node.type === "shape" && node.kind === "ellipse") out.borderRadius = "50%"
  if (node.type === "text") {
    // Text layers wrap on explicit newlines rather than collapsing them.
    out.whiteSpace = "pre-wrap"
    out.margin = 0
  }
  if (node.type === "image") out.objectFit = node.fit

  // Visibility is expressed as CSS so that a variant can reveal a hidden layer
  // through the same override machinery as any other property. `display` is
  // always written explicitly, never left implicit: a variant that reveals a
  // layer has to name the value it reveals it *to*, and the preview and the
  // exporter must arrive at the same one.
  out.display = node.hidden ? "none" : naturalDisplay(node)

  return out
}

/** The `display` a node has when it is visible. */
export function naturalDisplay(node: Node): string {
  return node.type === "frame" && node.layout.mode === "stack" ? "flex" : "block"
}

/**
 * The style delta a variant applies to a node, as CSS.
 *
 * Only the properties the variant actually overrides are returned, so the
 * exporter can emit `whileHover={{ backgroundColor: ... }}` rather than a full
 * copy of the base style.
 */
export function variantStyleFor(
  node: Node,
  override: {
    style?: NodeStyle
    size?: Partial<Size>
    layout?: Partial<Extract<Layout, { mode: "stack" }>>
    hidden?: boolean
  },
  ctx: StyleContext,
): CSSObject {
  const out: CSSObject = {}

  if (override.hidden !== undefined) {
    out.display = override.hidden ? "none" : naturalDisplay(node)
  }

  if (override.style) {
    Object.assign(out, decorationStyles(override.style))
    // Only emit text properties the override actually names.
    if (override.style.text) {
      const full = textStyles(override.style)
      for (const key of Object.keys(override.style.text)) {
        const cssKey = key === "letterSpacing" ? "letterSpacing" : key
        if (cssKey in full) out[cssKey] = full[cssKey]
      }
    }
  }

  if (override.size) {
    const merged: Size = { ...node.size, ...override.size }
    const sized = sizeStyles(merged, ctx.parent)
    for (const axis of ["width", "height"] as const) {
      if (override.size[axis] && sized[axis] !== undefined) out[axis] = sized[axis]
    }
  }

  if (override.layout && node.type === "frame" && node.layout.mode === "stack") {
    const merged = { ...node.layout, ...override.layout }
    const styles = layoutStyles(merged)
    for (const key of Object.keys(override.layout)) {
      const cssKey =
        key === "direction" ? "flexDirection" : key === "align" ? "alignItems" : key === "justify" ? "justifyContent" : key
      if (styles[cssKey] !== undefined) out[cssKey] = styles[cssKey]
    }
  }

  return out
}

/** Every prop id referenced by a style object. */
export function bindingsIn(style: CSSObject): PropId[] {
  return Object.values(style)
    .filter(isBindRef)
    .map((ref) => ref.__bind)
}
