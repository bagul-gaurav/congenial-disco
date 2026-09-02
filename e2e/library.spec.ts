import { expect, test } from "@playwright/test"

import { createComponent, openDemoComponent, selectLayer } from "./helpers"

/** A component row on the projects page, located by its name. */
function row(page: import("@playwright/test").Page, name: string) {
  return page.getByTestId("component-row").filter({ hasText: name }).first()
}

test.describe("the component library", () => {
  test("renames a component", async ({ page }) => {
    const name = `Rename ${Date.now()}`
    await createComponent(page, name)
    await page.goto("/projects")

    const renamed = `${name} renamed`
    await row(page, name).getByLabel(`Rename ${name}`).fill(renamed)
    await row(page, name).getByRole("button", { name: "Rename", exact: true }).click()

    await expect(page.getByRole("link", { name: new RegExp(renamed) })).toBeVisible()
  })

  test("a rename reaches the exported component's name", async ({ page }) => {
    const name = `Export Name ${Date.now()}`
    await createComponent(page, name)
    await page.goto("/projects")

    await row(page, name).getByLabel(`Rename ${name}`).fill("Renamed Widget")
    await row(page, name).getByRole("button", { name: "Rename", exact: true }).click()

    // The exporter derives the component identifier from the document's own
    // name, so a rename that only touched the row would silently export the
    // old identifier.
    await page.getByRole("link", { name: /Renamed Widget/ }).first().click()
    await page.getByTestId("export-open").click()

    expect(await page.getByTestId("export-code").innerText()).toContain(
      "export default function RenamedWidget",
    )
  })

  test("duplicates a component without touching the original", async ({ page }) => {
    const name = `Dup ${Date.now()}`
    await createComponent(page, name)
    await page.goto("/projects")

    await row(page, name).getByRole("button", { name: "Duplicate" }).click()

    await expect(page.getByRole("link", { name: new RegExp(`${name} copy`) })).toBeVisible()
    await expect(page.getByRole("link", { name: new RegExp(`^${name}$`) })).toBeVisible()
  })

  test("deletes a component", async ({ page }) => {
    const name = `Delete ${Date.now()}`
    await createComponent(page, name)
    await page.goto("/projects")

    await row(page, name).getByRole("button", { name: `Delete ${name}` }).click()

    await expect(page.getByTestId("component-row").filter({ hasText: name })).toHaveCount(0)
  })
})

test.describe("version history", () => {
  test("saves a version and restores it", async ({ page }) => {
    await createComponent(page, `History ${Date.now()}`)

    await selectLayer(page, "Root")
    await page.getByTestId("fill-input").fill("#010203")

    await page.getByTestId("history-open").click()
    await page.getByTestId("snapshot").click()
    await expect(page.getByTestId("version-row").first()).toContainText("Manual save")
    await page.getByRole("button", { name: "Close" }).click()

    // Move away from the snapshotted state.
    await selectLayer(page, "Root")
    await page.getByTestId("fill-input").fill("#0a0b0c")
    await expect
      .poll(() => page.locator("[data-node-id]").first().evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe("rgb(10, 11, 12)")

    await page.getByTestId("history-open").click()
    await page.getByTestId("version-row").first().getByRole("button", { name: "Restore" }).click()
    await page.getByRole("button", { name: "Close" }).click()

    await expect
      .poll(() => page.locator("[data-node-id]").first().evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe("rgb(1, 2, 3)")
  })

  test("a restore is itself undoable", async ({ page }) => {
    await createComponent(page, `Undo Restore ${Date.now()}`)

    await selectLayer(page, "Root")
    await page.getByTestId("fill-input").fill("#111111")
    await page.getByTestId("history-open").click()
    await page.getByTestId("snapshot").click()
    await page.getByRole("button", { name: "Close" }).click()

    await selectLayer(page, "Root")
    await page.getByTestId("fill-input").fill("#222222")

    await page.getByTestId("history-open").click()
    await page.getByTestId("version-row").first().getByRole("button", { name: "Restore" }).click()
    await page.getByRole("button", { name: "Close" }).click()

    // Restoring must not be the one action that loses work.
    await page.getByRole("button", { name: "Undo" }).click()
    await expect
      .poll(() => page.locator("[data-node-id]").first().evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe("rgb(34, 34, 34)")
  })
})

test.describe("sharing", () => {
  test("shares a component read-only, then revokes the link", async ({ page }) => {
    // Its own component rather than the shared demo: these tests toggle share
    // state, and borrowing a component other tests also touch makes the run
    // order matter.
    const name = `Share ${Date.now()}`
    await createComponent(page, name)

    await page.getByTestId("history-open").click()
    await page.getByTestId("enable-share").click()

    const url = await page.getByTestId("share-url").inputValue()
    expect(url).toMatch(/\/s\/[0-9a-f]{32}$/)

    await page.goto(url)
    await expect(page.getByRole("heading", { name })).toBeVisible()
    // The component runs here, but nothing can edit it.
    await expect(page.getByTestId("canvas")).toHaveCount(0)

    // The shared page hands over the same generated code as the editor.
    await page.getByTestId("toggle-code").click()
    expect(await page.getByTestId("shared-code").innerText()).toContain(
      "export default function",
    )

    await page.goBack()
    await page.getByTestId("history-open").click()
    await page.getByRole("button", { name: "Revoke" }).click()

    // A revoked link must stop working immediately, not at the next deploy.
    const response = await page.goto(url)
    expect(response?.status()).toBe(404)
  })

  test("an unknown share token is a 404", async ({ page }) => {
    const response = await page.goto(`/s/${"0".repeat(32)}`)
    expect(response?.status()).toBe(404)
  })

  test("reopening the panel shows the existing link rather than offering a new one", async ({
    page,
  }) => {
    await createComponent(page, `Reopen ${Date.now()}`)

    await page.getByTestId("history-open").click()
    await page.getByTestId("enable-share").click()
    const url = await page.getByTestId("share-url").inputValue()

    await page.getByRole("button", { name: "Close" }).click()
    await page.getByTestId("history-open").click()

    // Share state belongs to the component, not to the panel's local state.
    await expect(page.getByTestId("share-url")).toHaveValue(url)
    await expect(page.getByTestId("enable-share")).toHaveCount(0)
  })

  test("changing a prop on the shared page re-renders the component", async ({ page }) => {
    await createComponent(page, `Props ${Date.now()}`)

    // Expose the label as a prop, so the shared page has something to drive.
    await selectLayer(page, "Label")
    await page.getByTestId("expose-content").click()
    await expect(page.getByTestId("bound-prop")).toBeVisible()

    await page.getByTestId("history-open").click()
    await page.getByTestId("enable-share").click()
    const url = await page.getByTestId("share-url").inputValue()

    await page.goto(url)
    await page.getByRole("textbox").first().fill("Shared label")

    await expect(page.getByText("Shared label")).toBeVisible()
  })
})
