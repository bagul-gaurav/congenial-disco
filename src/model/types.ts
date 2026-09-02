/**
 * The document model.
 *
 * A document is not an artboard that happens to emit code — it *is* a component.
 * It has an API (`props`), it has interaction states (`states`), and the canvas
 * is where the base design and each variant's overrides are authored.
 *
 * These types are pure data: no React, no DOM, no ids generated at import time.
 * Everything downstream (canvas rendering, preview, .tsx export) reads a
 * ResolvedTree produced from this by `resolve.ts`.
 */

export type NodeId = string
export type PropId = string
export type StateId = string
export type VariantId = string
export type TokenId = string

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

/**
 * What a token can stand for.
 *
 * Grouped by role rather than by primitive type: `space` and `radius` are both
 * numbers, but a spacing scale and a corner scale are different decisions, and
 * a picker that offers every number for every field is useless.
 */
export type TokenType = "color" | "space" | "radius" | "fontSize" | "fontFamily"

export interface Token {
  id: TokenId
  /** Free text. Sanitised into an identifier when emitted. */
  name: string
  type: TokenType
  value: string | number
  description?: string
}

/** Which token types can drive a given kind of field. */
export const TOKEN_TYPE_FOR_FIELD = {
  color: "color",
  space: "space",
  radius: "radius",
  fontSize: "fontSize",
  fontFamily: "fontFamily",
} as const

// ---------------------------------------------------------------------------
// Component API
// ---------------------------------------------------------------------------

/** Prop types, chosen to map cleanly onto Framer's ControlType set. */
export type PropType =
  | "text"
  | "number"
  | "boolean"
  | "enum"
  | "color"
  | "image"
  | "link"
  | "event"

export interface PropDef {
  id: PropId
  /** Must be a valid JS identifier — it becomes a destructured prop name. */
  name: string
  type: PropType
  defaultValue: PropValue
  /** Only meaningful when `type === "enum"`. */
  options?: string[]
  /** When false the prop exists in the document but is not emitted as a control. */
  exposed: boolean
  /** Shown as the control's description in Framer; also useful documentation. */
  description?: string
}

export type PropValue = string | number | boolean | null

/**
 * An interaction state. Unlike variant props, these become *runtime behavior*
 * in the exported component (framer-motion `whileHover` / `whileTap`, or a
 * `disabled` prop check) rather than something a designer flips manually.
 */
export type StateTrigger = "hover" | "tap" | "focus" | "disabled"

export interface StateDef {
  id: StateId
  name: string
  trigger: StateTrigger
  /**
   * For `disabled` only: the boolean prop that drives the state. Hover, tap and
   * focus are driven by pointer/keyboard events and need no backing prop.
   */
  propId?: PropId
}

// ---------------------------------------------------------------------------
// Layer tree
// ---------------------------------------------------------------------------

/** A value that comes from a prop at runtime rather than being baked in. */
export interface Binding {
  bind: PropId
}

export function isBinding(value: unknown): value is Binding {
  return typeof value === "object" && value !== null && "bind" in value
}

/** A value that comes from a design token rather than being written inline. */
export interface TokenRef {
  token: TokenId
}

export function isTokenRef(value: unknown): value is TokenRef {
  return typeof value === "object" && value !== null && "token" in value
}

/**
 * Any leaf value in the model.
 *
 * One rule, applied everywhere: a value is either written inline, read from a
 * prop at runtime, or read from a design token. Widening the leaves rather than
 * keeping a side-table of "which fields are tokenised" means the three cases
 * are handled in one place per emitter, and a plain literal stays valid — so
 * documents saved before tokens existed still load unchanged.
 */
export type Bindable<T> = T | Binding | TokenRef

export type SizeValue =
  /** A fixed pixel size. */
  | { mode: "fixed"; value: number }
  /** Grow to fill the parent's main axis (`flex: 1` / `100%`). */
  | { mode: "fill" }
  /** Shrink to fit contents (`fit-content` / `auto`). */
  | { mode: "hug" }

export interface Size {
  width: SizeValue
  height: SizeValue
}

export type StackDirection = "row" | "column"
export type StackAlign = "start" | "center" | "end" | "stretch"
export type StackJustify = "start" | "center" | "end" | "between" | "around"

export interface Padding {
  top: Bindable<number>
  right: Bindable<number>
  bottom: Bindable<number>
  left: Bindable<number>
}

export type Layout =
  | {
      mode: "stack"
      direction: StackDirection
      gap: Bindable<number>
      padding: Padding
      align: StackAlign
      justify: StackJustify
      wrap: boolean
    }
  | {
      mode: "absolute"
      padding: Padding
    }

/** Position within an `absolute` parent. Ignored inside a stack parent. */
export interface Position {
  x: number
  y: number
}

export interface Border {
  width: number
  color: Bindable<string>
  style: "solid" | "dashed" | "dotted"
}

export interface Shadow {
  x: number
  y: number
  blur: number
  spread: number
  color: string
}

export interface Corners {
  topLeft: Bindable<number>
  topRight: Bindable<number>
  bottomRight: Bindable<number>
  bottomLeft: Bindable<number>
}

export interface TextStyle {
  fontFamily: Bindable<string>
  fontSize: Bindable<number>
  fontWeight: number
  lineHeight: number
  letterSpacing: number
  textAlign: "left" | "center" | "right"
  color: Bindable<string>
}

export interface NodeStyle {
  fill?: Bindable<string>
  opacity?: number
  corners?: Corners
  border?: Border
  shadows?: Shadow[]
  text?: TextStyle
  /** Applied to the transform; used by variants for press/hover motion. */
  scale?: number
}

interface NodeBase {
  id: NodeId
  name: string
  style: NodeStyle
  /** Only honoured when the parent frame uses `absolute` layout. */
  position: Position
  size: Size
  hidden?: boolean
}

export interface FrameNode extends NodeBase {
  type: "frame"
  layout: Layout
  children: NodeId[]
  /** Emits an `onTap` handler wired to this event prop. */
  onTapPropId?: PropId
  /** Emits an anchor-style link from this text/url prop. */
  linkPropId?: PropId
}

export interface TextNode extends NodeBase {
  type: "text"
  content: Bindable<string>
}

export interface ImageNode extends NodeBase {
  type: "image"
  src: Bindable<string>
  fit: "cover" | "contain" | "fill"
  alt?: string
}

export interface ShapeNode extends NodeBase {
  type: "shape"
  kind: "rect" | "ellipse"
}

export type Node = FrameNode | TextNode | ImageNode | ShapeNode
export type NodeType = Node["type"]

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

/**
 * What a variant overrides on one node. Deliberately a shallow partial: a
 * variant that only changes a fill stores only that fill, so editing the base
 * design propagates everywhere it was not explicitly overridden.
 */
export interface NodeOverride {
  style?: NodeStyle
  hidden?: boolean
  content?: Bindable<string>
  size?: Partial<Size>
  position?: Partial<Position>
  layout?: Partial<Extract<Layout, { mode: "stack" }>>
}

export type VariantSelector =
  /** Driven at runtime by an interaction (hover, tap, focus, disabled). */
  | { kind: "state"; stateId: StateId }
  /** Driven by the value of an enum or boolean prop. */
  | { kind: "prop"; propId: PropId; value: string }

export interface Variant {
  id: VariantId
  name: string
  selector: VariantSelector
  overrides: Record<NodeId, NodeOverride>
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export const DOC_VERSION = 1

export interface ComponentDoc {
  id: string
  /** Becomes the exported component's name; must be a valid JS identifier. */
  name: string
  version: number
  description: string
  props: PropDef[]
  states: StateDef[]
  /** Design tokens this component's values can reference. */
  tokens: Token[]
  /** The base design. Variants store deltas against this. */
  nodes: Record<NodeId, Node>
  root: NodeId
  variants: Variant[]
}

// ---------------------------------------------------------------------------
// Resolved tree — the IR consumed by both emitters
// ---------------------------------------------------------------------------

/** A node with every applicable override already folded in. */
export interface ResolvedNode {
  node: Node
  children: ResolvedNode[]
  /**
   * Per-variant style deltas for this node, keyed by variant id. The .tsx
   * emitter turns these into conditional styles / motion props; the preview
   * emitter applies the ones whose selector is currently active.
   */
  variantStyles: Record<VariantId, NodeOverride>
}

export interface ResolvedTree {
  doc: ComponentDoc
  root: ResolvedNode
  /** Flattened lookup, same ids as `doc.nodes`. */
  byId: Record<NodeId, ResolvedNode>
}
