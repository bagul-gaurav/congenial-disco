import { NextResponse } from "next/server"

import type { ComponentDoc } from "@/model/types"
import { prisma } from "@/server/db"
import {
  DocumentInvalidError,
  deleteComponent,
  renameComponent,
  saveComponent,
} from "@/server/components"

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const component = await prisma.component.findUnique({ where: { id } })

  if (!component) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(component.doc)
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params

  let body: { doc?: ComponentDoc }
  try {
    body = (await request.json()) as { doc?: ComponentDoc }
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 })
  }

  const doc = body.doc
  if (!doc || typeof doc !== "object" || !doc.nodes || !doc.root) {
    return NextResponse.json({ error: "Missing document" }, { status: 400 })
  }

  try {
    const updated = await saveComponent(id, doc)
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(updated)
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
