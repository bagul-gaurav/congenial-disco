/**
 * Editor state.
 *
 * The document itself is immutable and every change goes through `src/model/ops`,
 * so undo/redo is just keeping the previous documents around — there is no
 * inverse-operation machinery to get wrong.
 *
 * The one subtle rule lives in `edit()`: when a variant is active, a property
 * change is recorded as an *override on that variant* rather than a change to
 * the base design. That is what makes "edit the base, everything follows" work.
 */

import { useMemo } from "react"
import { create } from "zustand"

import { createDoc } from "@/model/defaults"
import * as ops from "@/model/ops"
import type {
  ComponentDoc,
  NodeId,
  NodeOverride,
  StateTrigger,
  VariantId,
} from "@/model/types"

/** How many documents of history to keep. Documents are small; 100 is generous. */
const HISTORY_LIMIT = 100

export type Tool = "select" | "frame" | "text" | "rect" | "ellipse"

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface EditorState {
  doc: ComponentDoc
  past: ComponentDoc[]
  future: ComponentDoc[]

  selection: NodeId[]
  /** The variant being edited, or null for the base design. */
  activeVariantId: VariantId | null
  /** States forced on in the canvas so you can see what they look like. */
  forcedStates: StateTrigger[]
  tool: Tool
  viewport: Viewport
  /** Node currently being text-edited inline. */
  editingTextId: NodeId | null
  /** Set when the document differs from what was last persisted. */
  dirty: boolean
  /**
   * The revision the server held when this document was last read or written.
   * Sent back on every save so a write that would clobber someone else's is
   * refused rather than silently winning.
   */
  revision: number
  /**
   * Set when the server refused a save because the stored document moved on —
   * another tab, or another person once there is more than one. Saving stops
   * until the document is reloaded, because the alternative is overwriting
   * work with a document that never saw it.
   */
  conflicted: boolean

  // -- document --------------------------------------------------------------
  /** Apply a document operation, pushing the previous document onto the undo stack. */
  apply: (fn: (doc: ComponentDoc) => ComponentDoc) => void
  /**
   * Apply a *node property* change, routed to the active variant as an override
   * when one is active. Panels should call this rather than `apply` so that
   * editing while a variant is selected does not silently rewrite the base.
   */
  edit: (nodeId: NodeId, override: NodeOverride) => void
  replaceDoc: (doc: ComponentDoc, options?: { resetHistory?: boolean; revision?: number }) => void
  /**
   * Records a successful save.
   *
   * Clears `dirty` only when the document that was saved is still the one on
   * screen: an edit made while the request was in flight is *not* on the
   * server, and clearing the flag for it drops that edit until the next
   * unrelated change happens to trigger another save.
   */
  markSaved: (saved: ComponentDoc, revision: number) => void
  markConflicted: () => void

  undo: () => void
  redo: () => void

  // -- selection & view ------------------------------------------------------
  select: (ids: NodeId[]) => void
  toggleSelect: (id: NodeId) => void
  setActiveVariant: (id: VariantId | null) => void
  toggleForcedState: (trigger: StateTrigger) => void
  setTool: (tool: Tool) => void
  setViewport: (viewport: Partial<Viewport>) => void
  setEditingText: (id: NodeId | null) => void
}

function pushHistory(past: ComponentDoc[], doc: ComponentDoc): ComponentDoc[] {
  const next = [...past, doc]
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next
}

export const useEditor = create<EditorState>((set, get) => ({
  doc: createDoc(),
  past: [],
  future: [],

  selection: [],
  activeVariantId: null,
  forcedStates: [],
  tool: "select",
  viewport: { x: 0, y: 0, zoom: 1 },
  editingTextId: null,
  dirty: false,
  revision: 0,
  conflicted: false,

  apply: (fn) =>
    set((state) => {
      const next = fn(state.doc)
      if (next === state.doc) return state // a no-op must not consume an undo step
      return {
        doc: next,
        past: pushHistory(state.past, state.doc),
        future: [],
        dirty: true,
      }
    }),

  edit: (nodeId, override) => {
    const { activeVariantId, apply } = get()

    if (activeVariantId) {
      apply((doc) => ops.setOverride(doc, activeVariantId, nodeId, override))
      return
    }

    // Editing the base design: unpack the override onto the node itself.
    apply((doc) => {
      let next = doc
      if (override.style) next = ops.setNodeStyle(next, nodeId, override.style)
      if (override.size) next = ops.setNodeSize(next, nodeId, override.size)
      if (override.position) next = ops.setNodePosition(next, nodeId, override.position)
      if (override.layout) next = ops.setNodeLayout(next, nodeId, override.layout)
      if (override.hidden !== undefined) next = ops.setNodeHidden(next, nodeId, override.hidden)
      if (override.content !== undefined) next = ops.setTextContent(next, nodeId, override.content)
      return next
    })
  },

  replaceDoc: (doc, options) =>
    set((state) => ({
      doc,
      past: options?.resetHistory ? [] : pushHistory(state.past, state.doc),
      future: [],
      selection: state.selection.filter((id) => id in doc.nodes),
      activeVariantId: doc.variants.some((v) => v.id === state.activeVariantId)
        ? state.activeVariantId
        : null,
      dirty: false,
      revision: options?.revision ?? state.revision,
      conflicted: false,
    })),

  markSaved: (saved, revision) =>
    set((state) => ({
      revision,
      dirty: state.doc === saved ? false : state.dirty,
    })),

  markConflicted: () => set({ conflicted: true }),

  undo: () =>
    set((state) => {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return {
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
        selection: state.selection.filter((id) => id in previous.nodes),
        dirty: true,
      }
    }),

  redo: () =>
    set((state) => {
      const [next, ...rest] = state.future
      if (!next) return state
      return {
        doc: next,
        past: pushHistory(state.past, state.doc),
        future: rest,
        selection: state.selection.filter((id) => id in next.nodes),
        dirty: true,
      }
    }),

  select: (ids) => set({ selection: ids, editingTextId: null }),

  toggleSelect: (id) =>
    set((state) => ({
      selection: state.selection.includes(id)
        ? state.selection.filter((s) => s !== id)
        : [...state.selection, id],
    })),

  setActiveVariant: (id) => set({ activeVariantId: id }),

  toggleForcedState: (trigger) =>
    set((state) => ({
      forcedStates: state.forcedStates.includes(trigger)
        ? state.forcedStates.filter((t) => t !== trigger)
        : [...state.forcedStates, trigger],
    })),

  setTool: (tool) => set({ tool }),

  setViewport: (viewport) => set((state) => ({ viewport: { ...state.viewport, ...viewport } })),

  setEditingText: (id) => set({ editingTextId: id }),
}))

/** The variant currently being edited, if any. */
export function useActiveVariant() {
  return useEditor((state) =>
    state.activeVariantId
      ? (state.doc.variants.find((v) => v.id === state.activeVariantId) ?? null)
      : null,
  )
}

/** The single selected node, or null when the selection is empty or multiple. */
export function useSelectedNode() {
  return useEditor((state) =>
    state.selection.length === 1 ? (state.doc.nodes[state.selection[0]] ?? null) : null,
  )
}

/**
 * States to show on the canvas: whatever the user pinned, plus the state the
 * active variant is designed for — selecting the hover variant should show you
 * the hover design without a second click.
 *
 * Composed with `useMemo` over stable slices. Returning a freshly built array
 * straight from a selector makes zustand see a new snapshot on every render and
 * loop forever.
 */
export function useCanvasStates(): StateTrigger[] {
  const doc = useEditor((s) => s.doc)
  const forcedStates = useEditor((s) => s.forcedStates)
  const activeVariantId = useEditor((s) => s.activeVariantId)

  return useMemo(() => {
    const forced = [...forcedStates]
    const selector = doc.variants.find((v) => v.id === activeVariantId)?.selector
    if (selector?.kind === "state") {
      const stateDef = doc.states.find((s) => s.id === selector.stateId)
      if (stateDef && stateDef.trigger !== "disabled" && !forced.includes(stateDef.trigger)) {
        forced.push(stateDef.trigger)
      }
    }
    return forced
  }, [doc, forcedStates, activeVariantId])
}
