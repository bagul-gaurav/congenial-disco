import { notFound } from "next/navigation"

import { Editor } from "@/editor/Editor"
import { loadDoc } from "@/model/migrate"
import { prisma } from "@/server/db"

export const dynamic = "force-dynamic"

export default async function ComponentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const component = await prisma.component.findUnique({
    where: { id },
    select: { id: true, doc: true, revision: true },
  })

  if (!component) notFound()

  // Version ladder, then structural validation. A document that fails either
  // would crash the canvas on the first render; say so plainly instead.
  const result = loadDoc(component.doc)
  if (!result.ok) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-lg">This component could not be opened</h1>
        <ul className="list-disc pt-4 pl-5 text-sm text-chrome-muted">
          {result.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      </main>
    )
  }

  return (
    <Editor
      componentId={component.id}
      initialDoc={result.doc}
      initialRevision={component.revision}
    />
  )
}
