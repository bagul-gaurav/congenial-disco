/**
 * Loading a stored document.
 *
 * Every document arrives from Postgres as untyped JSON — written by an older
 * build, restored from a months-old version snapshot, or posted straight at the
 * API. Three things have to happen before anything else may touch it, and they
 * have to happen the same way at every entry point:
 *
 *   1. **Shape.** `validate` in `ops` checks the node *graph*, which means it
 *      already assumes `doc.props` is an array and `doc.nodes` is a record. A
 *      document missing either throws a `TypeError` out of validation itself.
 *   2. **Version.** `docVersion` was recorded from the first commit but never
 *      read, so a document written under an older shape would be handed to the
 *      resolver as though it were current. The ladder below is where a shape
 *      change gets its migration — nesting, slots and vector nodes all change
 *      `Node`, and every one of them will need this.
 *   3. **Structure.** The existing graph invariants.
 *
 * A document from the *future* — written by a newer deploy, read by an older
 * one mid-rollout — is refused rather than guessed at. Silently dropping fields
 * the reader does not understand and then autosaving the result is how a
 * rollback eats a design.
 */

import { validate } from "./ops"
import { DOC_VERSION } from "./types"
import type { ComponentDoc } from "./types"

/** Upgrades a document from version `n` to version `n + 1`. */
type Migration = (doc: Record<string, unknown>) => Record<string, unknown>

/**
 * The ladder, keyed by the version each step upgrades *from*.
 *
 * Empty while the shape is still on its first version. Adding an entry is the
 * whole cost of changing `ComponentDoc`: write the step, bump `DOC_VERSION`,
 * and every stored document and version snapshot comes forward on next read.
 *
 * A step must be total (it cannot fail on any document its source version
 * allows) and must not depend on anything outside the document.
 */
const MIGRATIONS: Record<number, Migration> = {}

export type LoadResult =
  | { ok: true; doc: ComponentDoc; migrated: boolean }
  | { ok: false; issues: string[] }

/** The fields the model reaches for without checking. */
function hasDocumentShape(raw: unknown): raw is Record<string, unknown> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false
  const doc = raw as Record<string, unknown>

  return (
    typeof doc.root === "string" &&
    typeof doc.nodes === "object" &&
    doc.nodes !== null &&
    !Array.isArray(doc.nodes) &&
    Array.isArray(doc.props) &&
    Array.isArray(doc.states) &&
    Array.isArray(doc.variants) &&
    Array.isArray(doc.tokens)
  )
}

/**
 * Reads a stored document: shape guard, version ladder, structural validation.
 *
 * `migrated` says whether the ladder changed anything, so a caller holding a
 * writable row can persist the upgraded form rather than re-running the same
 * steps on every read.
 */
export function loadDoc(raw: unknown): LoadResult {
  if (!hasDocumentShape(raw)) {
    return { ok: false, issues: ["Not a component document"] }
  }

  const version = typeof raw.version === "number" ? raw.version : 1

  if (version > DOC_VERSION) {
    return {
      ok: false,
      issues: [
        `Document version ${version} was written by a newer version of Studio ` +
          `(this one reads up to ${DOC_VERSION})`,
      ],
    }
  }

  let doc = raw
  for (let from = version; from < DOC_VERSION; from += 1) {
    const step = MIGRATIONS[from]
    if (!step) {
      return { ok: false, issues: [`No migration from document version ${from}`] }
    }
    doc = step(doc)
  }
  doc = { ...doc, version: DOC_VERSION }

  const issues = validate(doc as unknown as ComponentDoc)
  if (issues.length > 0) return { ok: false, issues: issues.map((issue) => issue.message) }

  return { ok: true, doc: doc as unknown as ComponentDoc, migrated: version !== DOC_VERSION }
}
