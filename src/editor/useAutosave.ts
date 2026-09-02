"use client"

/**
 * Debounced autosave.
 *
 * The request itself lives in `save.ts`, shared with the history panel. What is
 * here is the schedule: wait for a pause in editing, write, and — this is the
 * part that is easy to get wrong — keep trying if the write fails.
 *
 * A failed save used to leave the document dirty and wait for the next edit to
 * retry. That is fine while you are typing and silently lossy the moment you
 * stop, which is exactly when a laptop lid closes. So a failure counts as an
 * attempt and re-runs this effect, backing off so a server that is down does
 * not get hammered.
 */

import * as React from "react"

import { saveDoc } from "./save"
import { useEditor } from "./store"

const DEBOUNCE_MS = 800
const BACKOFF_MS = [2_000, 5_000, 15_000]

export type SaveStatus =
  | "Saved"
  | "Saving…"
  | "Unsaved changes"
  | "Save failed — retrying"
  | "Edited elsewhere — reload"

export function useAutosave(componentId: string): SaveStatus {
  const doc = useEditor((s) => s.doc)
  const dirty = useEditor((s) => s.dirty)
  const conflicted = useEditor((s) => s.conflicted)

  const [status, setStatus] = React.useState<SaveStatus>("Saved")
  /** Consecutive failed attempts. Bumping it re-runs the effect, which is the retry. */
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    if (conflicted) {
      setStatus("Edited elsewhere — reload")
      return
    }
    if (!dirty) {
      setStatus("Saved")
      return
    }

    // A failed attempt waits longer than a fresh edit does, so a run of
    // failures backs off rather than retrying every 800ms.
    const delay = attempt === 0 ? DEBOUNCE_MS : BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]
    setStatus(attempt === 0 ? "Unsaved changes" : "Save failed — retrying")

    let cancelled = false
    const timer = setTimeout(async () => {
      if (!cancelled) setStatus("Saving…")
      const outcome = await saveDoc(componentId)
      if (cancelled) return

      if (outcome.status === "conflict") {
        setStatus("Edited elsewhere — reload")
        return
      }

      if (outcome.status === "failed") {
        setAttempt((n) => n + 1)
        return
      }

      setAttempt(0)
      // `saveDoc` clears the dirty flag only when the document it sent is still
      // the current one, so an edit made mid-request leaves the store dirty and
      // this effect re-runs to save it.
      setStatus(useEditor.getState().dirty ? "Unsaved changes" : "Saved")
    }, delay)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [doc, dirty, conflicted, attempt, componentId])

  return status
}

/**
 * Warns before leaving with work that has not reached the server.
 *
 * Autosave is debounced and can be mid-retry, so closing the tab a second after
 * an edit loses it with no other signal that anything was wrong.
 */
export function useUnloadGuard(): void {
  React.useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!useEditor.getState().dirty) return
      event.preventDefault()
      // Older browsers need the assignment; the message itself is not shown.
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])
}
