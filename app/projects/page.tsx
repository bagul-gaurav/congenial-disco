import Link from "next/link"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import {
  createComponent,
  deleteComponent,
  duplicateComponent,
  renameComponent,
} from "@/server/components"
import { currentUser, prisma } from "@/server/db"

export const dynamic = "force-dynamic"

/** The user's single default project until project management is a feature. */
async function defaultProjectId(userId: string) {
  const project = await prisma.project.findFirst({ where: { userId } })
  if (project) return project.id

  const created = await prisma.project.create({ data: { name: "My components", userId } })
  return created.id
}

async function newComponent(formData: FormData) {
  "use server"

  const user = await currentUser()
  const name = String(formData.get("name") ?? "").trim() || "Untitled"
  const component = await createComponent(await defaultProjectId(user.id), name)

  revalidatePath("/projects")
  redirect(`/c/${component.id}`)
}

async function duplicate(formData: FormData) {
  "use server"

  await duplicateComponent(String(formData.get("id")))
  revalidatePath("/projects")
}

async function rename(formData: FormData) {
  "use server"

  const name = String(formData.get("name") ?? "").trim()
  if (name) await renameComponent(String(formData.get("id")), name)
  revalidatePath("/projects")
}

async function remove(formData: FormData) {
  "use server"

  await deleteComponent(String(formData.get("id")))
  revalidatePath("/projects")
}

export default async function ProjectsPage() {
  const user = await currentUser()
  const components = await prisma.component.findMany({
    where: { project: { userId: user.id } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, updatedAt: true, shareToken: true },
  })

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-medium">Components</h1>
      <p className="pt-2 text-sm text-chrome-muted">
        Define what a component does, design its states, export it to Framer.
      </p>

      <form action={newComponent} className="flex gap-2 py-8">
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
            <li
              key={component.id}
              data-testid="component-row"
              className="group flex items-center gap-2 px-4 py-3"
            >
              <Link
                href={`/c/${component.id}`}
                className="min-w-0 flex-1 truncate text-sm transition hover:text-chrome-accent"
              >
                {component.name}
              </Link>

              {component.shareToken && (
                <Link
                  href={`/s/${component.shareToken}`}
                  title="Open the public read-only view"
                  className="rounded bg-chrome-accent/20 px-2 py-1 text-[11px] text-chrome-text"
                >
                  Shared
                </Link>
              )}

              <span className="text-xs text-chrome-muted">
                {component.updatedAt.toLocaleDateString()}
              </span>

              {/* Inline rather than behind a menu: three actions do not need one. */}
              <form action={rename} className="flex items-center gap-1">
                <input type="hidden" name="id" value={component.id} />
                <input
                  name="name"
                  defaultValue={component.name}
                  aria-label={`Rename ${component.name}`}
                  className="w-32 rounded border border-transparent bg-transparent px-2 py-1 text-xs text-chrome-muted outline-none focus:border-chrome-border focus:text-chrome-text"
                />
                <button type="submit" className="text-xs text-chrome-muted hover:text-chrome-text">
                  Rename
                </button>
              </form>

              <form action={duplicate}>
                <input type="hidden" name="id" value={component.id} />
                <button type="submit" className="text-xs text-chrome-muted hover:text-chrome-text">
                  Duplicate
                </button>
              </form>

              <form action={remove}>
                <input type="hidden" name="id" value={component.id} />
                <button
                  type="submit"
                  aria-label={`Delete ${component.name}`}
                  className="text-xs text-chrome-muted hover:text-red-400"
                >
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
