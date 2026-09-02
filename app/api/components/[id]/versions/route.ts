import { NextResponse } from "next/server"

import { prisma } from "@/server/db"
import { restoreVersion, snapshotComponent } from "@/server/components"

interface Params {
  params: Promise<{ id: string }>
}

/** The component's history, newest first. Documents are omitted — they are big. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params

  const versions = await prisma.componentVersion.findMany({
    where: { componentId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, label: true, createdAt: true },
  })

  return NextResponse.json(versions)
}

/** Records an explicit snapshot, or restores one when `versionId` is given. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as {
    versionId?: string
    label?: string
  }

  if (body.versionId) {
    const restored = await restoreVersion(id, body.versionId)
    if (!restored) return NextResponse.json({ error: "Version not found" }, { status: 404 })

    const component = await prisma.component.findUnique({ where: { id }, select: { doc: true } })
    return NextResponse.json({ restored: true, doc: component?.doc })
  }

  const version = await snapshotComponent(id, body.label?.trim() || "Manual save")
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    id: version.id,
    name: version.name,
    label: version.label,
    createdAt: version.createdAt,
  })
}
