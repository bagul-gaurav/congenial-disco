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

export type Bindable<T> = T | Binding

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
  top: number
  right: number
  bottom: number
  left: number
}

export type Layout =
  | {
      mode: "stack"
      direction: StackDirection
      gap: number
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
  color: string
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
  topLeft: number
  topRight: number
  bottomRight: number
  bottomLeft: number
}

export interface TextStyle {
  fontFamily: string
  fontSize: number
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
