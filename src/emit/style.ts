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

import { isBinding, isTokenRef } from "@/model/types"
import type {
  Bindable,
  Corners,
  FrameNode,
  Layout,
  Node,
  NodeId,
  NodeStyle,
  PropId,
  Size,
  SizeValue,
  StackAlign,
  StackJustify,
  TokenId,
} from "@/model/types"

/** A value that is only known once props are supplied. */
export interface BindRef {
  __bind: PropId
}

/** A value that comes from a design token. */
export interface TokenValueRef {
  __token: TokenId
}

export type StyleValue = string | number | BindRef | TokenValueRef
export type CSSObject = Record<string, StyleValue>

/**
 * `nodeId → parent frame`, built once for a document.
 *
 * `styleFor` needs a node's parent to decide how its size maps to CSS, and the
 * obvious spelling — scan every node looking for one whose children include
 * this id — is a full pass per node, so styling a tree is quadratic in its
 * size. Cheap at eight layers and the first thing to hurt once frames nest.
 */
export function parentIndex(nodes: Record<NodeId, Node>): Record<NodeId, FrameNode> {
  const parents: Record<NodeId, FrameNode> = {}

  for (const node of Object.values(nodes)) {
    if (node.type !== "frame") continue
    for (const childId of node.children) parents[childId] = node
  }

  return parents
}

export function isBindRef(value: unknown): value is BindRef {
  return typeof value === "object" && value !== null && "__bind" in value
}

export function isTokenValueRef(value: unknown): value is TokenValueRef {
  return typeof value === "object" && value !== null && "__token" in value
}

/**
 * Carries references through as sentinels rather than resolving them.
 *
 * Both emitters need the reference itself, not its current value: the preview
 * substitutes live prop values and token values, while the exporter writes a
 * prop identifier or a `tokens.x` lookup into the source.
 */
function bindable<T extends string | number>(value: Bindable<T> | undefined): StyleValue | undefined {
  if (value === undefined) return undefined
  if (isBinding(value)) return { __bind: value.bind }
  if (isTokenRef(value)) return { __token: value.token }
  return value
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

/** True when a value is a prop or token reference rather than a literal. */
function isRef(value: Bindable<string | number> | undefined): boolean {
  return isBinding(value) || isTokenRef(value)
}

/**
 * Composite CSS values are the one place references need care.
 *
 * `padding: "10px 18px"` is a single string built from four values, and a
 * string cannot carry a sentinel — so when any part is a reference the
 * shorthand is replaced by longhand properties, each able to hold its own
 * `tokens.x`. When every part is a literal the shorthand stays, which keeps the
 * common case reading the way a person would write it.
 */
function cornerRadiusStyles(corners: Corners): CSSObject {
  const { topLeft, topRight, bottomRight, bottomLeft } = corners
  const sides = [topLeft, topRight, bottomRight, bottomLeft]

  if (sides.some(isRef)) {
    return {
      borderTopLeftRadius: bindable(topLeft)!,
      borderTopRightRadius: bindable(topRight)!,
      borderBottomRightRadius: bindable(bottomRight)!,
      borderBottomLeftRadius: bindable(bottomLeft)!,
    }
  }

  const [tl, tr, br, bl] = sides as number[]
  if (tl === tr && tr === br && br === bl) return tl === 0 ? {} : { borderRadius: tl }
  return { borderRadius: `${tl}px ${tr}px ${br}px ${bl}px` }
}

function paddingStyles(padding: Layout["padding"]): CSSObject {
  const { top, right, bottom, left } = padding
  const sides = [top, right, bottom, left]

  if (sides.some(isRef)) {
    return {
      paddingTop: bindable(top)!,
      paddingRight: bindable(right)!,
      paddingBottom: bindable(bottom)!,
      paddingLeft: bindable(left)!,
    }
  }

  const [t, r, b, l] = sides as number[]
  if (!t && !r && !b && !l) return {}
  return { padding: `${t}px ${r}px ${b}px ${l}px` }
}

function decorationStyles(style: NodeStyle): CSSObject {
  const out: CSSObject = {}

  const fill = bindable(style.fill)
  if (fill !== undefined) out.backgroundColor = fill

  if (style.opacity !== undefined && style.opacity !== 1) out.opacity = style.opacity
  if (style.corners) Object.assign(out, cornerRadiusStyles(style.corners))

  if (style.border && style.border.width > 0) {
    const { width, style: lineStyle, color } = style.border
    if (isRef(color)) {
      out.borderWidth = width
      out.borderStyle = lineStyle
      out.borderColor = bindable(color)!
    } else {
      out.border = `${width}px ${lineStyle} ${color}`
    }
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
    fontFamily: bindable(text.fontFamily)!,
    fontSize: bindable(text.fontSize)!,
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
  const out: CSSObject = { ...paddingStyles(layout.padding) }

  if (layout.mode === "absolute") {
    // Children of an absolute frame are positioned against it.
    out.position = "relative"
    return out
  }

  out.display = "flex"
  out.flexDirection = layout.direction
  out.alignItems = ALIGN[layout.align]
  out.justifyContent = JUSTIFY[layout.justify]
  if (layout.gap !== 0) out.gap = bindable(layout.gap)!
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
