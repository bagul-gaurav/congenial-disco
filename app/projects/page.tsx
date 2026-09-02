import Link from "next/link"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createDoc } from "@/model/defaults"
import { currentUser, prisma } from "@/server/db"

export const dynamic = "force-dynamic"

async function createComponent(formData: FormData) {
  "use server"

  const user = await currentUser()
  const name = String(formData.get("name") ?? "").trim() || "Untitled"

  // One default project per user until project management exists as a feature.
  const project = await prisma.project.findFirst({ where: { userId: user.id } })
  const projectId =
    project?.id ??
    (await prisma.project.create({ data: { name: "My components", userId: user.id } })).id

  const doc = createDoc(name)
  const component = await prisma.component.create({
    data: { name, projectId, doc: doc as never, docVersion: doc.version },
  })

  revalidatePath("/projects")
  redirect(`/c/${component.id}`)
}

export default async function ProjectsPage() {
  const user = await currentUser()
  const components = await prisma.component.findMany({
    where: { project: { userId: user.id } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, updatedAt: true },
  })

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-medium">Components</h1>
      <p className="pt-2 text-sm text-chrome-muted">
        Define what a component does, design its states, export it to Framer.
      </p>

      <form action={createComponent} className="flex gap-2 py-8">
        <input
          name="name"
          placeholder="Primary Button"
          className="flex-1 rounded border border-chrome-border bg-chrome-panel px-3 py-2 text-sm outline-none focus:border-chrome-accent"
        />
        <button
          type="submit"
          className="rounded bg-chrome-accent px-4 py-2 text-sm text-white transition hover:opacity-90"
        >
          New component
        </button>
      </form>

      {components.length === 0 ? (
        <p className="text-sm text-chrome-muted">Nothing yet. Create your first component above.</p>
      ) : (
        <ul className="divide-y divide-chrome-border rounded border border-chrome-border">
          {components.map((component) => (
            <li key={component.id}>
              <Link
                href={`/c/${component.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm transition hover:bg-white/5"
              >
                <span>{component.name}</span>
                <span className="text-xs text-chrome-muted">
                  {component.updatedAt.toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
