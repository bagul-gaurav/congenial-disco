/**
 * Pure document mutations.
 *
 * Every function takes a document and returns a new one; nothing is mutated in
 * place. The editor store applies these and keeps the previous document for
 * undo, so correctness here is what makes undo/redo trivially correct.
 *
 * Two invariants are maintained by construction and checked by `validate()`:
 *   - no orphans: every node except the root is a child of exactly one frame
 *   - no cycles: a node can never become its own ancestor
 */

import { toIdentifier, uniqueIdentifier } from "./identifiers"
import { tokenById } from "./values"
import {
  isBinding,
  isTokenRef,
  type Bindable,
  type ComponentDoc,
  type FrameNode,
  type Node,
  type NodeId,
  type NodeOverride,
  type NodeStyle,
  type Position,
  type PropDef,
  type PropId,
  type Size,
  type StateDef,
  type StateId,
  type Token,
  type TokenId,
  type Variant,
  type VariantId,
} from "./types"

// ---------------------------------------------------------------------------
// Tree queries
// ---------------------------------------------------------------------------

export function getNode(doc: ComponentDoc, id: NodeId): Node | undefined {
  return doc.nodes[id]
}

export function isFrame(node: Node | undefined): node is FrameNode {
  return node?.type === "frame"
}

export function parentOf(doc: ComponentDoc, id: NodeId): FrameNode | undefined {
  for (const node of Object.values(doc.nodes)) {
    if (isFrame(node) && node.children.includes(id)) return node
  }
  return undefined
}

/** Ancestor chain from the direct parent up to the root, root last. */
export function ancestorsOf(doc: ComponentDoc, id: NodeId): FrameNode[] {
  const out: FrameNode[] = []
  let current = parentOf(doc, id)
  while (current) {
    out.push(current)
    current = parentOf(doc, current.id)
  }
  return out
}

/** `id` and every node beneath it, parents before children. */
export function subtreeIds(doc: ComponentDoc, id: NodeId): NodeId[] {
  const out: NodeId[] = []
  const stack: NodeId[] = [id]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (out.includes(current)) continue // defensive: a malformed doc cannot hang us
    out.push(current)
    const node = doc.nodes[current]
    if (isFrame(node)) stack.push(...node.children)
  }
  return out
}

export function isDescendant(doc: ComponentDoc, ancestor: NodeId, candidate: NodeId): boolean {
  return ancestor !== candidate && subtreeIds(doc, ancestor).includes(candidate)
}

// ---------------------------------------------------------------------------
// Node mutations
// ---------------------------------------------------------------------------

function withNodes(doc: ComponentDoc, nodes: Record<NodeId, Node>): ComponentDoc {
  return { ...doc, nodes }
}

function replaceNode(doc: ComponentDoc, node: Node): ComponentDoc {
  return withNodes(doc, { ...doc.nodes, [node.id]: node })
}

export function insertNode(
  doc: ComponentDoc,
  parentId: NodeId,
  node: Node,
  index?: number,
): ComponentDoc {
  const parent = doc.nodes[parentId]
  if (!isFrame(parent)) return doc

  const children = [...parent.children]
  children.splice(index ?? children.length, 0, node.id)

  return withNodes(doc, {
    ...doc.nodes,
    [node.id]: node,
    [parentId]: { ...parent, children },
  })
}

/** Removes a node and its whole subtree, plus any variant overrides on them. */
export function removeNode(doc: ComponentDoc, id: NodeId): ComponentDoc {
  if (id === doc.root) return doc // the root is structural; deleting it is meaningless

  const doomed = new Set(subtreeIds(doc, id))
  const nodes: Record<NodeId, Node> = {}

  for (const [nodeId, node] of Object.entries(doc.nodes)) {
    if (doomed.has(nodeId)) continue
    nodes[nodeId] = isFrame(node)
      ? { ...node, children: node.children.filter((c) => !doomed.has(c)) }
      : node
  }

  const variants = doc.variants.map((variant) => ({
    ...variant,
    overrides: Object.fromEntries(
      Object.entries(variant.overrides).filter(([nodeId]) => !doomed.has(nodeId)),
    ),
  }))

  return { ...doc, nodes, variants }
}

export function reparentNode(
  doc: ComponentDoc,
  id: NodeId,
  newParentId: NodeId,
  index?: number,
): ComponentDoc {
  if (id === doc.root) return doc
  if (id === newParentId) return doc
  // Moving a node into its own subtree would detach that subtree from the root.
  if (isDescendant(doc, id, newParentId)) return doc

  const newParent = doc.nodes[newParentId]
  if (!isFrame(newParent)) return doc

  const nodes = { ...doc.nodes }
  const oldParent = parentOf(doc, id)
  if (oldParent) {
    nodes[oldParent.id] = {
      ...oldParent,
      children: oldParent.children.filter((c) => c !== id),
    }
  }

  // Re-read the parent: it may have just been rewritten as the old parent.
  const target = nodes[newParentId] as FrameNode
  const children = [...target.children]
  children.splice(index ?? children.length, 0, id)
  nodes[newParentId] = { ...target, children }

  return withNodes(doc, nodes)
}

export function reorderChild(doc: ComponentDoc, id: NodeId, index: number): ComponentDoc {
  const parent = parentOf(doc, id)
  if (!parent) return doc

  const children = parent.children.filter((c) => c !== id)
  children.splice(Math.max(0, Math.min(index, children.length)), 0, id)
  return replaceNode(doc, { ...parent, children })
}

export function renameNode(doc: ComponentDoc, id: NodeId, name: string): ComponentDoc {
  const node = doc.nodes[id]
  if (!node) return doc
  return replaceNode(doc, { ...node, name })
}

export function setNodeStyle(doc: ComponentDoc, id: NodeId, patch: NodeStyle): ComponentDoc {
  const node = doc.nodes[id]
  if (!node) return doc
  return replaceNode(doc, { ...node, style: mergeStyle(node.style, patch) })
}

export function setNodeSize(doc: ComponentDoc, id: NodeId, patch: Partial<Size>): ComponentDoc {
  const node = doc.nodes[id]
  if (!node) return doc
  return replaceNode(doc, { ...node, size: { ...node.size, ...patch } })
}

export function setNodePosition(
  doc: ComponentDoc,
  id: NodeId,
  patch: Partial<Position>,
): ComponentDoc {
  const node = doc.nodes[id]
  if (!node) return doc
  return replaceNode(doc, { ...node, position: { ...node.position, ...patch } })
}

export function setNodeLayout(
  doc: ComponentDoc,
  id: NodeId,
  patch: Partial<FrameNode["layout"]>,
): ComponentDoc {
  const node = doc.nodes[id]
  if (!isFrame(node)) return doc
  return replaceNode(doc, {
    ...node,
    layout: { ...node.layout, ...patch } as FrameNode["layout"],
  })
}

export function setNodeHidden(doc: ComponentDoc, id: NodeId, hidden: boolean): ComponentDoc {
  const node = doc.nodes[id]
  if (!node) return doc
  return replaceNode(doc, { ...node, hidden })
}

export function setTextContent(
  doc: ComponentDoc,
  id: NodeId,
  content: Bindable<string>,
): ComponentDoc {
  const node = doc.nodes[id]
  if (node?.type !== "text") return doc
  return replaceNode(doc, { ...node, content })
}

/**
 * Shallow-merge two styles, but merge `text` one level deeper so changing a
 * font size does not wipe the colour. Anything nested below that (shadows,
 * corners) is replaced wholesale, which is what the panel controls send.
 */
export function mergeStyle(base: NodeStyle, patch: NodeStyle): NodeStyle {
  const merged: NodeStyle = { ...base, ...patch }
  if (base.text && patch.text) merged.text = { ...base.text, ...patch.text }
  return merged
}

// ---------------------------------------------------------------------------
// Bindings — "expose as prop"
// ---------------------------------------------------------------------------

/** The node fields that can be driven by a prop. */
export type BindableField = "content" | "src" | "fill" | "textColor"

export function bindField(
  doc: ComponentDoc,
  id: NodeId,
  field: BindableField,
  propId: PropId,
): ComponentDoc {
  const node = doc.nodes[id]
  if (!node) return doc

  switch (field) {
    case "content":
      return node.type === "text" ? replaceNode(doc, { ...node, content: { bind: propId } }) : doc
    case "src":
      return node.type === "image" ? replaceNode(doc, { ...node, src: { bind: propId } }) : doc
    case "fill":
      return replaceNode(doc, { ...node, style: { ...node.style, fill: { bind: propId } } })
    case "textColor":
      return node.style.text
        ? replaceNode(doc, {
            ...node,
            style: { ...node.style, text: { ...node.style.text, color: { bind: propId } } },
          })
        : doc
  }
}

/** Replace a binding with a literal, so the layer goes back to being static. */
export function unbindField(
  doc: ComponentDoc,
  id: NodeId,
  field: BindableField,
  literal: string,
): ComponentDoc {
  const node = doc.nodes[id]
  if (!node) return doc

  switch (field) {
    case "content":
      return node.type === "text" ? replaceNode(doc, { ...node, content: literal }) : doc
    case "src":
      return node.type === "image" ? replaceNode(doc, { ...node, src: literal }) : doc
    case "fill":
      return replaceNode(doc, { ...node, style: { ...node.style, fill: literal } })
    case "textColor":
      return node.style.text
        ? replaceNode(doc, {
            ...node,
            style: { ...node.style, text: { ...node.style.text, color: literal } },
          })
        : doc
  }
}

/** Every node that reads the given prop, for "what breaks if I delete this". */
export function nodesBoundTo(doc: ComponentDoc, propId: PropId): NodeId[] {
  const reads = (value: unknown) => isBinding(value) && value.bind === propId

  return Object.values(doc.nodes)
    .filter((node) => {
      if (node.type === "text" && reads(node.content)) return true
      if (node.type === "image" && reads(node.src)) return true
      if (reads(node.style.fill)) return true
      if (node.style.text && reads(node.style.text.color)) return true
      if (isFrame(node) && (node.onTapPropId === propId || node.linkPropId === propId)) return true
      return false
    })
    .map((node) => node.id)
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export function addProp(doc: ComponentDoc, prop: PropDef): ComponentDoc {
  const name = uniqueIdentifier(
    toIdentifier(prop.name),
    doc.props.map((p) => p.name),
  )
  return { ...doc, props: [...doc.props, { ...prop, name }] }
}

export function updateProp(doc: ComponentDoc, id: PropId, patch: Partial<PropDef>): ComponentDoc {
  return {
    ...doc,
    props: doc.props.map((prop) => {
      if (prop.id !== id) return prop
      const next = { ...prop, ...patch }
      if (patch.name !== undefined) {
        next.name = uniqueIdentifier(
          toIdentifier(patch.name),
          doc.props.filter((p) => p.id !== id).map((p) => p.name),
        )
      }
      return next
    }),
  }
}

/**
 * Removing a prop also removes everything that referenced it: bindings revert
 * to a literal, variants selected by it are dropped, and states driven by it
 * lose their backing prop. Leaving dangling references would produce code that
 * does not compile.
 */
export function removeProp(doc: ComponentDoc, id: PropId): ComponentDoc {
  const prop = doc.props.find((p) => p.id === id)
  const literal = typeof prop?.defaultValue === "string" ? prop.defaultValue : ""

  let next: ComponentDoc = { ...doc, props: doc.props.filter((p) => p.id !== id) }

  for (const nodeId of nodesBoundTo(doc, id)) {
    const node = next.nodes[nodeId]
    if (!node) continue
    if (node.type === "text" && isBinding(node.content)) {
      next = unbindField(next, nodeId, "content", literal)
    }
    if (node.type === "image" && isBinding(node.src)) {
      next = unbindField(next, nodeId, "src", literal)
    }
    if (isBinding(next.nodes[nodeId]?.style.fill)) {
      next = unbindField(next, nodeId, "fill", literal || "#000000")
    }
    const text = next.nodes[nodeId]?.style.text
    if (text && isBinding(text.color)) {
      next = unbindField(next, nodeId, "textColor", literal || "#000000")
    }
    const frame = next.nodes[nodeId]
    if (isFrame(frame) && (frame.onTapPropId === id || frame.linkPropId === id)) {
      next = replaceNode(next, {
        ...frame,
        onTapPropId: frame.onTapPropId === id ? undefined : frame.onTapPropId,
        linkPropId: frame.linkPropId === id ? undefined : frame.linkPropId,
      })
    }
  }

  return {
    ...next,
    states: next.states.map((s) => (s.propId === id ? { ...s, propId: undefined } : s)),
    variants: next.variants.filter(
      (v) => !(v.selector.kind === "prop" && v.selector.propId === id),
    ),
  }
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function addState(doc: ComponentDoc, state: StateDef): ComponentDoc {
  return { ...doc, states: [...doc.states, state] }
}

export function updateState(
  doc: ComponentDoc,
  id: StateId,
  patch: Partial<StateDef>,
): ComponentDoc {
  return {
    ...doc,
    states: doc.states.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  }
}

/** Drops the state and any variant that was designed for it. */
export function removeState(doc: ComponentDoc, id: StateId): ComponentDoc {
  return {
    ...doc,
    states: doc.states.filter((s) => s.id !== id),
    variants: doc.variants.filter((v) => !(v.selector.kind === "state" && v.selector.stateId === id)),
  }
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

export function addVariant(doc: ComponentDoc, variant: Variant): ComponentDoc {
  return { ...doc, variants: [...doc.variants, variant] }
}

export function removeVariant(doc: ComponentDoc, id: VariantId): ComponentDoc {
  return { ...doc, variants: doc.variants.filter((v) => v.id !== id) }
}

export function renameVariant(doc: ComponentDoc, id: VariantId, name: string): ComponentDoc {
  return { ...doc, variants: doc.variants.map((v) => (v.id === id ? { ...v, name } : v)) }
}

/**
 * Record an override on a variant. This is what every properties-panel edit
 * routes through while a variant is active — the base design is left alone, so
 * later base edits still propagate into this variant for untouched fields.
 */
export function setOverride(
  doc: ComponentDoc,
  variantId: VariantId,
  nodeId: NodeId,
  patch: NodeOverride,
): ComponentDoc {
  return {
    ...doc,
    variants: doc.variants.map((variant) => {
      if (variant.id !== variantId) return variant

      const existing = variant.overrides[nodeId] ?? {}
      const merged: NodeOverride = { ...existing, ...patch }
      if (existing.style && patch.style) merged.style = mergeStyle(existing.style, patch.style)
      if (existing.size && patch.size) merged.size = { ...existing.size, ...patch.size }
      if (existing.layout && patch.layout) merged.layout = { ...existing.layout, ...patch.layout }

      return { ...variant, overrides: { ...variant.overrides, [nodeId]: merged } }
    }),
  }
}

/** Drop a node's override so it inherits from the base design again. */
export function clearOverride(
  doc: ComponentDoc,
  variantId: VariantId,
  nodeId: NodeId,
): ComponentDoc {
  return {
    ...doc,
    variants: doc.variants.map((variant) => {
      if (variant.id !== variantId) return variant
      const overrides = { ...variant.overrides }
      delete overrides[nodeId]
      return { ...variant, overrides }
    }),
  }
}

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

export function addToken(doc: ComponentDoc, token: Token): ComponentDoc {
  return { ...doc, tokens: [...doc.tokens, token] }
}

export function addTokens(doc: ComponentDoc, tokens: Token[]): ComponentDoc {
  // Skips names already present, so adding the starter set to a document that
  // already has a "Primary" does not produce two of them.
  const taken = new Set(doc.tokens.map((t) => `${t.type}:${t.name.toLowerCase()}`))
  const fresh = tokens.filter((t) => !taken.has(`${t.type}:${t.name.toLowerCase()}`))
  return { ...doc, tokens: [...doc.tokens, ...fresh] }
}

export function updateToken(
  doc: ComponentDoc,
  id: TokenId,
  patch: Partial<Token>,
): ComponentDoc {
  return {
    ...doc,
    tokens: doc.tokens.map((token) => (token.id === id ? { ...token, ...patch } : token)),
  }
}

/**
 * Deletes a token, replacing every reference to it with the value it held.
 *
 * Leaving dangling references would mean a design that silently loses a colour,
 * and generated code referring to a token that is no longer emitted.
 */
export function removeToken(doc: ComponentDoc, id: TokenId): ComponentDoc {
  const token = tokenById(doc.tokens, id)
  if (!token) return doc

  const inline = <T,>(value: T): T =>
    isTokenRef(value) && value.token === id ? (token.value as unknown as T) : value

  const rewriteStyle = (style: NodeStyle): NodeStyle => {
    const next: NodeStyle = { ...style }
    if (next.fill !== undefined) next.fill = inline(next.fill)
    if (next.corners) {
      next.corners = {
        topLeft: inline(next.corners.topLeft),
        topRight: inline(next.corners.topRight),
        bottomRight: inline(next.corners.bottomRight),
        bottomLeft: inline(next.corners.bottomLeft),
      }
    }
    if (next.border) next.border = { ...next.border, color: inline(next.border.color) }
    if (next.text) {
      next.text = {
        ...next.text,
        color: inline(next.text.color),
        fontSize: inline(next.text.fontSize),
        fontFamily: inline(next.text.fontFamily),
      }
    }
    return next
  }

  const rewriteLayout = (layout: FrameNode["layout"]): FrameNode["layout"] => {
    const padding = {
      top: inline(layout.padding.top),
      right: inline(layout.padding.right),
      bottom: inline(layout.padding.bottom),
      left: inline(layout.padding.left),
    }
    return layout.mode === "stack"
      ? { ...layout, padding, gap: inline(layout.gap) }
      : { ...layout, padding }
  }

  const nodes: Record<NodeId, Node> = {}
  for (const [nodeId, node] of Object.entries(doc.nodes)) {
    const next: Node = { ...node, style: rewriteStyle(node.style) }
    nodes[nodeId] = isFrame(next) ? { ...next, layout: rewriteLayout(next.layout) } : next
  }

  const variants = doc.variants.map((variant) => ({
    ...variant,
    overrides: Object.fromEntries(
      Object.entries(variant.overrides).map(([nodeId, override]) => [
        nodeId,
        override.style ? { ...override, style: rewriteStyle(override.style) } : override,
      ]),
    ),
  }))

  return { ...doc, tokens: doc.tokens.filter((t) => t.id !== id), nodes, variants }
}

/** Nodes that read from a token, for "what changes if I edit this". */
export function nodesUsingToken(doc: ComponentDoc, id: TokenId): NodeId[] {
  const reads = (value: unknown) => isTokenRef(value) && value.token === id

  return Object.values(doc.nodes)
    .filter((node) => {
      const { style } = node
      if (reads(style.fill)) return true
      if (style.corners && Object.values(style.corners).some(reads)) return true
      if (style.border && reads(style.border.color)) return true
      if (style.text && (reads(style.text.color) || reads(style.text.fontSize) || reads(style.text.fontFamily))) {
        return true
      }
      if (isFrame(node)) {
        if (Object.values(node.layout.padding).some(reads)) return true
        if (node.layout.mode === "stack" && reads(node.layout.gap)) return true
      }
      return false
    })
    .map((node) => node.id)
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  kind: "orphan" | "cycle" | "missing-child" | "missing-root" | "dangling-prop" | "duplicate-parent"
  message: string
  nodeId?: NodeId
}

/**
 * Structural checks. The ops above maintain these by construction; `validate`
 * exists so tests can assert it after a sequence of random operations, and so a
 * document loaded from the database can be rejected rather than crashing the
 * canvas.
 */
export function validate(doc: ComponentDoc): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!doc.nodes[doc.root]) {
    issues.push({ kind: "missing-root", message: `Root node ${doc.root} does not exist` })
    return issues
  }

  const parentCount = new Map<NodeId, number>()
  for (const node of Object.values(doc.nodes)) {
    if (!isFrame(node)) continue
    for (const childId of node.children) {
      if (!doc.nodes[childId]) {
        issues.push({
          kind: "missing-child",
          nodeId: node.id,
          message: `Frame ${node.id} references missing child ${childId}`,
        })
        continue
      }
      parentCount.set(childId, (parentCount.get(childId) ?? 0) + 1)
    }
  }

  for (const [nodeId, count] of parentCount) {
    if (count > 1) {
      issues.push({
        kind: "duplicate-parent",
        nodeId,
        message: `Node ${nodeId} appears under ${count} parents`,
      })
    }
  }

  const reachable = new Set(subtreeIds(doc, doc.root))
  for (const nodeId of Object.keys(doc.nodes)) {
    if (nodeId === doc.root) continue
    if (!reachable.has(nodeId)) {
      issues.push({ kind: "orphan", nodeId, message: `Node ${nodeId} is not reachable from the root` })
    }
    if ((parentCount.get(nodeId) ?? 0) === 0 && reachable.has(nodeId)) {
      issues.push({ kind: "cycle", nodeId, message: `Node ${nodeId} is reachable but has no parent` })
    }
  }

  const propIds = new Set(doc.props.map((p) => p.id))
  for (const variant of doc.variants) {
    if (variant.selector.kind === "prop" && !propIds.has(variant.selector.propId)) {
      issues.push({
        kind: "dangling-prop",
        message: `Variant ${variant.id} is selected by missing prop ${variant.selector.propId}`,
      })
    }
  }

  return issues
}
