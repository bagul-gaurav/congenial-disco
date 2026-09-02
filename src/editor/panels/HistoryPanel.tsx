"use client"

/**
 * Version history and sharing.
 *
 * Snapshots are taken automatically as you save, throttled server-side so a
 * long editing session leaves a readable history rather than one entry per
 * keystroke. Restoring snapshots the current document first, so a restore is
 * itself undoable.
 */

import * as React from "react"

import { useEditor } from "@/editor/store"
import type { ComponentDoc } from "@/model/types"

import { Button } from "./controls"
import { PanelHeading } from "./LayerTree"

interface Version {
  id: string
  name: string
  label: string | null
  createdAt: string
}

export function HistoryPanel({ componentId, onClose }: { componentId: string; onClose: () => void }) {
  const replaceDoc = useEditor((s) => s.replaceDoc)
  const markClean = useEditor((s) => s.markClean)
  const doc = useEditor((s) => s.doc)
  const dirty = useEditor((s) => s.dirty)

  const [versions, setVersions] = React.useState<Version[] | null>(null)
  const [shareUrl, setShareUrl] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/components/${componentId}/versions`)
      if (!response.ok) throw new Error(`Could not load history (${response.status})`)
      setVersions((await response.json()) as Version[])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load history")
    }
  }, [componentId])

  // Sharing is a property of the component, not of this panel, so its current
  // state has to be read back — otherwise reopening the panel offers to create
  // a link for a component that already has one.
  const loadShare = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/components/${componentId}/share`)
      if (!response.ok) return
      const body = (await response.json()) as { path: string | null }
      setShareUrl(body.path ? new URL(body.path, window.location.origin).toString() : null)
    } catch {
      // Sharing state is not essential to the rest of the panel.
    }
  }, [componentId])

  React.useEffect(() => {
    void load()
    void loadShare()
  }, [load, loadShare])

  /**
   * Pushes the in-memory document to the server.
   *
   * A snapshot reads whatever the server currently holds, so without this a
   * version saved seconds after an edit would capture the state from *before*
   * it — autosave is debounced and may not have fired yet.
   */
  const flush = React.useCallback(async () => {
    if (!dirty) return
    const response = await fetch(`/api/components/${componentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc }),
    })
    if (!response.ok) throw new Error(`Could not save your changes (${response.status})`)
    markClean()
  }, [componentId, dirty, doc, markClean])

  const snapshot = async () => {
    setBusy(true)
    setError(null)
    try {
      await flush()
      const response = await fetch(`/api/components/${componentId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Manual save" }),
      })
      if (!response.ok) throw new Error(`Could not save a version (${response.status})`)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save a version")
    } finally {
      setBusy(false)
    }
  }

  const restore = async (versionId: string) => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/components/${componentId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      })
      if (!response.ok) throw new Error(`Could not restore (${response.status})`)

      const body = (await response.json()) as { doc: ComponentDoc }
      // Keeps the undo stack: restoring is a normal edit you can walk back from.
      replaceDoc(body.doc)
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restore")
    } finally {
      setBusy(false)
    }
  }

  const share = async (enable: boolean) => {
    setBusy(true)
    setError(null)
    try {
      // Handing someone a link that serves a document older than the one on
      // your screen is worse than a slow click, so pending edits go first.
      if (enable) await flush()

      const response = await fetch(`/api/components/${componentId}/share`, {
        method: enable ? "POST" : "DELETE",
      })
      if (!response.ok) throw new Error(`Sharing failed (${response.status})`)

      if (!enable) {
        setShareUrl(null)
        // Nothing else to read back: the token is gone.
      } else {
        const body = (await response.json()) as { path: string }
        setShareUrl(new URL(body.path, window.location.origin).toString())
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sharing failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-chrome-bg/95 backdrop-blur">
      <header className="flex items-center gap-3 border-b border-chrome-border px-4 py-3">
        <h2 className="text-sm">History &amp; sharing</h2>
        <div className="flex-1" />
        <Button data-testid="snapshot" disabled={busy} onClick={snapshot}>
          Save a version
        </Button>
        <Button onClick={onClose}>Close</Button>
      </header>

      {error && <p className="border-b border-chrome-border px-4 py-2 text-xs text-red-400">{error}</p>}

      <section className="border-b border-chrome-border px-4 py-3">
        <h3 className="pb-1 text-[11px] font-medium uppercase tracking-wide text-chrome-muted">
          Share a read-only link
        </h3>
        {shareUrl ? (
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={shareUrl}
              data-testid="share-url"
              onFocus={(event) => event.currentTarget.select()}
              className="flex-1 rounded border border-chrome-border bg-chrome-panel px-2 py-1 text-xs"
            />
            <Button disabled={busy} onClick={() => share(false)}>
              Revoke
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="flex-1 text-xs text-chrome-muted">
              Anyone with the link can see the component running and copy its code. They cannot
              edit it.
            </p>
            <Button variant="accent" data-testid="enable-share" disabled={busy} onClick={() => share(true)}>
              Create link
            </Button>
          </div>
        )}
      </section>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {dirty && (
          <p className="pb-2 text-xs text-chrome-muted">
            You have unsaved changes. Saving a version stores them first.
          </p>
        )}

        {versions === null && <p className="text-xs text-chrome-muted">Loading…</p>}
        {versions?.length === 0 && (
          <p className="text-xs text-chrome-muted">
            No versions yet. One is recorded automatically as you keep editing.
          </p>
        )}

        <ul className="divide-y divide-chrome-border">
          {versions?.map((version) => (
            <li
              key={version.id}
              data-testid="version-row"
              className="flex items-center gap-3 py-2 text-xs"
            >
              <span className="flex-1 truncate">
                {version.label ?? "Autosave"}
                <span className="pl-2 text-chrome-muted">{version.name}</span>
              </span>
              <span className="text-chrome-muted">
                {new Date(version.createdAt).toLocaleString()}
              </span>
              <Button disabled={busy} onClick={() => restore(version.id)}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
