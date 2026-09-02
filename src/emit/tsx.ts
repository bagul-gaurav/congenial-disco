/**
 * ResolvedTree → a Framer code component, as source.
 *
 * The output is one self-contained file whose only imports are `react`,
 * `framer` and `framer-motion`, all resolvable inside Framer's code editor. You
 * paste it in and the component works — property controls appear in the right
 * panel, and interaction states animate for real rather than being props a
 * designer has to flip by hand.
 *
 * Shape of the generated component:
 *
 *   - exposed props become destructured bindings with defaults
 *   - prop-driven variants become conditional style spreads
 *   - pointer states become framer-motion *named variants* driven from the root
 *   - the `disabled` state guards those and folds in as a conditional style
 *
 * The named-variant part matters. A hover delta on a nested layer cannot be
 * emitted as `whileHover` on that layer: hovering a child is not the same event
 * as hovering the component, and a layer that hover reveals is not hoverable in
 * the first place. So the root carries `whileHover="hover"` and every layer with
 * a hover delta declares a matching entry in its own `variants` map —
 * framer-motion then propagates the label down the tree.
 */

import { toIdentifier, toPascalCase, uniqueIdentifier } from "@/model/identifiers"
import { isBinding, isTokenRef } from "@/model/types"
import type {
  ComponentDoc,
  FrameNode,
  Node,
  NodeId,
  PropDef,
  PropId,
  ResolvedNode,
  ResolvedTree,
  SizeValue,
  StateDef,
  StateTrigger,
  TokenId,
  Variant,
} from "@/model/types"
import { resolve, variantsAffecting } from "@/model/resolve"

import {
  isBindRef,
  isTokenValueRef,
  parentIndex,
  styleFor,
  variantStyleFor,
  type CSSObject,
} from "./style"
import { emitPropertyControls } from "./controls"

const INDENT = "    " // Framer's code editor uses four spaces.

/** Pointer-driven states, and the framer-motion prop that activates each. */
type PointerTrigger = Exclude<StateTrigger, "disabled">

const MOTION_PROP: Record<PointerTrigger, string> = {
  hover: "whileHover",
  tap: "whileTap",
  focus: "whileFocus",
}

/** The variant label propagated from the root to descendants. */
const STATE_LABEL: Record<PointerTrigger, string> = {
  hover: "hover",
  tap: "pressed",
  focus: "focused",
}

const REST_LABEL = "rest"

function pad(depth: number): string {
  return INDENT.repeat(depth)
}

// ---------------------------------------------------------------------------
// Serialising style objects
// ---------------------------------------------------------------------------

/** Valid identifier keys can be written bare; anything else gets quoted. */
function key(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name)
}

/** A raw expression to emit verbatim, rather than a literal value. */
interface ExprRef {
  __expr: string
}

function isExprRef(value: unknown): value is ExprRef {
  return typeof value === "object" && value !== null && "__expr" in value
}

type EmitValue = CSSObject[string] | ExprRef
type EmitObject = Record<string, EmitValue>

/** How a reference is written into the source. */
interface ValueNames {
  prop: (id: PropId) => string
  token: (id: TokenId) => string
  /** Called for each token reference written, so unused ones are not emitted. */
  use?: (id: TokenId) => void
}

function renderValue(value: EmitValue, names: ValueNames): string {
  if (isExprRef(value)) return value.__expr
  if (isBindRef(value)) return names.prop(value.__bind) // a prop reference, not a literal
  if (isTokenValueRef(value)) {
    names.use?.(value.__token)
    return names.token(value.__token)
  }
  return typeof value === "number" ? String(value) : JSON.stringify(value)
}

function serializeStyle(style: EmitObject, names: ValueNames, depth: number): string {
  const entries = Object.entries(style)
  if (entries.length === 0) return "{}"

  const body = entries
    .map(([k, value]) => `${pad(depth + 1)}${key(k)}: ${renderValue(value, names)},`)
    .join("\n")

  return `{\n${body}\n${pad(depth)}}`
}

/** `{ rest: {...}, hover: {...} }` — a framer-motion variants map. */
function serializeVariants(
  entries: Array<[string, EmitObject]>,
  names: ValueNames,
  depth: number,
): string {
  const body = entries
    .map(([label, style]) => `${pad(depth + 1)}${label}: ${serializeStyle(style, names, depth + 1)},`)
    .join("\n")

  return `{\n${body}\n${pad(depth)}}`
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

interface Names extends ValueNames {
  component: string
  /** Const holding the composed style the element actually uses. */
  styleConst: (nodeId: NodeId) => string
  /** Const holding the unconditional base style, when a composed one exists. */
  baseConst: (nodeId: NodeId) => string
  /** Const holding a conditional (prop-driven or disabled) variant's delta. */
  variantConst: (nodeId: NodeId, variantId: string) => string
  /** Const holding a node's framer-motion variants map. */
  motionConst: (nodeId: NodeId) => string
}

function buildNames(doc: ComponentDoc, tree: ResolvedTree): Names {
  const component = toPascalCase(doc.name, "Component")

  const propNames = new Map<PropId, string>()
  const taken = new Set<string>(["style", "props", "React", "motion", "tokens"])
  for (const prop of doc.props) {
    const name = uniqueIdentifier(toIdentifier(prop.name), taken)
    taken.add(name)
    propNames.set(prop.id, name)
  }

  // Token names live inside the emitted `tokens` object, so they only have to
  // be unique among themselves — a token called "label" cannot collide with a
  // prop of the same name.
  const tokenNames = new Map<TokenId, string>()
  const tokensTaken = new Set<string>()
  for (const token of doc.tokens) {
    const name = uniqueIdentifier(toIdentifier(token.name, "token"), tokensTaken)
    tokensTaken.add(name)
    tokenNames.set(token.id, name)
  }

  // Stems are only unique among themselves. They are never emitted on their
  // own — every const appends a suffix — so a stem matching a prop name is
  // harmless, and forcing them apart would turn `labelStyle` into `label2Style`.
  const stems = new Map<NodeId, string>()
  const stemsTaken = new Set<string>()
  for (const nodeId of Object.keys(tree.byId)) {
    const node = tree.byId[nodeId].node
    const stem = uniqueIdentifier(
      nodeId === doc.root ? "root" : toIdentifier(node.name, "layer"),
      stemsTaken,
    )
    stemsTaken.add(stem)
    stems.set(nodeId, stem)
  }

  /** Claim a const name, keeping it distinct from props and other consts. */
  const claim = (preferred: string): string => {
    const name = uniqueIdentifier(preferred, taken)
    taken.add(name)
    return name
  }

  const styleNames = new Map<NodeId, string>()
  const baseNames = new Map<NodeId, string>()
  const motionNames = new Map<NodeId, string>()
  const variantNames = new Map<string, string>()

  for (const nodeId of Object.keys(tree.byId)) {
    const stem = stems.get(nodeId)!
    styleNames.set(nodeId, claim(`${stem}Style`))
    baseNames.set(nodeId, claim(`${stem}Base`))

    for (const variant of doc.variants) {
      if (!(variant.id in tree.byId[nodeId].variantStyles)) continue
      variantNames.set(
        `${nodeId}:${variant.id}`,
        claim(`${stem}${toPascalCase(variant.name, "Variant")}`),
      )
    }

    motionNames.set(nodeId, claim(`${stem}Motion`))
  }

  return {
    component,
    prop: (id) => propNames.get(id) ?? "undefined",
    token: (id) => `tokens.${tokenNames.get(id) ?? "unknown"}`,
    styleConst: (nodeId) => styleNames.get(nodeId) ?? "layerStyle",
    baseConst: (nodeId) => baseNames.get(nodeId) ?? "layerBase",
    variantConst: (nodeId, variantId) =>
      variantNames.get(`${nodeId}:${variantId}`) ?? `${stems.get(nodeId) ?? "layer"}Variant`,
    motionConst: (nodeId) => motionNames.get(nodeId) ?? `${stems.get(nodeId) ?? "layer"}Motion`,
  }
}

// ---------------------------------------------------------------------------
// Layout annotations
// ---------------------------------------------------------------------------

/**
 * Framer reads these annotations to decide whether the component can be
 * resized on the canvas. They must match how the root actually sizes itself,
 * or the canvas and the component disagree about who owns the dimensions.
 */
function layoutAnnotation(size: SizeValue): string {
  switch (size.mode) {
    case "hug":
      return "auto"
    case "fixed":
      return "fixed"
    case "fill":
      return "any"
  }
}

// ---------------------------------------------------------------------------
// Emitting
// ---------------------------------------------------------------------------

interface EmitContext {
  tree: ResolvedTree
  names: Names
  /** Tokens actually referenced, collected as the tree is emitted. */
  usedTokens: Set<TokenId>
  /** The state a variant targets, for variants that target one. */
  stateByVariant: Map<string, StateDef>
  /** Identifier of the boolean prop backing a `disabled` state, if any. */
  disabledProp: string | null
  /** Pointer triggers used anywhere in the tree — the root drives all of them. */
  triggers: Set<PointerTrigger>
  /** Collected `const x = {...}` lines, emitted before the return statement. */
  declarations: string[]
  /** `nodeId → parent frame`, built once. See `parentIndex`. */
  parents: Record<NodeId, FrameNode>
}

/** The pointer trigger a variant is driven by, or null if it is not one. */
function pointerTrigger(ctx: EmitContext, variant: Variant): PointerTrigger | null {
  const state = ctx.stateByVariant.get(variant.id)
  if (!state || state.trigger === "disabled") return null
  return state.trigger
}

/**
 * The boolean test that activates a variant in the style object, or null when
 * the variant is pointer-driven and therefore belongs on a motion variants map.
 */
function conditionFor(ctx: EmitContext, variant: Variant): string | null {
  if (variant.selector.kind === "prop") {
    const selector = variant.selector
    const prop = ctx.tree.doc.props.find((p) => p.id === selector.propId)
    if (!prop) return null

    const name = ctx.names.prop(prop.id)
    if (prop.type === "boolean") return selector.value === "true" ? name : `!${name}`
    return `${name} === ${JSON.stringify(selector.value)}`
  }

  // `disabled` is a prop the caller sets, not something the pointer does, so it
  // reads as a conditional style rather than an animation.
  const state = ctx.stateByVariant.get(variant.id)
  if (state?.trigger === "disabled") return ctx.disabledProp
  return null
}

/**
 * A node's pointer-state deltas, merged per trigger. Two variants targeting the
 * same state collapse into one entry, because a single label drives both.
 */
function stateDeltas(
  ctx: EmitContext,
  resolved: ResolvedNode,
  parent: FrameNode | null,
): Map<PointerTrigger, CSSObject> {
  const out = new Map<PointerTrigger, CSSObject>()

  for (const variant of variantsAffecting(ctx.tree, resolved.node.id)) {
    const trigger = pointerTrigger(ctx, variant)
    if (!trigger) continue

    const delta = variantStyleFor(resolved.node, resolved.variantStyles[variant.id], { parent })
    out.set(trigger, { ...(out.get(trigger) ?? {}), ...delta })
  }

  return out
}

/**
 * The values a node returns to when no state is active.
 *
 * framer-motion needs an explicit resting entry for every property a state
 * touches, or the layer stays stuck on the last animated value after the
 * pointer leaves. Crucially the entries read from the node's *composed* style
 * const — base plus whatever prop-driven and disabled deltas apply — rather
 * than from the base alone. Reading the base would make a ghost button animate
 * back to the primary fill on pointer-out, because the resting entry would name
 * a colour the component is not currently wearing.
 */
function restStyle(
  styleConst: string,
  base: CSSObject,
  deltas: Map<PointerTrigger, CSSObject>,
  node: Node,
): EmitObject {
  const touched = new Set<string>()
  for (const delta of deltas.values()) for (const k of Object.keys(delta)) touched.add(k)

  const fallback = (k: string): string | number | undefined => {
    const value = base[k]
    // A reference has no literal to fall back to; the composed style const the
    // resting entry reads from already resolves it.
    if (value !== undefined && !isBindRef(value) && !isTokenValueRef(value)) return value
    if (k === "scale" || k === "opacity") return 1
    // The base omits `display` for nothing, but a bound fill has no literal to
    // fall back to, so leave those to the composed value alone.
    if (k === "display") return node.type === "frame" && node.layout.mode === "stack" ? "flex" : "block"
    return undefined
  }

  const rest: EmitObject = {}
  for (const k of touched) {
    const literal = fallback(k)
    const reference = `${styleConst}.${key(k)}`
    rest[k] = {
      __expr:
        literal === undefined
          ? reference
          : `${reference} ?? ${typeof literal === "number" ? literal : JSON.stringify(literal)}`,
    }
  }
  return rest
}

/** Should this node render as a motion element rather than a plain one? */
function needsMotion(ctx: EmitContext, resolved: ResolvedNode, isRoot: boolean, hasStates: boolean): boolean {
  if (hasStates) return true
  if (!isRoot) return false
  // The root drives the whole tree's states and handles taps.
  return ctx.triggers.size > 0 || (resolved.node.type === "frame" && !!resolved.node.onTapPropId)
}

function elementFor(node: Node, motion: boolean): string {
  const tag = node.type === "text" ? "p" : node.type === "image" ? "img" : "div"
  return motion ? `motion.${tag}` : tag
}

/**
 * The `style={...}` attribute value. The composed style already folds in every
 * conditional variant, so the root only has to add Framer's own `style` prop,
 * which carries the size the component was given on the canvas.
 */
function styleExpression(ctx: EmitContext, nodeId: NodeId, isRoot: boolean, depth: number): string {
  const composed = ctx.names.styleConst(nodeId)
  if (!isRoot) return `{${composed}}`

  return `{{\n${pad(depth + 2)}...${composed},\n${pad(depth + 2)}...style,\n${pad(depth + 1)}}}`
}

function contentExpression(ctx: EmitContext, node: Node): string {
  if (node.type !== "text") return ""
  if (isBinding(node.content)) return `{${ctx.names.prop(node.content.bind)}}`
  if (isTokenRef(node.content)) return `{${ctx.names.token(node.content.token)}}`
  return escapeText(node.content)
}

/** JSX text is mostly literal, but braces and angle brackets must be escaped. */
function escapeText(text: string): string {
  if (/[{}<>]/.test(text) || text.trim() !== text) return `{${JSON.stringify(text)}}`
  return text
}

/**
 * A layer hidden in the base design that no variant ever reveals contributes
 * nothing but noise, so it is left out of the output entirely.
 */
function isRendered(resolved: ResolvedNode): boolean {
  if (!resolved.node.hidden) return true
  return Object.values(resolved.variantStyles).some((o) => o.hidden === false)
}

function emitNode(ctx: EmitContext, resolved: ResolvedNode, depth: number, isRoot = false): string {
  const node = resolved.node
  const nodeId = node.id
  const parent = isRoot ? null : (ctx.parents[nodeId] ?? null)

  // The `React.CSSProperties` annotation is not decoration: without it a value
  // like `flexDirection: "row"` widens to `string` and fails to satisfy React's
  // union types, which Framer's own editor reports as an error on paste.
  const baseStyle = styleFor(node, { parent })
  const styleName = ctx.names.styleConst(nodeId)

  // Conditional (prop-driven and disabled) deltas become their own consts, then
  // fold into one composed style. Composing here rather than inline in the JSX
  // means the resting motion variant can read the *current* values.
  const conditionals: Array<{ test: string; constName: string }> = []
  for (const variant of variantsAffecting(ctx.tree, nodeId)) {
    if (pointerTrigger(ctx, variant)) continue
    const test = conditionFor(ctx, variant)
    if (test === null) continue

    const constName = ctx.names.variantConst(nodeId, variant.id)
    const delta = variantStyleFor(node, resolved.variantStyles[variant.id], { parent })
    ctx.declarations.push(
      `${INDENT}const ${constName}: React.CSSProperties = ${serializeStyle(delta, ctx.names, 1)}`,
    )
    conditionals.push({ test, constName })
  }

  if (conditionals.length === 0) {
    ctx.declarations.push(
      `${INDENT}const ${styleName}: React.CSSProperties = ${serializeStyle(baseStyle, ctx.names, 1)}`,
    )
  } else {
    const baseName = ctx.names.baseConst(nodeId)
    ctx.declarations.push(
      `${INDENT}const ${baseName}: React.CSSProperties = ${serializeStyle(baseStyle, ctx.names, 1)}`,
    )

    const spreads = [
      `...${baseName}`,
      ...conditionals.map(({ test, constName }) => `...(${test} ? ${constName} : null)`),
    ]
    const body = spreads.map((s) => `${pad(2)}${s},`).join("\n")
    ctx.declarations.push(
      `${INDENT}const ${styleName}: React.CSSProperties = {\n${body}\n${INDENT}}`,
    )
  }

  // Pointer deltas become a framer-motion variants map keyed by label.
  const deltas = stateDeltas(ctx, resolved, parent)
  if (deltas.size > 0) {
    const entries: Array<[string, EmitObject]> = [
      [REST_LABEL, restStyle(styleName, baseStyle, deltas, node)],
    ]
    for (const [trigger, delta] of deltas) entries.push([STATE_LABEL[trigger], delta])

    ctx.declarations.push(
      `${INDENT}const ${ctx.names.motionConst(nodeId)} = ${serializeVariants(entries, ctx.names, 1)}`,
    )
  }

  const motion = needsMotion(ctx, resolved, isRoot, deltas.size > 0)
  const tag = elementFor(node, motion)

  const attributes: string[] = [`style=${styleExpression(ctx, nodeId, isRoot, depth)}`]

  if (deltas.size > 0) attributes.push(`variants={${ctx.names.motionConst(nodeId)}}`)

  if (isRoot && ctx.triggers.size > 0) {
    // The root is the only element that listens; children follow the label.
    attributes.push(`initial=${JSON.stringify(REST_LABEL)}`)
    for (const trigger of ["hover", "tap", "focus"] as const) {
      if (!ctx.triggers.has(trigger)) continue
      const label = JSON.stringify(STATE_LABEL[trigger])
      attributes.push(
        ctx.disabledProp
          ? `${MOTION_PROP[trigger]}={${ctx.disabledProp} ? undefined : ${label}}`
          : `${MOTION_PROP[trigger]}=${label}`,
      )
    }
  }

  if (node.type === "frame" && node.onTapPropId) {
    const handler = ctx.names.prop(node.onTapPropId)
    attributes.push(
      ctx.disabledProp
        ? `onTap={${ctx.disabledProp} ? undefined : ${handler}}`
        : `onTap={${handler}}`,
    )
  }

  if (node.type === "image") {
    const src = isBinding(node.src) ? `{${ctx.names.prop(node.src.bind)}}` : JSON.stringify(node.src)
    attributes.push(`src=${src}`)
    attributes.push(`alt=${JSON.stringify(node.alt ?? node.name)}`)
  }

  const attrLines = attributes.map((attr) => `${pad(depth + 1)}${attr}`).join("\n")

  const children = resolved.children.filter(isRendered)
  const text = node.type === "text" ? contentExpression(ctx, node) : ""

  if (node.type === "image" || (children.length === 0 && text === "")) {
    return `${pad(depth)}<${tag}\n${attrLines}\n${pad(depth)}/>`
  }

  const inner =
    node.type === "text"
      ? `${pad(depth + 1)}${text}`
      : children.map((child) => emitNode(ctx, child, depth + 1)).join("\n")

  return `${pad(depth)}<${tag}\n${attrLines}\n${pad(depth)}>\n${inner}\n${pad(depth)}</${tag}>`
}

// ---------------------------------------------------------------------------
// Assembling the file
// ---------------------------------------------------------------------------

function destructuring(doc: ComponentDoc, names: Names): string {
  const parts = doc.props.map((prop) => {
    const name = names.prop(prop.id)
    if (prop.type === "event" || prop.defaultValue === null) return name
    return `${name} = ${JSON.stringify(prop.defaultValue)}`
  })

  // `style` carries Framer's canvas sizing and is always destructured.
  parts.push("style")

  return `const { ${parts.join(", ")} } = props`
}

function propsType(doc: ComponentDoc, names: Names): string {
  const TS: Record<PropDef["type"], string> = {
    text: "string",
    number: "number",
    boolean: "boolean",
    enum: "string",
    color: "string",
    image: "string",
    link: "string",
    event: "() => void",
  }

  const fields = doc.props
    .map((prop) => `${INDENT}${names.prop(prop.id)}?: ${TS[prop.type]}`)
    .join("\n")

  return `interface Props {\n${fields ? `${fields}\n` : ""}${INDENT}style?: React.CSSProperties\n}`
}

/**
 * The design tokens the component references, as a module-level object.
 *
 * Only referenced tokens are emitted: a component that uses three colours
 * should not carry a whole design system into Framer. `as const` keeps the
 * literal types, so a token used where React expects a union still type checks.
 */
function emitTokens(doc: ComponentDoc, names: Names, used: Set<TokenId>): string {
  const referenced = doc.tokens.filter((token) => used.has(token.id))
  if (referenced.length === 0) return ""

  const entries = referenced
    .map((token) => {
      const name = names.token(token.id).replace(/^tokens\./, "")
      const value = typeof token.value === "number" ? String(token.value) : JSON.stringify(token.value)
      const comment = token.description ? ` // ${token.description}` : ""
      return `${INDENT}${key(name)}: ${value},${comment}`
    })
    .join("\n")

  return `const tokens = {\n${entries}\n} as const`
}

export interface EmitResult {
  /** The complete .tsx source. */
  code: string
  /** The exported component's identifier, for the UI to display. */
  componentName: string
}

export function emitComponent(doc: ComponentDoc): EmitResult {
  const tree = resolve(doc)
  const names = buildNames(doc, tree)

  const stateByVariant = new Map<string, StateDef>()
  for (const variant of doc.variants) {
    const { selector } = variant
    if (selector.kind !== "state") continue
    const state = doc.states.find((s) => s.id === selector.stateId)
    if (state) stateByVariant.set(variant.id, state)
  }

  const disabledState = doc.states.find((s) => s.trigger === "disabled")
  const disabledProp =
    disabledState?.propId && doc.props.some((p) => p.id === disabledState.propId)
      ? names.prop(disabledState.propId)
      : null

  // Which pointer triggers the root has to listen for. A hover delta anywhere in
  // the tree means the root needs `whileHover`, since it is the only element
  // whose hover corresponds to hovering the component.
  const triggers = new Set<PointerTrigger>()
  for (const resolved of Object.values(tree.byId)) {
    if (!isRendered(resolved)) continue
    for (const variantId of Object.keys(resolved.variantStyles)) {
      const state = stateByVariant.get(variantId)
      if (state && state.trigger !== "disabled") triggers.add(state.trigger)
    }
  }

  const ctx: EmitContext = {
    tree,
    names,
    usedTokens: new Set(),
    stateByVariant,
    disabledProp,
    triggers,
    declarations: [],
    parents: parentIndex(doc.nodes),
  }

  // `use` is attached here rather than in buildNames so the recorder and the
  // context that owns the set are created together.
  ctx.names.use = (id) => ctx.usedTokens.add(id)

  const jsx = emitNode(ctx, tree.root, 2, true)

  const usesMotion = jsx.includes("<motion.")
  const controls = emitPropertyControls(names.component, doc.props)
  const tokensBlock = emitTokens(doc, names, ctx.usedTokens)

  const imports = [
    `import * as React from "react"`,
    controls ? `import { addPropertyControls, ControlType } from "framer"` : null,
    usesMotion ? `import { motion } from "framer-motion"` : null,
  ]
    .filter(Boolean)
    .join("\n")

  const annotations = [
    "/**",
    doc.description ? ` * ${doc.description}` : null,
    doc.description ? " *" : null,
    ` * @framerSupportedLayoutWidth ${layoutAnnotation(tree.root.node.size.width)}`,
    ` * @framerSupportedLayoutHeight ${layoutAnnotation(tree.root.node.size.height)}`,
    " */",
  ]
    .filter(Boolean)
    .join("\n")

  const body = [
    `${INDENT}${destructuring(doc, names)}`,
    "",
    ...ctx.declarations,
    "",
    `${INDENT}return (`,
    jsx,
    `${INDENT})`,
  ].join("\n")

  const code = [
    imports,
    "",
    tokensBlock || null,
    tokensBlock ? "" : null,
    propsType(doc, names),
    "",
    annotations,
    `export default function ${names.component}(props: Props) {`,
    body,
    "}",
    controls ? "" : null,
    controls || null,
    "",
  ]
    .filter((line) => line !== null)
    .join("\n")

  return { code, componentName: names.component }
}
