"use client"

/**
 * Selection chrome drawn over the canvas.
 *
 * The overlay works from measured DOM rectangles, so it lines up with whatever
 * flexbox and text layout actually produced. Dragging converts screen deltas
 * back into document units by dividing by the zoom.
 */

import * as React from "react"

import { useEditor } from "@/editor/store"
import { fixed } from "@/model/defaults"
import type { NodeId } from "@/model/types"

export interface NodeRect {
  nodeId: NodeId
  x: number
  y: number
  width: number
  height: number
}

/** The eight resize handles, as unit offsets within the selection box. */
const HANDLES = [
  { id: "nw", x: 0, y: 0, cursor: "nwse-resize" },
  { id: "n", x: 0.5, y: 0, cursor: "ns-resize" },
  { id: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { id: "e", x: 1, y: 0.5, cursor: "ew-resize" },
  { id: "se", x: 1, y: 1, cursor: "nwse-resize" },
  { id: "s", x: 0.5, y: 1, cursor: "ns-resize" },
  { id: "sw", x: 0, y: 1, cursor: "nesw-resize" },
  { id: "w", x: 0, y: 0.5, cursor: "ew-resize" },
] as const

type HandleId = (typeof HANDLES)[number]["id"]

interface DragState {
  nodeId: NodeId
  handle: HandleId | "body"
  startX: number
  startY: number
  startWidth: number
  startHeight: number
  originX: number
  originY: number
}

export interface SelectionOverlayProps {
  rects: NodeRect[]
  /** Whether every selected node sits in an absolutely-positioned parent. */
  parentIsAbsolute: boolean
}

export function SelectionOverlay({ rects, parentIsAbsolute }: SelectionOverlayProps) {
  const zoom = useEditor((s) => s.viewport.zoom)
  const edit = useEditor((s) => s.edit)
  const doc = useEditor((s) => s.doc)

  const [drag, setDrag] = React.useState<DragState | null>(null)

  const beginDrag = (
    event: React.PointerEvent,
    rect: NodeRect,
    handle: HandleId | "body",
  ) => {
    event.stopPropagation()
    event.preventDefault()
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)

    const node = doc.nodes[rect.nodeId]
    setDrag({
      nodeId: rect.nodeId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width / zoom,
      startHeight: rect.height / zoom,
      originX: node?.position.x ?? 0,
      originY: node?.position.y ?? 0,
    })
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag) return

    // Screen pixels → document units.
    const dx = (event.clientX - drag.startX) / zoom
    const dy = (event.clientY - drag.startY) / zoom

    if (drag.handle === "body") {
      // Only meaningful inside an absolute parent; a stack decides its own
      // child positions, so dragging there would be silently ignored.
      if (!parentIsAbsolute) return
      edit(drag.nodeId, {
        position: { x: Math.round(drag.originX + dx), y: Math.round(drag.originY + dy) },
      })
      return
    }

    const grows = { e: 1, w: -1, n: 0, s: 0, ne: 1, nw: -1, se: 1, sw: -1 }
    const growsY = { n: -1, s: 1, e: 0, w: 0, ne: -1, nw: -1, se: 1, sw: 1 }

    const width = Math.max(1, Math.round(drag.startWidth + dx * grows[drag.handle]))
    const height = Math.max(1, Math.round(drag.startHeight + dy * growsY[drag.handle]))

    const size: { width?: ReturnType<typeof fixed>; height?: ReturnType<typeof fixed> } = {}
    if (grows[drag.handle] !== 0) size.width = fixed(width)
    if (growsY[drag.handle] !== 0) size.height = fixed(height)

    // Dragging a handle commits to an explicit size — that is what the gesture
    // means, even if the layer previously hugged its contents.
    edit(drag.nodeId, { size })
  }

  const endDrag = () => setDrag(null)

  if (rects.length === 0) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {rects.map((rect) => (
        <div
          key={rect.nodeId}
          className="pointer-events-auto absolute border border-chrome-accent"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            cursor: parentIsAbsolute ? "move" : "default",
          }}
          onPointerDown={(event) => beginDrag(event, rect, "body")}
        >
          {HANDLES.map((handle) => (
            <div
              key={handle.id}
              className="absolute h-2 w-2 rounded-sm border border-chrome-accent bg-white"
              style={{
                left: `calc(${handle.x * 100}% - 4px)`,
                top: `calc(${handle.y * 100}% - 4px)`,
                cursor: handle.cursor,
              }}
              onPointerDown={(event) => beginDrag(event, rect, handle.id)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
