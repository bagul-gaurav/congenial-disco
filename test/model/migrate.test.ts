/**
 * Loading stored documents.
 *
 * The ladder is empty while the document shape is on its first version, so what
 * is provable today is the frame around it: that a malformed document is
 * refused rather than crashing validation, that a document from a newer build
 * is refused rather than silently downgraded, and that a version stamp is
 * brought forward. Those are the guarantees a future migration rests on.
 */

import { describe, expect, it } from "vitest"

import { createDoc } from "@/model/defaults"
import { loadDoc } from "@/model/migrate"
import { DOC_VERSION } from "@/model/types"

import { buttonFixture } from "../fixtures/button"

describe("loadDoc", () => {
  it("loads a current document unchanged", () => {
    const { doc } = buttonFixture()
    const result = loadDoc(JSON.parse(JSON.stringify(doc)))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.migrated).toBe(false)
    expect(result.doc.root).toBe(doc.root)
    expect(Object.keys(result.doc.nodes)).toEqual(Object.keys(doc.nodes))
  })

  it("stamps the document with the version it was read as", () => {
    const result = loadDoc(JSON.parse(JSON.stringify(createDoc("Card"))))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.doc.version).toBe(DOC_VERSION)
  })

  describe("rejects what would otherwise crash something downstream", () => {
    it.each([
      ["not an object", 42],
      ["null", null],
      ["an array", []],
      ["missing nodes", { root: "a", props: [], states: [], variants: [], tokens: [] }],
      ["nodes as an array", { root: "a", nodes: [], props: [], states: [], variants: [], tokens: [] }],
      // `validate` walks doc.props to check variant selectors, so a document
      // without it throws a TypeError out of validation rather than failing it.
      ["missing props", { root: "a", nodes: { a: {} }, states: [], variants: [], tokens: [] }],
      ["missing variants", { root: "a", nodes: { a: {} }, props: [], states: [], tokens: [] }],
    ])("%s", (_label, raw) => {
      const result = loadDoc(raw)

      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.issues.length).toBeGreaterThan(0)
    })
  })

  it("still enforces the structural invariants", () => {
    const doc = { ...JSON.parse(JSON.stringify(createDoc())), root: "gone" }

    const result = loadDoc(doc)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.join(" ")).toContain("gone")
  })

  it("refuses a document written by a newer version of the app", () => {
    // Mid-rollout, an older instance can read a document a newer one wrote.
    // Loading it would mean dropping the fields this build does not know about
    // and then autosaving the result over the original.
    const doc = { ...JSON.parse(JSON.stringify(createDoc())), version: DOC_VERSION + 1 }

    const result = loadDoc(doc)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.join(" ")).toContain("newer version")
  })

  it("does not mutate the document it was given", () => {
    const raw = JSON.parse(JSON.stringify(createDoc())) as Record<string, unknown>
    const before = JSON.stringify(raw)

    loadDoc(raw)

    expect(JSON.stringify(raw)).toBe(before)
  })
})
