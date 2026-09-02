import { notFound } from "next/navigation"
import type { Metadata } from "next"

import { readDoc } from "@/server/components"
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

  // Through the same version ladder as the editor: a shared component may not
  // have been opened since a shape change.
  const doc = readDoc(component.doc)
  if (!doc) notFound()

  return (
    <SharedComponent doc={doc} updatedAt={component.updatedAt.toISOString()} />
  )
}
