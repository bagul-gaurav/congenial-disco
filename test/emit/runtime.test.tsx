import { fireEvent, render, waitFor } from "@testing-library/react"
import { beforeAll, describe, expect, it } from "vitest"

import { registeredControls } from "../shims/framer"

/**
 * Executes a generated component for real: emitted to disk, imported through
 * Vite with the `framer` module aliased to a stub, and rendered against the
 * actual framer-motion package.
 *
 * This is the test that retires the riskiest assumption in the exporter — that
 * a hover on the root propagates a named variant down to a nested layer. That
 * behaviour belongs to framer-motion, not to us, so asserting it against the
 * real library is the only way to know the export works before pasting it into
 * Framer.
 */

// A glob rather than a direct import: the file is emitted by the global setup
// and gitignored, so a static import would fail type checking and Vite's
// import analysis. The glob is resolved after the setup has written it.
const generated = import.meta.glob<{ default: React.ComponentType<Record<string, unknown>> }>(
  "../generated/*.tsx",
)

let Button: React.ComponentType<Record<string, unknown>>
let TokenCard: React.ComponentType<Record<string, unknown>>

beforeAll(async () => {
  const load = generated["../generated/RuntimeButton.tsx"]
  if (!load) throw new Error("RuntimeButton.tsx was not generated")
  Button = (await load()).default

  const loadTokens = generated["../generated/RuntimeTokens.tsx"]
  if (!loadTokens) throw new Error("RuntimeTokens.tsx was not generated")
  TokenCard = (await loadTokens()).default
})

describe("a generated component, executed", () => {
  it("renders and shows the default label", () => {
    const { getByText } = render(<Button />)
    expect(getByText("Click me")).toBeDefined()
  })

  it("renders a supplied prop value", () => {
    const { getByText } = render(<Button label="Submit" />)
    expect(getByText("Submit")).toBeDefined()
  })

  it("registers its property controls with Framer", () => {
    render(<Button />)
    const controls = registeredControls.get(Button) as Record<string, { type: string }>

    expect(Object.keys(controls).sort()).toEqual(["disabled", "label", "onTap", "tone"])
    expect(controls.tone.type).toBe("enum")
  })

  it("applies a prop-driven variant", () => {
    const { container } = render(<Button tone="ghost" />)
    const root = container.firstElementChild as HTMLElement

    expect(root.style.backgroundColor).toBe("rgb(255, 255, 255)")
  })

  it("applies the disabled variant as a conditional style", () => {
    const { container } = render(<Button disabled />)
    const root = container.firstElementChild as HTMLElement

    expect(root.style.opacity).toBe("0.4")
  })

  it("propagates a root hover down to a nested layer", async () => {
    const { container } = render(<Button />)
    const root = container.firstElementChild as HTMLElement
    const arrow = container.querySelectorAll("p")[1] as HTMLElement

    expect(arrow.style.display).toBe("none")

    fireEvent.pointerEnter(root)

    // The arrow is display:none and can never be hovered itself. It becomes
    // visible only because the root's hover label reached it — exactly the bug
    // that a per-layer whileHover would have shipped silently.
    await waitFor(() => expect(arrow.style.display).toBe("block"))
  })

  it("returns to the resting state when the pointer leaves", async () => {
    const { container } = render(<Button />)
    const root = container.firstElementChild as HTMLElement
    const arrow = container.querySelectorAll("p")[1] as HTMLElement

    fireEvent.pointerEnter(root)
    await waitFor(() => expect(arrow.style.display).toBe("block"))

    fireEvent.pointerLeave(root)

    // Without an explicit `rest` entry the layer would stay stuck open.
    await waitFor(() => expect(arrow.style.display).toBe("none"))
  })

  it("does not animate on hover while disabled", async () => {
    const { container } = render(<Button disabled />)
    const root = container.firstElementChild as HTMLElement
    const arrow = container.querySelectorAll("p")[1] as HTMLElement

    fireEvent.pointerEnter(root)

    // Give the animation loop the same chance it gets in the enabled case; the
    // arrow must still be hidden because `whileHover` was withheld entirely.
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(arrow.style.display).toBe("none")
  })

  it("calls the tap handler, and not when disabled", () => {
    const taps: string[] = []

    const enabled = render(<Button onTap={() => taps.push("enabled")} />)
    fireEvent.pointerDown(enabled.container.firstElementChild as HTMLElement)
    fireEvent.pointerUp(enabled.container.firstElementChild as HTMLElement)

    const off = render(<Button disabled onTap={() => taps.push("disabled")} />)
    fireEvent.pointerDown(off.container.firstElementChild as HTMLElement)
    fireEvent.pointerUp(off.container.firstElementChild as HTMLElement)

    expect(taps).not.toContain("disabled")
  })
})

describe("a generated component that uses design tokens", () => {
  it("renders the token values", () => {
    const { container } = render(<TokenCard />)
    const root = container.firstElementChild as HTMLElement
    const label = container.querySelector("p") as HTMLElement

    // The same values the canvas preview resolves — proving the two paths
    // agree about tokens, not just about literals.
    expect(root.style.backgroundColor).toBe("rgb(59, 91, 253)")
    expect(root.style.gap).toBe("12px")
    expect(label.style.color).toBe("rgb(255, 255, 255)")
    expect(label.style.fontSize).toBe("15px")
  })

  it("applies a tokenised radius through the longhand properties", () => {
    const { container } = render(<TokenCard />)
    const root = container.firstElementChild as HTMLElement

    // The shorthand cannot carry a reference, so codegen emits four longhands;
    // this is where that decision either works in a browser or does not.
    expect(root.style.borderTopLeftRadius).toBe("8px")
    expect(root.style.borderBottomRightRadius).toBe("8px")
  })

  it("applies tokenised padding on every side", () => {
    const { container } = render(<TokenCard />)
    const root = container.firstElementChild as HTMLElement

    expect(root.style.paddingTop).toBe("12px")
    expect(root.style.paddingRight).toBe("12px")
    expect(root.style.paddingBottom).toBe("12px")
    expect(root.style.paddingLeft).toBe("12px")
  })
})
