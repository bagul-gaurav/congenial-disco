/**
 * The save path.
 *
 * Two behaviours here are worth a test each because both fail silently and both
 * lose work: an edit made while a save is in flight must not be marked as
 * saved, and a save the server refuses as stale must stop the loop rather than
 * retrying its way over someone else's document.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { saveDoc } from "@/editor/save"
import { useEditor } from "@/editor/store"
import { createDoc } from "@/model/defaults"

function reset() {
  const doc = createDoc("Test")
  useEditor.setState({
    doc,
    past: [],
    future: [],
    selection: [],
    activeVariantId: null,
    forcedStates: [],
    dirty: false,
    revision: 3,
    conflicted: false,
  })
  return doc
}

/** A fetch whose response the test releases when it chooses. */
function deferredFetch(body: unknown, status = 200) {
  let release: () => void = () => {}
  const started = new Promise<void>((resolve) => {
    release = () => resolve()
  })

  const fetchMock = vi.fn(async () => {
    await started
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  })

  return { fetchMock, release: () => release() }
}

describe("saveDoc", () => {
  beforeEach(() => {
    reset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("does nothing when there is nothing to save", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    await expect(saveDoc("c1")).resolves.toEqual({ status: "clean" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends the document with the revision it is based on", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ revision: 4 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const doc = useEditor.getState().doc
    useEditor.setState({ dirty: true })

    await expect(saveDoc("c1")).resolves.toEqual({ status: "saved" })

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init.body)) as { doc: { id: string }; revision: number }
    expect(body.revision).toBe(3)
    expect(body.doc.id).toBe(doc.id)
    // The revision the server reported, so the next save is conditional on it.
    expect(useEditor.getState().revision).toBe(4)
    expect(useEditor.getState().dirty).toBe(false)
  })

  it("keeps an edit made while the save was in flight", async () => {
    const { fetchMock, release } = deferredFetch({ revision: 4 })
    vi.stubGlobal("fetch", fetchMock)

    const first = useEditor.getState().doc
    useEditor.setState({ dirty: true })

    const inFlight = saveDoc("c1")

    // The user keeps working while the request is open. This document is *not*
    // the one being written, so the response must not mark it saved.
    useEditor.getState().edit(first.root, { style: { fill: "#ff0000" } })
    expect(useEditor.getState().doc).not.toBe(first)

    release()
    await inFlight

    expect(useEditor.getState().revision).toBe(4)
    expect(useEditor.getState().dirty).toBe(true)
  })

  it("stops saving once the server reports a conflict", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: "changed elsewhere", revision: 9 }, { status: 409 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    useEditor.setState({ dirty: true })
    await expect(saveDoc("c1")).resolves.toEqual({ status: "conflict" })
    expect(useEditor.getState().conflicted).toBe(true)

    // A retry would overwrite the document that caused the conflict.
    await expect(saveDoc("c1")).resolves.toEqual({ status: "conflict" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("leaves the document dirty when the save fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline")
      }),
    )

    useEditor.setState({ dirty: true })
    const outcome = await saveDoc("c1")

    expect(outcome).toEqual({ status: "failed", message: "offline" })
    // Dirty is what makes the retry happen at all.
    expect(useEditor.getState().dirty).toBe(true)
    expect(useEditor.getState().conflicted).toBe(false)
  })

  it("treats a server error as a failure rather than a save", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "boom" }, { status: 500 })),
    )

    useEditor.setState({ dirty: true })
    const outcome = await saveDoc("c1")

    expect(outcome.status).toBe("failed")
    expect(useEditor.getState().dirty).toBe(true)
  })
})
