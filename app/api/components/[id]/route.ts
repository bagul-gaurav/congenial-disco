import { NextResponse } from "next/server"

import { validate } from "@/model/ops"
import type { ComponentDoc } from "@/model/types"
import { prisma } from "@/server/db"

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

  // Refuse to persist a structurally broken document: a bad write here would
  // make the component un-openable on the next load.
  const issues = validate(doc)
  if (issues.length > 0) {
    return NextResponse.json(
      { error: "Document failed validation", issues: issues.map((i) => i.message) },
      { status: 422 },
    )
  }

  const updated = await prisma.component.update({
    where: { id },
    data: { doc: doc as never, name: doc.name, docVersion: doc.version },
    select: { id: true, updatedAt: true },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  await prisma.component.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
