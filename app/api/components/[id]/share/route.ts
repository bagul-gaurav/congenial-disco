import { NextResponse } from "next/server"

import { disableSharing, enableSharing } from "@/server/components"
import { prisma } from "@/server/db"

interface Params {
  params: Promise<{ id: string }>
}

/** The component's current share state, so the UI can show a live link. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const component = await prisma.component.findUnique({
    where: { id },
    select: { shareToken: true },
  })

  if (!component) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({
    token: component.shareToken,
    path: component.shareToken ? `/s/${component.shareToken}` : null,
  })
}

/** Turns sharing on and returns the link. Idempotent — reuses any live token. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params
  const token = await enableSharing(id)

  if (!token) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ token, path: `/s/${token}` })
}

/** Revokes sharing. Any link already handed out stops working immediately. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  await disableSharing(id)
  return NextResponse.json({ ok: true })
}
