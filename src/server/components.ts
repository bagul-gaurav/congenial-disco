/**
 * Component operations that touch more than one row or need a rule applied.
 *
 * Kept out of the route handlers so the API and the server actions on the
 * projects page share one implementation — a duplicate that only renames the
 * component in one of the two paths is exactly the kind of drift this avoids.
 */

import { randomBytes } from "node:crypto"

import { createDoc } from "@/model/defaults"
import { validate } from "@/model/ops"
import type { ComponentDoc } from "@/model/types"

import { prisma } from "./db"

/**
 * How long a component must go unsnapshotted before a save records a new
 * version. Without this, autosave would write a row every time you nudge a
 * slider and the history would be unreadable.
 */
export const SNAPSHOT_INTERVAL_MS = 3 * 60 * 1000

/** Versions kept per component. Older ones are pruned as new ones arrive. */
export const MAX_VERSIONS = 50

/**
 * 32 hex characters from a CSPRNG. Long enough that a share link cannot be
 * guessed or enumerated, which is the only thing protecting a shared component.
 */
export function newShareToken(): string {
  return randomBytes(16).toString("hex")
}

export class DocumentInvalidError extends Error {
  constructor(readonly issues: string[]) {
    super("Document failed validation")
    this.name = "DocumentInvalidError"
  }
}

/** Rejects a structurally broken document before it can be persisted. */
export function assertValidDoc(doc: ComponentDoc): void {
  const issues = validate(doc)
  if (issues.length > 0) throw new DocumentInvalidError(issues.map((i) => i.message))
}

export async function createComponent(projectId: string, name: string) {
  const doc = createDoc(name)
  return prisma.component.create({
    data: { name, projectId, doc: doc as never, docVersion: doc.version },
  })
}

/**
 * Saves a document, taking a version snapshot when enough time has passed since
 * the last one. The snapshot records the document *before* this save, so
 * restoring a version returns you to a state you actually had.
 */
export async function saveComponent(id: string, doc: ComponentDoc) {
  assertValidDoc(doc)

  const existing = await prisma.component.findUnique({
    where: { id },
    select: { id: true, name: true, doc: true },
  })
  if (!existing) return null

  const lastVersion = await prisma.componentVersion.findFirst({
    where: { componentId: id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  })

  const due =
    !lastVersion || Date.now() - lastVersion.createdAt.getTime() > SNAPSHOT_INTERVAL_MS

  if (due) {
    await prisma.componentVersion.create({
      data: { componentId: id, doc: existing.doc as never, name: existing.name },
    })
    await pruneVersions(id)
  }

  return prisma.component.update({
    where: { id },
    data: { doc: doc as never, name: doc.name, docVersion: doc.version },
    select: { id: true, name: true, updatedAt: true },
  })
}

/** Records an explicit, labelled snapshot regardless of the throttle. */
export async function snapshotComponent(id: string, label: string) {
  const component = await prisma.component.findUnique({
    where: { id },
    select: { name: true, doc: true },
  })
  if (!component) return null

  const version = await prisma.componentVersion.create({
    data: { componentId: id, doc: component.doc as never, name: component.name, label },
  })
  await pruneVersions(id)
  return version
}

async function pruneVersions(componentId: string) {
  const stale = await prisma.componentVersion.findMany({
    where: { componentId },
    orderBy: { createdAt: "desc" },
    skip: MAX_VERSIONS,
    select: { id: true },
  })
  if (stale.length === 0) return

  await prisma.componentVersion.deleteMany({ where: { id: { in: stale.map((v) => v.id) } } })
}

/**
 * Restores a component to a previous version.
 *
 * The current document is snapshotted first, so restoring is itself undoable —
 * a restore should never be the one action that loses work.
 */
export async function restoreVersion(componentId: string, versionId: string) {
  const version = await prisma.componentVersion.findFirst({
    where: { id: versionId, componentId },
  })
  if (!version) return null

  await snapshotComponent(componentId, "Before restore")

  const doc = version.doc as unknown as ComponentDoc
  return prisma.component.update({
    where: { id: componentId },
    data: { doc: version.doc as never, name: doc.name ?? version.name },
    select: { id: true, name: true, updatedAt: true },
  })
}

/**
 * Copies a component within its project.
 *
 * The document carries its own `name`, which the exporter turns into the
 * component's identifier — so the copy's document name is updated too, or the
 * duplicate would export a component with the original's name.
 */
export async function duplicateComponent(id: string) {
  const source = await prisma.component.findUnique({ where: { id } })
  if (!source) return null

  const doc = source.doc as unknown as ComponentDoc
  const name = `${source.name} copy`

  return prisma.component.create({
    data: {
      name,
      projectId: source.projectId,
      docVersion: source.docVersion,
      doc: { ...doc, name } as never,
    },
  })
}

/** Renames a component, keeping the document's own name in step. */
export async function renameComponent(id: string, name: string) {
  const source = await prisma.component.findUnique({ where: { id }, select: { doc: true } })
  if (!source) return null

  const doc = source.doc as unknown as ComponentDoc

  return prisma.component.update({
    where: { id },
    data: { name, doc: { ...doc, name } as never },
    select: { id: true, name: true },
  })
}

export async function deleteComponent(id: string) {
  return prisma.component.delete({ where: { id } })
}

/** Enables sharing and returns the token, or reuses the existing one. */
export async function enableSharing(id: string) {
  const existing = await prisma.component.findUnique({
    where: { id },
    select: { shareToken: true },
  })
  if (!existing) return null
  if (existing.shareToken) return existing.shareToken

  const shareToken = newShareToken()
  await prisma.component.update({ where: { id }, data: { shareToken } })
  return shareToken
}

/** Revokes sharing. Any link already handed out stops working immediately. */
export async function disableSharing(id: string) {
  await prisma.component.update({ where: { id }, data: { shareToken: null } })
}
