import { expect, type Page } from "@playwright/test"

/**
 * Opens the seeded demo component from the projects page.
 *
 * Going through the list rather than a hardcoded id means the projects page is
 * exercised on every run, and the tests never depend on database ids.
 */
export async function openDemoComponent(page: Page) {
  await page.goto("/projects")
  await page.getByRole("link", { name: "Primary Button" }).first().click()
  await expect(page.getByTestId("canvas")).toBeVisible()
  // The canvas renders through the same Preview the exporter shares; waiting on
  // a real layer means the document actually resolved.
  await expect(page.locator("[data-node-id]").first()).toBeVisible()
}

/** Creates a component from the projects page and lands in its editor. */
export async function createComponent(page: Page, name: string) {
  await page.goto("/projects")
  await page.getByPlaceholder("Primary Button").fill(name)
  await page.getByRole("button", { name: "New component" }).click()
  await expect(page.getByTestId("canvas")).toBeVisible()
}

/** The root frame's rendered background colour, as the browser computes it. */
export async function rootBackground(page: Page): Promise<string> {
  const root = page.locator("[data-node-id]").first()
  return root.evaluate((el) => getComputedStyle(el).backgroundColor)
}

/** Selects a layer by its name in the layer tree. */
export async function selectLayer(page: Page, name: string) {
  await page.getByTestId("layer-row").filter({ hasText: name }).first().click()
}

/** Waits for the autosave indicator to settle on "Saved". */
export async function waitForSave(page: Page) {
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 })
}
