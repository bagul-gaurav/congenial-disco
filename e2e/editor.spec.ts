import { expect, test } from "@playwright/test"

import {
  createComponent,
  openDemoComponent,
  rootBackground,
  selectLayer,
  waitForSave,
} from "./helpers"

test.describe("the editor", () => {
  test("opens a component and renders its layers on the canvas", async ({ page }) => {
    await openDemoComponent(page)

    // Two layers in the seeded button: the root frame and the bound label.
    await expect(page.locator("[data-node-id]")).toHaveCount(2)
    // The label reads from the `label` prop, so seeing the default value proves
    // bindings resolve through to the canvas.
    await expect(page.getByText("Click me")).toBeVisible()
    await expect(page.getByTestId("layer-row")).toHaveCount(2)
  })

  test("selecting a layer shows its properties", async ({ page }) => {
    await openDemoComponent(page)
    await selectLayer(page, "Label")

    await expect(page.getByRole("heading", { name: "Text" })).toBeVisible()
    // A bound field shows which prop it reads from rather than an editable
    // literal — that is what "exposed as a prop" looks like in the panel.
    await expect(page.getByTestId("bound-prop")).toHaveText("label")
    await expect(page.getByTestId("unbind")).toBeVisible()
  })

  test("creates a layer with a tool and undoes it", async ({ page }) => {
    await openDemoComponent(page)

    await page.getByTestId("tool-rect").click()
    await page.locator("[data-node-id]").first().click()

    await expect(page.getByTestId("layer-row")).toHaveCount(3)
    await expect(page.getByTestId("layer-row").filter({ hasText: "Rectangle" })).toBeVisible()

    // The tool reverts to select after one use, so the next click does not keep
    // stamping rectangles.
    await expect(page.getByTestId("tool-select")).toHaveClass(/bg-chrome-accent/)

    await page.getByRole("button", { name: "Undo" }).click()
    await expect(page.getByTestId("layer-row")).toHaveCount(2)
  })

  test("deletes the selected layer with the keyboard", async ({ page }) => {
    await openDemoComponent(page)
    await selectLayer(page, "Label")
    await page.keyboard.press("Backspace")

    await expect(page.getByTestId("layer-row")).toHaveCount(1)
  })

  test("edits a property on the base design", async ({ page }) => {
    await openDemoComponent(page)
    await selectLayer(page, "Button")

    await page.getByTestId("fill-input").fill("#112233")
    await expect
      .poll(() => rootBackground(page))
      .toBe("rgb(17, 34, 51)")
  })
})

test.describe("variants", () => {
  test("editing inside a variant leaves the base design alone", async ({ page }) => {
    await openDemoComponent(page)
    const base = await rootBackground(page)

    await page.getByTestId("variant-chip").filter({ hasText: "Ghost" }).click()
    await selectLayer(page, "Button")
    await expect(page.getByText("Changes are stored as overrides")).toBeVisible()

    await page.getByTestId("fill-input").fill("#ff0000")
    await expect.poll(() => rootBackground(page)).toBe("rgb(255, 0, 0)")

    await page.getByTestId("variant-base").click()

    // This is the rule the whole variant model rests on. If it ever breaks,
    // every design in the tool silently corrupts its own base.
    await expect.poll(() => rootBackground(page)).toBe(base)
  })

  test("selecting a state variant previews that state on the canvas", async ({ page }) => {
    await openDemoComponent(page)
    const base = await rootBackground(page)

    await page.getByTestId("variant-chip").filter({ hasText: "Hover" }).click()

    // Selecting the hover variant should show the hover design without making
    // you separately pin the state.
    await expect.poll(() => rootBackground(page)).not.toBe(base)
    await expect.poll(() => rootBackground(page)).toBe("rgb(47, 74, 208)")
  })

  test("resets a node's override back to the base", async ({ page }) => {
    await openDemoComponent(page)

    await page.getByTestId("variant-chip").filter({ hasText: "Ghost" }).click()
    await selectLayer(page, "Button")
    await expect.poll(() => rootBackground(page)).toBe("rgb(255, 255, 255)")

    await page.getByRole("button", { name: "Reset to base" }).click()
    await expect.poll(() => rootBackground(page)).toBe("rgb(59, 91, 253)")
  })
})

test.describe("export", () => {
  test("shows a component that carries the whole design", async ({ page }) => {
    await openDemoComponent(page)
    await page.getByTestId("export-open").click()

    const code = await page.getByTestId("export-code").innerText()

    expect(code).toContain("export default function PrimaryButton")
    expect(code).toContain("addPropertyControls(PrimaryButton, {")
    // Props became controls.
    expect(code).toContain("ControlType.String")
    expect(code).toContain("ControlType.Enum")
    // States became real behavior, driven from the root.
    expect(code).toContain(`whileHover={disabled ? undefined : "hover"}`)
    expect(code).toContain(`initial="rest"`)
    // The prop-driven variant became a conditional style.
    expect(code).toContain(`tone === "ghost"`)
    // Only modules Framer can resolve.
    const imports = [...code.matchAll(/from "([^"]+)"/g)].map((m) => m[1])
    expect(new Set(imports)).toEqual(new Set(["react", "framer", "framer-motion"]))
  })

  test("reflects an edit made moments earlier", async ({ page }) => {
    await openDemoComponent(page)
    await selectLayer(page, "Button")
    await page.getByTestId("fill-input").fill("#0a0b0c")

    await page.getByTestId("export-open").click()
    expect(await page.getByTestId("export-code").innerText()).toContain("#0a0b0c")
  })

  test("opens with the keyboard shortcut", async ({ page }) => {
    await openDemoComponent(page)
    await page.keyboard.press("ControlOrMeta+e")

    await expect(page.getByTestId("export-code")).toBeVisible()
  })
})

test.describe("persistence", () => {
  test("keeps an edit across a reload", async ({ page }) => {
    await createComponent(page, `Persistence ${Date.now()}`)

    await selectLayer(page, "Root")
    await page.getByTestId("fill-input").fill("#654321")
    await expect.poll(() => rootBackground(page)).toBe("rgb(101, 67, 33)")

    await waitForSave(page)
    await page.reload()

    await expect(page.getByTestId("canvas")).toBeVisible()
    await expect.poll(() => rootBackground(page)).toBe("rgb(101, 67, 33)")
  })

  test("refuses to overwrite a document that changed somewhere else", async ({ page, request }) => {
    await createComponent(page, `Conflict ${Date.now()}`)
    const id = page.url().split("/c/")[1]

    // Stand in for a second tab: write to the component this editor is holding.
    const loaded = (await (await request.get(`/api/components/${id}`)).json()) as {
      doc: Record<string, unknown>
      revision: number
    }
    const elsewhere = await request.put(`/api/components/${id}`, {
      data: { doc: { ...loaded.doc, description: "written elsewhere" }, revision: loaded.revision },
    })
    expect(elsewhere.status()).toBe(200)

    // Now edit here. The save is based on a revision the server has moved past,
    // so it must be refused rather than quietly winning.
    await selectLayer(page, "Root")
    await page.getByTestId("fill-input").fill("#010203")

    await expect(page.getByText("Edited elsewhere — reload")).toBeVisible({ timeout: 15_000 })

    const stored = (await (await request.get(`/api/components/${id}`)).json()) as {
      doc: { description: string }
    }
    expect(stored.doc.description).toBe("written elsewhere")
  })

  test("lists a newly created component on the projects page", async ({ page }) => {
    // Unique per run: the database persists between runs, and a repeated name
    // would match several rows.
    const name = `Listed ${Date.now()}`
    await createComponent(page, name)
    await page.goto("/projects")

    await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible()
  })
})
