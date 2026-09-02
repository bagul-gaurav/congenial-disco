import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { validate } from "@/model/ops"
import type { ComponentDoc } from "@/model/types"
import { prisma } from "@/server/db"

import { SharedComponent } from "./SharedComponent"

export const dynamic = "force-dynamic"

interface Params {
  params: Promise<{ token: string }>
}

async function load(token: string) {
  // Looked up by token alone: possession of the link is the authorisation, so
  // the token must stay unguessable and revoking it must be immediate.
  return prisma.component.findUnique({
    where: { shareToken: token },
    select: { name: true, doc: true, updatedAt: true },
  })
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params
  const component = await load(token)

  return {
    title: component ? `${component.name} — Studio` : "Not found",
    // A share link is unguessable, not secret. Keeping it out of search results
    // means handing someone the link stays the only way in.
    robots: { index: false, follow: false },
  }
}

export default async function SharePage({ params }: Params) {
  const { token } = await params
  const component = await load(token)

  // A revoked token and a token that never existed are the same 404, so a
  // guess cannot distinguish "wrong" from "no longer shared".
  if (!component) notFound()

  const doc = component.doc as unknown as ComponentDoc
  if (validate(doc).length > 0) notFound()

  return (
    <SharedComponent doc={doc} updatedAt={component.updatedAt.toISOString()} />
  )
}
