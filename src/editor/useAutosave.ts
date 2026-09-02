"use client"

/**
 * Debounced autosave.
 *
 * Saves the whole document rather than a patch stream: documents are small, and
 * a full write cannot get out of sync with the client the way a missed patch
 * can. When multiplayer arrives this is the seam that changes.
 */

import * as React from "react"

import { useEditor } from "./store"

const DEBOUNCE_MS = 800

export type SaveStatus = "Saved" | "Saving…" | "Unsaved changes" | "Save failed"

export function useAutosave(componentId: string): SaveStatus {
  const doc = useEditor((s) => s.doc)
  const dirty = useEditor((s) => s.dirty)
  const markClean = useEditor((s) => s.markClean)

  const [status, setStatus] = React.useState<SaveStatus>("Saved")
  // Held in a ref so a save in flight always writes the newest document.
  const latest = React.useRef(doc)
  latest.current = doc

  React.useEffect(() => {
    if (!dirty) return

    setStatus("Unsaved changes")
    const timer = setTimeout(async () => {
      setStatus("Saving…")
      try {
        const response = await fetch(`/api/components/${componentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc: latest.current }),
        })
        if (!response.ok) throw new Error(`Save failed (${response.status})`)
        setStatus("Saved")
        markClean()
      } catch {
        // Keep the document dirty so the next edit retries the save.
        setStatus("Save failed")
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [doc, dirty, componentId, markClean])

  return status
}
