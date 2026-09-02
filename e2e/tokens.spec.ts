import { expect, test } from "@playwright/test"

import { createComponent, rootBackground, selectLayer } from "./helpers"

/** Opens the tokens tab in the left rail. */
async function openTokens(page: import("@playwright/test").Page) {
  await page.getByTestId("rail-tokens").click()
}

test.describe("design tokens", () => {
  test("adds a starter set and lists it", async ({ page }) => {
    await createComponent(page, `Tokens ${Date.now()}`)
    await openTokens(page)

    await expect(page.getByTestId("token-row")).toHaveCount(0)
    await page.getByTestId("add-starter-tokens").click()

    await expect(page.getByTestId("token-row").first()).toBeVisible()
    await expect(page.getByRole("heading", { name: "Color" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Spacing" })).toBeVisible()
  })

  test("creates a token by hand", async ({ page }) => {
    await createComponent(page, `Custom token ${Date.now()}`)
    await openTokens(page)

    await page.getByLabel("New token name").fill("Brand")
    await page.getByTestId("add-token").click()

    await expect(page.getByTestId("token-row")).toHaveCount(1)
    await expect(page.getByLabel("Rename Brand")).toBeVisible()
  })

  test("points a layer's fill at a token, and follows the token when it changes", async ({
    page,
  }) => {
    await createComponent(page, `Bind token ${Date.now()}`)
    await openTokens(page)
    await page.getByTestId("add-starter-tokens").click()

    await selectLayer(page, "Root")
    await page.getByTestId("fill-picker").selectOption({ label: "Primary" })

    await expect.poll(() => rootBackground(page)).toBe("rgb(59, 91, 253)")
    // The literal control is gone; the field shows what it now reads from.
    await expect(page.getByTestId("fill-token")).toHaveText("Primary")

    // Editing the token moves every layer reading it. That is the whole point.
    await openTokens(page)
    await page.getByTestId("token-Primary").fill("#00cc00")

    await expect.poll(() => rootBackground(page)).toBe("rgb(0, 204, 0)")
  })

  test("detaching keeps the value the token held", async ({ page }) => {
    await createComponent(page, `Detach ${Date.now()}`)
    await openTokens(page)
    await page.getByTestId("add-starter-tokens").click()

    await selectLayer(page, "Root")
    await page.getByTestId("fill-picker").selectOption({ label: "Primary" })
    await expect(page.getByTestId("fill-token")).toBeVisible()

    await page.getByTestId("fill-detach").click()

    await expect(page.getByTestId("fill-input")).toHaveValue("#3b5bfd")
    await expect.poll(() => rootBackground(page)).toBe("rgb(59, 91, 253)")
  })

  test("deleting a token leaves the layers looking the same", async ({ page }) => {
    await createComponent(page, `Delete token ${Date.now()}`)
    await openTokens(page)
    await page.getByTestId("add-starter-tokens").click()

    await selectLayer(page, "Root")
    await page.getByTestId("fill-picker").selectOption({ label: "Primary" })
    await expect.poll(() => rootBackground(page)).toBe("rgb(59, 91, 253)")

    await openTokens(page)
    await page
      .getByTestId("token-row")
      .filter({ has: page.getByLabel("Rename Primary") })
      .getByTestId("delete-token")
      .click()

    // A dangling reference would blank the fill; the value is inlined instead.
    await expect.poll(() => rootBackground(page)).toBe("rgb(59, 91, 253)")
  })

  test("exports a tokens object the component references", async ({ page }) => {
    await createComponent(page, `Export tokens ${Date.now()}`)
    await openTokens(page)
    await page.getByTestId("add-starter-tokens").click()

    await selectLayer(page, "Root")
    await page.getByTestId("fill-picker").selectOption({ label: "Primary" })
    await page.getByTestId("radius-picker").selectOption({ label: "Radius lg" })

    await page.getByTestId("export-open").click()
    const code = await page.getByTestId("export-code").innerText()

    expect(code).toContain("const tokens = {")
    expect(code).toContain(`primary: "#3b5bfd",`)
    expect(code).toContain("backgroundColor: tokens.primary,")
    expect(code).toContain("borderTopLeftRadius: tokens.radiusLg,")
    // Only what the component uses: the starter set has sixteen tokens.
    expect(code).not.toContain("Space 5")
    expect(code).not.toContain("#71717a")
  })

  test("keeps tokens across a reload", async ({ page }) => {
    await createComponent(page, `Persist tokens ${Date.now()}`)
    await openTokens(page)
    await page.getByTestId("add-starter-tokens").click()

    await selectLayer(page, "Root")
    await page.getByTestId("fill-picker").selectOption({ label: "Primary" })
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 })

    await page.reload()

    await expect.poll(() => rootBackground(page)).toBe("rgb(59, 91, 253)")
    await selectLayer(page, "Root")
    await expect(page.getByTestId("fill-token")).toHaveText("Primary")
  })
})
