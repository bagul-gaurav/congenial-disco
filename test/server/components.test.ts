import { describe, expect, it } from "vitest"

import { DocumentInvalidError, assertValidDoc, newShareToken } from "@/server/components"
import { createDoc } from "@/model/defaults"

describe("share tokens", () => {
  it("is 32 hex characters", () => {
    // Possession of the link is the only authorisation on a shared component,
    // so the token has to be long enough that it cannot be guessed.
    expect(newShareToken()).toMatch(/^[0-9a-f]{32}$/)
  })

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => newShareToken()))
    expect(tokens.size).toBe(500)
  })
})

describe("document validation before persisting", () => {
  it("accepts a well-formed document", () => {
    expect(() => assertValidDoc(createDoc())).not.toThrow()
  })

  it("rejects a document whose root is missing", () => {
    const doc = { ...createDoc(), root: "gone" }

    // Persisting this would leave a component that cannot be opened again.
    expect(() => assertValidDoc(doc)).toThrow(DocumentInvalidError)
  })

  it("reports why it was rejected", () => {
    try {
      assertValidDoc({ ...createDoc(), root: "gone" })
      expect.unreachable("should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentInvalidError)
      expect((error as DocumentInvalidError).issues.join(" ")).toContain("gone")
    }
  })
})
