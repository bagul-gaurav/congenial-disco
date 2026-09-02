import { expect, test } from "@playwright/test"

/**
 * The save endpoint, driven directly.
 *
 * These are the rules that keep two editors from eating each other's work, and
 * they only exist end to end: the conditional write is in Postgres, so a unit
 * test with a mocked client would prove nothing about the case that matters —
 * two saves racing on the same row.
 *
 * Everything runs against a component this file creates, so it does not disturb
 * the seeded demo the browser tests drive.
 */

interface Created {
  id: string
  doc: Record<string, unknown>
  revision: number
}

async function createComponent(
  request: import("@playwright/test").APIRequestContext,
  page: import("@playwright/test").Page,
  name: string,
): Promise<Created> {
  // Creation is a server action on the projects page, so it goes through the UI
  // once; everything after it is API only.
  await page.goto("/projects")
  await page.getByPlaceholder("Primary Button").fill(name)
  await page.getByRole("button", { name: "New component" }).click()
  await page.waitForURL(/\/c\/.+/)

  const id = page.url().split("/c/")[1]
  const response = await request.get(`/api/components/${id}`)
  expect(response.status()).toBe(200)

  const body = (await response.json()) as { doc: Record<string, unknown>; revision: number }
  return { id, doc: body.doc, revision: body.revision }
}

test.describe("saving a document", () => {
  test("returns the document and the revision it was read at", async ({ page, request }) => {
    const component = await createComponent(request, page, "API read")

    expect(component.doc).toMatchObject({ name: "API read", version: 1 })
    expect(typeof component.revision).toBe("number")
  })

  test("bumps the revision on every write", async ({ page, request }) => {
    const component = await createComponent(request, page, "API revisions")

    const first = await request.put(`/api/components/${component.id}`, {
      data: { doc: { ...component.doc, description: "one" }, revision: component.revision },
    })
    expect(first.status()).toBe(200)
    const afterFirst = (await first.json()) as { revision: number }
    expect(afterFirst.revision).toBe(component.revision + 1)

    const second = await request.put(`/api/components/${component.id}`, {
      data: { doc: { ...component.doc, description: "two" }, revision: afterFirst.revision },
    })
    expect(second.status()).toBe(200)
    expect(((await second.json()) as { revision: number }).revision).toBe(component.revision + 2)
  })

  test("refuses a save based on a revision that has moved on", async ({ page, request }) => {
    const component = await createComponent(request, page, "API conflict")

    // A second tab saves first.
    const other = await request.put(`/api/components/${component.id}`, {
      data: { doc: { ...component.doc, description: "from the other tab" }, revision: component.revision },
    })
    expect(other.status()).toBe(200)

    // This one is still holding the revision it loaded.
    const stale = await request.put(`/api/components/${component.id}`, {
      data: { doc: { ...component.doc, description: "would clobber" }, revision: component.revision },
    })
    expect(stale.status()).toBe(409)

    const conflict = (await stale.json()) as { revision: number; doc: { description: string } }
    // The response carries what is actually stored, so a client can show it.
    expect(conflict.doc.description).toBe("from the other tab")
    expect(conflict.revision).toBe(component.revision + 1)

    // And the refused write did not land.
    const current = await request.get(`/api/components/${component.id}`)
    expect(((await current.json()) as { doc: { description: string } }).doc.description).toBe(
      "from the other tab",
    )
  })

  test("still accepts a save that does not claim a revision", async ({ page, request }) => {
    const component = await createComponent(request, page, "API unversioned")

    const response = await request.put(`/api/components/${component.id}`, {
      data: { doc: { ...component.doc, description: "no revision claimed" } },
    })

    expect(response.status()).toBe(200)
  })

  test("refuses a document that is not a document", async ({ page, request }) => {
    const component = await createComponent(request, page, "API malformed")

    // Storing this would make the component un-openable, and `validate` itself
    // would throw on the missing arrays.
    const response = await request.put(`/api/components/${component.id}`, {
      data: { doc: { root: "n_root", nodes: { n_root: {} } }, revision: component.revision },
    })

    expect(response.status()).toBe(422)

    const current = await request.get(`/api/components/${component.id}`)
    expect(current.status()).toBe(200)
  })

  test("404s for a component that does not exist", async ({ request }) => {
    const response = await request.get("/api/components/does-not-exist")
    expect(response.status()).toBe(404)
  })
})
