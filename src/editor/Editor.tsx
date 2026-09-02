"use client"

/**
 * The editor shell.
 *
 * Layout follows the workflow left to right: define the component (spec), see
 * the design (canvas, with the variant switcher above it), adjust the selected
 * layer (properties). Export is a full-surface overlay because it is the end of
 * the loop, not a panel you keep open.
 */

import * as React from "react"

import { Canvas } from "@/editor/canvas/Canvas"
import { ExportPanel } from "@/editor/panels/ExportPanel"
import { LayerTree } from "@/editor/panels/LayerTree"
import { PropertiesPanel } from "@/editor/panels/PropertiesPanel"
import { SpecPanel } from "@/editor/panels/SpecPanel"
import { VariantBar } from "@/editor/panels/VariantBar"
import { Button } from "@/editor/panels/controls"
import { useEditor, type Tool } from "@/editor/store"
import { removeNode } from "@/model/ops"
import type { ComponentDoc } from "@/model/types"

import { useAutosave } from "./useAutosave"

const TOOLS: Array<{ id: Tool; label: string; shortcut: string }> = [
  { id: "select", label: "Select", shortcut: "V" },
  { id: "frame", label: "Frame", shortcut: "F" },
  { id: "text", label: "Text", shortcut: "T" },
  { id: "rect", label: "Rect", shortcut: "R" },
  { id: "ellipse", label: "Ellipse", shortcut: "O" },
]

export interface EditorProps {
  componentId: string
  initialDoc: ComponentDoc
}

export function Editor({ componentId, initialDoc }: EditorProps) {
  const replaceDoc = useEditor((s) => s.replaceDoc)
  const [showExport, setShowExport] = React.useState(false)

  // Load the document once, without leaving an undo step that would let the
  // user "undo" back to a blank starter document.
  React.useEffect(() => {
    replaceDoc(initialDoc, { resetHistory: true })
  }, [initialDoc, replaceDoc])

  const status = useAutosave(componentId)
  useKeyboardShortcuts({ onExport: () => setShowExport(true) })

  return (
    <div className="flex h-screen flex-col bg-chrome-bg text-chrome-text">
      <Toolbar status={status} onExport={() => setShowExport(true)} />

      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 border-r border-chrome-border bg-chrome-panel">
          <SpecPanel />
        </aside>

        <main className="relative flex min-w-0 flex-1 flex-col">
          <VariantBar />
          <div className="min-h-0 flex-1">
            <Canvas />
          </div>
          {showExport && <ExportPanel onClose={() => setShowExport(false)} />}
        </main>

        <aside className="flex w-72 shrink-0 flex-col border-l border-chrome-border bg-chrome-panel">
          <div className="h-1/2 min-h-0 border-b border-chrome-border">
            <LayerTree />
          </div>
          <div className="h-1/2 min-h-0">
            <PropertiesPanel />
          </div>
        </aside>
      </div>
    </div>
  )
}

function Toolbar({ status, onExport }: { status: string; onExport: () => void }) {
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const name = useEditor((s) => s.doc.name)

  return (
    <header className="flex items-center gap-2 border-b border-chrome-border bg-chrome-panel px-3 py-2">
      <span className="pr-2 text-sm font-medium">{name || "Untitled"}</span>

      {TOOLS.map((entry) => (
        <button
          key={entry.id}
          type="button"
          data-testid={`tool-${entry.id}`}
          title={`${entry.label} (${entry.shortcut})`}
          onClick={() => setTool(entry.id)}
          className={`rounded px-2 py-1 text-xs transition ${
            tool === entry.id ? "bg-chrome-accent text-white" : "text-chrome-muted hover:bg-white/5"
          }`}
        >
          {entry.label}
        </button>
      ))}

      <span className="px-2 text-chrome-border">|</span>

      <Button disabled={!canUndo} onClick={undo}>
        Undo
      </Button>
      <Button disabled={!canRedo} onClick={redo}>
        Redo
      </Button>

      <div className="flex-1" />

      <span className="text-xs text-chrome-muted">{status}</span>
      <Button variant="accent" data-testid="export-open" onClick={onExport}>
        Export to Framer
      </Button>
    </header>
  )
}

function useKeyboardShortcuts({ onExport }: { onExport: () => void }) {
  const store = useEditor

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      // Never steal keys from a field the user is typing in.
      if (target.matches("input, textarea, select, [contenteditable]")) return

      const state = store.getState()
      const mod = event.metaKey || event.ctrlKey

      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
        return
      }

      if (mod && event.key.toLowerCase() === "e") {
        event.preventDefault()
        onExport()
        return
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        if (state.selection.length === 0) return
        event.preventDefault()
        state.apply((doc) => state.selection.reduce((acc, id) => removeNode(acc, id), doc))
        state.select([])
        return
      }

      if (event.key === "Escape") {
        state.select([])
        state.setTool("select")
        return
      }

      const tool = TOOLS.find((entry) => entry.shortcut.toLowerCase() === event.key.toLowerCase())
      if (tool && !mod) state.setTool(tool.id)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [store, onExport])
}
