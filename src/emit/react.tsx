/**
 * ResolvedTree → React elements.
 *
 * The live preview. It reads the same IR and calls the same `styleFor` as the
 * .tsx exporter, so the preview is not an approximation of the export — it is
 * the same styling logic through a different back end. If the preview looks
 * right, the paste into Framer looks right.
 *
 * The canvas uses this too, with `interactive: false` and a per-node ref
 * callback so it can hit-test and draw selection handles over real DOM boxes.
 */

import * as React from "react"

import { isBinding } from "@/model/types"
import type {
  Bindable,
  ComponentDoc,
  FrameNode,
  Node,
  NodeId,
  PropId,
  PropValue,
  ResolvedNode,
  StateTrigger,
} from "@/model/types"
import { resolve } from "@/model/resolve"

import { isBindRef, styleFor, type CSSObject } from "./style"

export type PropValues = Record<PropId, PropValue>

export interface PreviewOptions {
  /** Current values for the component's props. Missing keys fall back to defaults. */
  values?: PropValues
  /**
   * Interaction states to force on. The canvas uses this to show what a hover
   * variant looks like without requiring you to actually hover.
   */
  forcedStates?: StateTrigger[]
  /** When false, pointer interactions are ignored (canvas editing mode). */
  interactive?: boolean
  /** Called with each node's DOM element, so the canvas can measure it. */
  onNodeRef?: (nodeId: NodeId, element: HTMLElement | null) => void
  /** Extra props merged onto the root element (canvas needs data attributes). */
  rootProps?: React.HTMLAttributes<HTMLElement>
}

/** Resolve `{ __bind }` sentinels against the current prop values. */
function materialize(style: CSSObject, values: PropValues): React.CSSProperties {
  const out: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(style)) {
    if (isBindRef(value)) {
      const bound = values[value.__bind]
      if (bound === null || bound === undefined) continue
      out[key] = bound as string | number
    } else {
      out[key] = value
    }
  }
  return out as React.CSSProperties
}

function readBindable<T extends string>(value: Bindable<T>, values: PropValues, fallback: T): T {
  if (!isBinding(value)) return value
  const bound = values[value.bind]
  return (bound === null || bound === undefined ? fallback : bound) as T
}

function parentOf(nodes: Record<NodeId, Node>, nodeId: NodeId): FrameNode | null {
  for (const node of Object.values(nodes)) {
    if (node.type === "frame" && node.children.includes(nodeId)) return node
  }
  return null
}

/** Prop defaults, overlaid with whatever the caller supplied. */
export function propValues(doc: ComponentDoc, overrides: PropValues = {}): PropValues {
  const out: PropValues = {}
  for (const prop of doc.props) out[prop.id] = prop.defaultValue
  return { ...out, ...overrides }
}

/**
 * Which variants are active for the given prop values and forced states.
 * The exporter answers the same question in generated code; here we answer it
 * directly so the preview can fold the overrides in via `resolve`.
 */
export function activeVariantIds(
  doc: ComponentDoc,
  values: PropValues,
  forcedStates: StateTrigger[] = [],
): string[] {
  const forced = new Set(forcedStates)

  return doc.variants
    .filter((variant) => {
      if (variant.selector.kind === "prop") {
        const value = values[variant.selector.propId]
        if (typeof value === "boolean") return String(value) === variant.selector.value
        return String(value ?? "") === variant.selector.value
      }
      const state = doc.states.find((s) => s.id === variant.selector.stateId)
      if (!state) return false
      if (state.trigger === "disabled") {
        return state.propId ? values[state.propId] === true : false
      }
      return forced.has(state.trigger)
    })
    .map((variant) => variant.id)
}

interface RenderContext {
  nodes: Record<NodeId, Node>
  values: PropValues
  options: PreviewOptions
}

function renderNode(ctx: RenderContext, resolved: ResolvedNode, isRoot: boolean): React.ReactNode {
  const node = resolved.node
  const parent = isRoot ? null : parentOf(ctx.nodes, node.id)
  const style = materialize(styleFor(node, { parent }), ctx.values)

  const ref = ctx.options.onNodeRef
    ? (element: HTMLElement | null) => ctx.options.onNodeRef!(node.id, element)
    : undefined

  // `key` is passed explicitly at each call site rather than spread — React
  // warns when a key arrives through a props spread.
  const common = {
    style,
    ref: ref as never,
    "data-node-id": node.id,
    ...(isRoot ? ctx.options.rootProps : {}),
  }

  switch (node.type) {
    case "text": {
      const content = readBindable(node.content, ctx.values, "")
      return (
        <p key={node.id} {...common} suppressHydrationWarning>
          {content}
        </p>
      )
    }
    case "image": {
      const src = readBindable(node.src, ctx.values, "")
      // An unset image prop would render a broken-image icon; a placeholder box
      // reads as "nothing here yet", which is what it means.
      if (!src) return <div key={node.id} {...common} aria-label={node.alt ?? node.name} />
      return <img key={node.id} {...common} src={src} alt={node.alt ?? node.name} />
    }
    case "shape":
      return <div key={node.id} {...common} />
    case "frame":
      return (
        <div key={node.id} {...common}>
          {resolved.children.map((child) => renderNode(ctx, child, false))}
        </div>
      )
  }
}

export interface PreviewProps extends PreviewOptions {
  doc: ComponentDoc
}

/**
 * Render a document. Used both by the canvas (as the editing surface) and by
 * the preview pane (as a faithful stand-in for the exported component).
 */
export function Preview({ doc, ...options }: PreviewProps): React.ReactElement | null {
  const values = React.useMemo(() => propValues(doc, options.values), [doc, options.values])

  const [hovered, setHovered] = React.useState(false)
  const [pressed, setPressed] = React.useState(false)
  const [focused, setFocused] = React.useState(false)

  const states: StateTrigger[] = [...(options.forcedStates ?? [])]
  if (options.interactive !== false) {
    if (hovered) states.push("hover")
    if (pressed) states.push("tap")
    if (focused) states.push("focus")
  }

  const tree = React.useMemo(
    () => resolve(doc, { activeVariantIds: activeVariantIds(doc, values, states) }),
    // `states` is derived from the three booleans below; listing them keeps the
    // memo honest without allocating a new array identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, values, hovered, pressed, focused, options.forcedStates],
  )

  const interactionHandlers =
    options.interactive === false
      ? {}
      : {
          onPointerEnter: () => setHovered(true),
          onPointerLeave: () => {
            setHovered(false)
            setPressed(false)
          },
          onPointerDown: () => setPressed(true),
          onPointerUp: () => setPressed(false),
          onFocus: () => setFocused(true),
          onBlur: () => setFocused(false),
        }

  const ctx: RenderContext = {
    nodes: doc.nodes,
    values,
    options: {
      ...options,
      rootProps: { ...interactionHandlers, ...options.rootProps },
    },
  }

  return renderNode(ctx, tree.root, true) as React.ReactElement
}
