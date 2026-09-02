import { notFound } from "next/navigation"

import { Editor } from "@/editor/Editor"
import { validate } from "@/model/ops"
import type { ComponentDoc } from "@/model/types"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"

export default async function ComponentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const component = await prisma.component.findUnique({ where: { id } })

  if (!component) notFound()

  const doc = component.doc as unknown as ComponentDoc

  // A document that fails validation would crash the canvas on the first
  // render; say so plainly instead.
  const issues = validate(doc)
  if (issues.length > 0) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-lg">This component could not be opened</h1>
        <ul className="list-disc pt-4 pl-5 text-sm text-chrome-muted">
          {issues.map((issue) => (
            <li key={issue.message}>{issue.message}</li>
          ))}
        </ul>
      </main>
    )
  }

  return <Editor componentId={component.id} initialDoc={doc} />
}
