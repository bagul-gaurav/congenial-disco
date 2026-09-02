/**
 * Folding a document into the intermediate representation both emitters read.
 *
 * This is the seam the whole tool is built around. The canvas, the live preview
 * and the .tsx exporter all consume a `ResolvedTree`, so what you see on the
 * canvas cannot drift from what lands in Framer — there is no second
 * implementation of "what does this variant look like".
 */

import { isFrame, mergeStyle } from "./ops"
import type {
  ComponentDoc,
  Node,
  NodeId,
  NodeOverride,
  ResolvedNode,
  ResolvedTree,
  Variant,
  VariantId,
} from "./types"

/**
 * Precedence when several variants apply at once.
 *
 * Prop-driven variants (tone, size) describe what the component *is*; state
 * variants (hover, pressed) describe what is happening to it right now, so
 * states are applied last and win. Within each group, document order decides —
 * a later variant overrides an earlier one.
 */
function orderVariants(variants: Variant[]): Variant[] {
  const props = variants.filter((v) => v.selector.kind === "prop")
  const states = variants.filter((v) => v.selector.kind === "state")
  return [...props, ...states]
}

/** Apply one override to a node, leaving untouched fields on the base value. */
export function applyOverride(node: Node, override: NodeOverride): Node {
  let next: Node = node

  if (override.style) next = { ...next, style: mergeStyle(next.style, override.style) }
  if (override.hidden !== undefined) next = { ...next, hidden: override.hidden }
  if (override.size) next = { ...next, size: { ...next.size, ...override.size } }
  if (override.position) next = { ...next, position: { ...next.position, ...override.position } }

  if (override.content !== undefined && next.type === "text") {
    next = { ...next, content: override.content }
  }
  if (override.layout && isFrame(next) && next.layout.mode === "stack") {
    next = { ...next, layout: { ...next.layout, ...override.layout } }
  }

  return next
}

/** Merge a list of overrides left-to-right, later entries winning. */
export function mergeOverrides(overrides: NodeOverride[]): NodeOverride {
  return overrides.reduce<NodeOverride>((acc, override) => {
    const merged: NodeOverride = { ...acc, ...override }
    if (acc.style && override.style) merged.style = mergeStyle(acc.style, override.style)
    if (acc.size && override.size) merged.size = { ...acc.size, ...override.size }
    if (acc.layout && override.layout) merged.layout = { ...acc.layout, ...override.layout }
    return merged
  }, {})
}

export interface ResolveOptions {
  /**
   * Variants whose overrides should be folded into the returned nodes — what
   * the canvas is currently showing. The exporter passes none: it wants the
   * base tree plus every variant's delta kept separate, so it can emit them as
   * conditional styles and motion props.
   */
  activeVariantIds?: VariantId[]
}

export function resolve(doc: ComponentDoc, options: ResolveOptions = {}): ResolvedTree {
  const activeIds = new Set(options.activeVariantIds ?? [])
  const active = orderVariants(doc.variants.filter((v) => activeIds.has(v.id)))

  const byId: Record<NodeId, ResolvedNode> = {}

  // Guards against a malformed document (a child listed under two parents, or a
  // cycle introduced outside the ops layer) turning into an infinite walk.
  const visiting = new Set<NodeId>()

  function build(nodeId: NodeId): ResolvedNode | null {
    const base = doc.nodes[nodeId]
    if (!base || visiting.has(nodeId)) return null

    visiting.add(nodeId)

    const applicable = active
      .map((variant) => variant.overrides[nodeId])
      .filter((o): o is NodeOverride => o !== undefined)

    const node = applicable.length > 0 ? applyOverride(base, mergeOverrides(applicable)) : base

    const variantStyles: Record<VariantId, NodeOverride> = {}
    for (const variant of doc.variants) {
      const override = variant.overrides[nodeId]
      if (override) variantStyles[variant.id] = override
    }

    const children = isFrame(base)
      ? base.children
          .map(build)
          .filter((child): child is ResolvedNode => child !== null)
      : []

    visiting.delete(nodeId)

    const resolved: ResolvedNode = { node, children, variantStyles }
    byId[nodeId] = resolved
    return resolved
  }

  const root = build(doc.root)
  if (!root) {
    throw new Error(`Cannot resolve document ${doc.id}: root node ${doc.root} is missing`)
  }

  return { doc, root, byId }
}

/** Depth-first walk of a resolved tree, parents before children. */
export function walk(node: ResolvedNode, visit: (node: ResolvedNode, depth: number) => void): void {
  const step = (current: ResolvedNode, depth: number) => {
    visit(current, depth)
    for (const child of current.children) step(child, depth + 1)
  }
  step(node, 0)
}

/** Variants that apply to a node, in precedence order. Used by the exporter. */
export function variantsAffecting(tree: ResolvedTree, nodeId: NodeId): Variant[] {
  const resolved = tree.byId[nodeId]
  if (!resolved) return []
  return orderVariants(tree.doc.variants.filter((v) => v.id in resolved.variantStyles))
}
