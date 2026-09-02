"use client"

/**
 * The one path a document takes to the server.
 *
 * Autosave and the history panel both need to push the current document — the
 * panel because a snapshot or a share link taken seconds after an edit would
 * otherwise capture the state from before it. Two copies of the request meant
 * two places to keep the revision handling right, so they share this.
 *
 * Saves the whole document rather than a patch stream: documents are small, and
 * a full write cannot get out of sync with the client the way a missed patch
 * can. When multiplayer arrives this is the seam that changes.
 */

import { useEditor } from "./store"

export type SaveOutcome =
  /** Written; the store now holds the new revision. */
  | { status: "saved" }
  /** Nothing to write. */
  | { status: "clean" }
  /** The stored document moved on. Saving stops until the editor reloads. */
  | { status: "conflict" }
  /** Network or server error. The document stays dirty so the next attempt retries. */
  | { status: "failed"; message: string }

/**
 * Pushes the current document, if it differs from what was last persisted.
 *
 * The document sent is read at call time and handed back to `markSaved`, which
 * clears the dirty flag only if it is still the document on screen. An edit
 * made while the request was in flight therefore stays dirty and gets its own
 * save, rather than being marked as persisted by a response that predates it.
 */
export async function saveDoc(componentId: string): Promise<SaveOutcome> {
  const { doc, dirty, revision, conflicted, markSaved, markConflicted } = useEditor.getState()

  if (conflicted) return { status: "conflict" }
  if (!dirty) return { status: "clean" }

  let response: Response
  try {
    response = await fetch(`/api/components/${componentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc, revision }),
    })
  } catch (cause) {
    return { status: "failed", message: cause instanceof Error ? cause.message : "Save failed" }
  }

  if (response.status === 409) {
    markConflicted()
    return { status: "conflict" }
  }

  if (!response.ok) {
    return { status: "failed", message: `Save failed (${response.status})` }
  }

  const body = (await response.json()) as { revision?: number }
  markSaved(doc, body.revision ?? revision + 1)
  return { status: "saved" }
}
