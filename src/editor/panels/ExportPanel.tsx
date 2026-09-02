"use client"

/**
 * The export panel: the generated Framer code component, ready to paste.
 *
 * The code shown here is produced by the same emitter the tests compile, and
 * from the same IR the canvas renders — so this panel is the end of the
 * workflow, not a separate render of it.
 */

import * as React from "react"

import { emitComponent } from "@/emit/tsx"
import { useEditor } from "@/editor/store"

import { Button } from "./controls"

export function ExportPanel({ onClose }: { onClose: () => void }) {
  const doc = useEditor((s) => s.doc)
  const [copied, setCopied] = React.useState(false)

  const { code, componentName } = React.useMemo(() => {
    try {
      return emitComponent(doc)
    } catch (error) {
      return {
        code: `// Export failed: ${error instanceof Error ? error.message : String(error)}`,
        componentName: doc.name,
      }
    }
  }, [doc])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be denied; the code is on screen and selectable.
      setCopied(false)
    }
  }

  const download = () => {
    const blob = new Blob([code], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${componentName}.tsx`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-chrome-bg/95 backdrop-blur">
      <header className="flex items-center gap-3 border-b border-chrome-border px-4 py-3">
        <h2 className="text-sm text-chrome-text">
          {componentName}
          <span className="pl-2 text-xs text-chrome-muted">.tsx</span>
        </h2>
        <div className="flex-1" />
        <Button variant="accent" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button onClick={download}>Download</Button>
        <Button onClick={onClose}>Close</Button>
      </header>

      <p className="border-b border-chrome-border px-4 py-2 text-xs text-chrome-muted">
        In Framer: <strong>Assets → Code → New Component</strong>, then replace the file contents
        with this. Property controls appear in the right-hand panel once it compiles.
      </p>

      <pre className="flex-1 overflow-auto p-4 text-xs leading-relaxed text-chrome-text">
        <code data-testid="export-code">{code}</code>
      </pre>
    </div>
  )
}
