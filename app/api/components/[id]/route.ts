import { NextResponse } from "next/server"

import { prisma } from "@/server/db"
import {
  DocumentInvalidError,
  assertValidDoc,
  deleteComponent,
  readDoc,
  renameComponent,
  saveComponent,
} from "@/server/components"

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const component = await prisma.component.findUnique({
    where: { id },
    select: { doc: true, revision: true },
  })

  if (!component) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const doc = readDoc(component.doc)
  if (!doc) return NextResponse.json({ error: "Document could not be read" }, { status: 422 })

  return NextResponse.json({ doc, revision: component.revision })
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params

  let body: { doc?: unknown; revision?: unknown }
  try {
    body = (await request.json()) as { doc?: unknown; revision?: unknown }
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 })
  }

  if (!body.doc) return NextResponse.json({ error: "Missing document" }, { status: 400 })

  // Optional so a client that does not track revisions still works; when it is
  // present the save is conditional on it.
  const expectedRevision = typeof body.revision === "number" ? body.revision : undefined

  try {
    // The body is untrusted JSON: `assertValidDoc` is what turns it into a
    // document, rather than a cast that would let a malformed one reach the
    // resolver.
    const doc = assertValidDoc(body.doc)
    const result = await saveComponent(id, doc, expectedRevision)

    if (result.status === "not-found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    if (result.status === "conflict") {
      // 409 rather than an overwrite: the client holds a document that never
      // saw the stored one, and only it can decide what to keep.
      return NextResponse.json(
        {
          error: "This component changed somewhere else since you loaded it",
          revision: result.revision,
          doc: result.doc,
        },
        { status: 409 },
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    // A structurally broken document would make the component un-openable on
    // its next load, so it is refused rather than stored.
    if (error instanceof DocumentInvalidError) {
      return NextResponse.json({ error: error.message, issues: error.issues }, { status: 422 })
    }
    throw error
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params

  const body = (await request.json().catch(() => ({}))) as { name?: string }
  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 })

  const renamed = await renameComponent(id, name)
  if (!renamed) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(renamed)
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  await deleteComponent(id)
  return NextResponse.json({ ok: true })
}
