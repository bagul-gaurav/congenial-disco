"use client"

/**
 * The canvas: an infinite pan/zoom surface with the document rendered into it.
 *
 * The design is rendered by the same `Preview` the export path uses, so the
 * canvas is never a separate drawing of the document — it *is* the document,
 * with a selection overlay floating above it. Hit-testing reads `data-node-id`
 * off real DOM nodes rather than maintaining a parallel geometry model.
 *
 * Following Paper's feel: no chrome on the surface itself, direct manipulation,
 * and the toolbar sits near what you are working on rather than in a fixed rail.
 */

import * as React from "react"

import { Preview, propValues, type PropValues } from "@/emit/react"
import { useCanvasStates, useEditor } from "@/editor/store"
import { createFrame, createShape, createText, fixed } from "@/model/defaults"
import { insertNode, isFrame, parentOf } from "@/model/ops"
import type { NodeId } from "@/model/types"

import { SelectionOverlay, type NodeRect } from "./SelectionOverlay"

const MIN_ZOOM = 0.1
const MAX_ZOOM = 8

/** Prop values the canvas previews with: defaults, plus the active variant's. */
function useCanvasValues(): PropValues {
  return useEditor((state) => {
    const values = propValues(state.doc)
    const variant = state.doc.variants.find((v) => v.id === state.activeVariantId)
    const selector = variant?.selector

    if (selector?.kind === "prop") {
      // Selecting the "ghost" variant should show you the ghost design.
      const prop = state.doc.props.find((p) => p.id === selector.propId)
      values[selector.propId] =
        prop?.type === "boolean" ? selector.value === "true" : selector.value
    }

    const disabledState = state.doc.states.find((s) => s.trigger === "disabled")
    if (disabledState?.propId && selector?.kind === "state" && selector.stateId === disabledState.id) {
      values[disabledState.propId] = true
    }

    return values
  })
}

export function Canvas() {
  const doc = useEditor((s) => s.doc)
  const viewport = useEditor((s) => s.viewport)
  const setViewport = useEditor((s) => s.setViewport)
  const selection = useEditor((s) => s.selection)
  const select = useEditor((s) => s.select)
  const toggleSelect = useEditor((s) => s.toggleSelect)
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const apply = useEditor((s) => s.apply)
  const editingTextId = useEditor((s) => s.editingTextId)
  const setEditingText = useEditor((s) => s.setEditingText)

  const forcedStates = useCanvasStates()
  const values = useCanvasValues()

  const containerRef = React.useRef<HTMLDivElement>(null)
  const elementsRef = React.useRef(new Map<NodeId, HTMLElement>())
  const [rects, setRects] = React.useState<NodeRect[]>([])
  const [panning, setPanning] = React.useState(false)

  const registerNode = React.useCallback((nodeId: NodeId, element: HTMLElement | null) => {
    if (element) elementsRef.current.set(nodeId, element)
    else elementsRef.current.delete(nodeId)
  }, [])

  /**
   * Measure selected nodes so the overlay can draw over them. Measuring the DOM
   * rather than computing geometry keeps the overlay correct for flex layout,
   * text wrapping and fit-content sizes without reimplementing any of it.
   */
  const measure = React.useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const base = container.getBoundingClientRect()
    const next: NodeRect[] = []

    for (const nodeId of selection) {
      const element = elementsRef.current.get(nodeId)
      if (!element) continue
      const box = element.getBoundingClientRect()
      next.push({
        nodeId,
        x: box.left - base.left,
        y: box.top - base.top,
        width: box.width,
        height: box.height,
      })
    }

    setRects(next)
  }, [selection])

  React.useLayoutEffect(() => {
    measure()
  }, [measure, doc, viewport, forcedStates, values])

  React.useEffect(() => {
    const onResize = () => measure()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [measure])

  // -- viewport --------------------------------------------------------------

  const onWheel = (event: React.WheelEvent) => {
    if (event.ctrlKey || event.metaKey) {
      // Zoom toward the pointer, the way every canvas tool does.
      const container = containerRef.current
      if (!container) return
      const base = container.getBoundingClientRect()
      const px = event.clientX - base.left
      const py = event.clientY - base.top

      const factor = Math.exp(-event.deltaY / 300)
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom * factor))
      const scale = zoom / viewport.zoom

      setViewport({
        zoom,
        x: px - (px - viewport.x) * scale,
        y: py - (py - viewport.y) * scale,
      })
      return
    }

    setViewport({ x: viewport.x - event.deltaX, y: viewport.y - event.deltaY })
  }

  const onPointerDown = (event: React.PointerEvent) => {
    const isPan = event.button === 1 || event.altKey
    if (isPan) {
      setPanning(true)
      ;(event.target as HTMLElement).setPointerCapture(event.pointerId)
      return
    }

    const target = (event.target as HTMLElement).closest("[data-node-id]")
    const nodeId = target?.getAttribute("data-node-id") ?? null

    // A creation tool turns the next click into a new layer.
    if (tool !== "select") {
      const parentId = nodeId && isFrame(doc.nodes[nodeId]) ? nodeId : doc.root
      const node =
        tool === "frame"
          ? createFrame({ name: "Frame" })
          : tool === "text"
            ? createText({ name: "Text" })
            : createShape({
                name: tool === "ellipse" ? "Ellipse" : "Rectangle",
                kind: tool === "ellipse" ? "ellipse" : "rect",
                size: { width: fixed(80), height: fixed(80) },
              })

      apply((current) => insertNode(current, parentId, node))
      select([node.id])
      setTool("select")
      return
    }

    if (!nodeId) {
      select([])
      return
    }

    if (event.shiftKey) toggleSelect(nodeId)
    else select([nodeId])
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!panning) return
    setViewport({ x: viewport.x + event.movementX, y: viewport.y + event.movementY })
  }

  const endPan = () => setPanning(false)

  const onDoubleClick = (event: React.MouseEvent) => {
    const target = (event.target as HTMLElement).closest("[data-node-id]")
    const nodeId = target?.getAttribute("data-node-id")
    if (nodeId && doc.nodes[nodeId]?.type === "text") setEditingText(nodeId)
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-chrome-bg"
      style={{ cursor: panning ? "grabbing" : tool === "select" ? "default" : "crosshair" }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerLeave={endPan}
      onDoubleClick={onDoubleClick}
    >
      <GridBackground viewport={viewport} />

      <div
        className="absolute origin-top-left"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        }}
      >
        <Preview
          doc={doc}
          values={values}
          forcedStates={forcedStates}
          // The canvas drives states explicitly; live hover here would fight
          // with selecting and dragging layers.
          interactive={false}
          onNodeRef={registerNode}
        />
      </div>

      <SelectionOverlay
        rects={rects}
        parentIsAbsolute={selection.every((id) => {
          const parent = parentOf(doc, id)
          return parent ? parent.layout.mode === "absolute" : false
        })}
      />

      {editingTextId && (
        <InlineTextEditor
          nodeId={editingTextId}
          rect={rects.find((r) => r.nodeId === editingTextId)}
        />
      )}
    </div>
  )
}

/** A dot grid that scales with the viewport, for orientation while panning. */
function GridBackground({ viewport }: { viewport: { x: number; y: number; zoom: number } }) {
  const size = 24 * viewport.zoom
  if (size < 6) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-40"
      style={{
        backgroundImage: "radial-gradient(circle, #2a2a33 1px, transparent 1px)",
        backgroundSize: `${size}px ${size}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
      }}
    />
  )
}

/**
 * Inline text editing. The textarea floats exactly over the layer, so editing
 * happens in place rather than in a side panel.
 */
function InlineTextEditor({ nodeId, rect }: { nodeId: NodeId; rect?: NodeRect }) {
  const doc = useEditor((s) => s.doc)
  const edit = useEditor((s) => s.edit)
  const setEditingText = useEditor((s) => s.setEditingText)

  const node = doc.nodes[nodeId]
  const initial = node?.type === "text" && typeof node.content === "string" ? node.content : ""
  const [value, setValue] = React.useState(initial)

  React.useEffect(() => setValue(initial), [initial, nodeId])

  if (!rect || node?.type !== "text") return null

  const commit = () => {
    edit(nodeId, { content: value })
    setEditingText(null)
  }

  return (
    <textarea
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Escape") setEditingText(null)
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) commit()
      }}
      className="absolute z-20 resize-none rounded border border-chrome-accent bg-white p-0 text-black outline-none"
      style={{
        left: rect.x,
        top: rect.y,
        width: Math.max(rect.width, 40),
        height: Math.max(rect.height, 20),
      }}
    />
  )
}
