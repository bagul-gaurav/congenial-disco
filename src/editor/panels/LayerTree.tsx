"use client"

/**
 * The layer tree. Also the place structural edits happen — reordering, nesting
 * and deletion — since dragging inside a stack on the canvas would fight with
 * the layout engine rather than cooperate with it.
 */

import * as React from "react"

import { useEditor } from "@/editor/store"
import { isFrame, parentOf, removeNode, reorderChild } from "@/model/ops"
import type { ComponentDoc, Node, NodeId } from "@/model/types"

const TYPE_GLYPH: Record<Node["type"], string> = {
  frame: "▤",
  text: "T",
  image: "▨",
  shape: "◻",
}

function rows(doc: ComponentDoc, nodeId: NodeId, depth: number): Array<{ node: Node; depth: number }> {
  const node = doc.nodes[nodeId]
  if (!node) return []

  const out = [{ node, depth }]
  if (isFrame(node)) {
    for (const childId of node.children) out.push(...rows(doc, childId, depth + 1))
  }
  return out
}

export function LayerTree() {
  const doc = useEditor((s) => s.doc)
  const selection = useEditor((s) => s.selection)
  const select = useEditor((s) => s.select)
  const apply = useEditor((s) => s.apply)
  const edit = useEditor((s) => s.edit)
  const activeVariantId = useEditor((s) => s.activeVariantId)

  const items = rows(doc, doc.root, 0)

  const move = (nodeId: NodeId, delta: number) => {
    const parent = parentOf(doc, nodeId)
    if (!parent) return
    const index = parent.children.indexOf(nodeId)
    apply((current) => reorderChild(current, nodeId, index + delta))
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeading>Layers</PanelHeading>
      <div className="flex-1 overflow-y-auto py-1">
        {items.map(({ node, depth }) => {
          const selected = selection.includes(node.id)
          return (
            <div
              key={node.id}
              className={`group flex items-center gap-2 px-2 py-1 text-xs ${
                selected ? "bg-chrome-accent/20 text-chrome-text" : "text-chrome-muted hover:bg-white/5"
              }`}
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => select([node.id])}
            >
              <span className="w-3 text-center opacity-60">{TYPE_GLYPH[node.type]}</span>
              <span className={`flex-1 truncate ${node.hidden ? "opacity-40" : ""}`}>{node.name}</span>

              <button
                type="button"
                title={node.hidden ? "Show" : "Hide"}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation()
                  // Routed through `edit` so hiding a layer inside a variant is
                  // recorded as that variant's override, not a base change.
                  edit(node.id, { hidden: !node.hidden })
                }}
              >
                {node.hidden ? "○" : "●"}
              </button>

              {node.id !== doc.root && !activeVariantId && (
                <>
                  <button
                    type="button"
                    title="Move up"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation()
                      move(node.id, -1)
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation()
                      apply((current) => removeNode(current, node.id))
                      select([])
                    }}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-chrome-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-chrome-muted">
      {children}
    </div>
  )
}
