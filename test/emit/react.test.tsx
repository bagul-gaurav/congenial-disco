import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Preview, activeVariantIds, propValues } from "@/emit/react"

import { buttonFixture } from "../fixtures/button"

describe("Preview", () => {
  it("renders bound text from the prop's default value", () => {
    const { doc } = buttonFixture()
    render(<Preview doc={doc} interactive={false} />)

    expect(screen.getByText("Click me")).toBeDefined()
  })

  it("renders bound text from a supplied value", () => {
    const { doc, ids } = buttonFixture()
    render(<Preview doc={doc} interactive={false} values={{ [ids.labelProp]: "Submit" }} />)

    expect(screen.getByText("Submit")).toBeDefined()
  })

  it("applies the base style", () => {
    const { doc, ids } = buttonFixture()
    const { container } = render(<Preview doc={doc} interactive={false} />)
    const root = container.querySelector(`[data-node-id="${ids.root}"]`) as HTMLElement

    expect(root.style.backgroundColor).toBe("rgb(59, 91, 253)")
    expect(root.style.display).toBe("flex")
  })

  it("applies a prop-driven variant when the prop matches", () => {
    const { doc, ids } = buttonFixture()
    const { container } = render(
      <Preview doc={doc} interactive={false} values={{ [ids.toneProp]: "ghost" }} />,
    )
    const root = container.querySelector(`[data-node-id="${ids.root}"]`) as HTMLElement

    expect(root.style.backgroundColor).toBe("rgb(255, 255, 255)")
  })

  it("applies a forced interaction state", () => {
    const { doc, ids } = buttonFixture()
    const { container } = render(
      <Preview doc={doc} interactive={false} forcedStates={["hover"]} />,
    )
    const root = container.querySelector(`[data-node-id="${ids.root}"]`) as HTMLElement
    const arrow = container.querySelector(`[data-node-id="${ids.label2}"]`) as HTMLElement

    expect(root.style.backgroundColor).toBe("rgb(47, 74, 208)")
    // The hidden arrow is revealed by the hover variant — the same override the
    // exporter turns into a labelled motion variant.
    expect(arrow.style.display).toBe("block")
  })

  it("hides a layer that is hidden in the base design", () => {
    const { doc, ids } = buttonFixture()
    const { container } = render(<Preview doc={doc} interactive={false} />)
    const arrow = container.querySelector(`[data-node-id="${ids.label2}"]`) as HTMLElement

    expect(arrow.style.display).toBe("none")
  })

  it("lets a state variant win over a prop variant, as the exporter does", () => {
    const { doc, ids } = buttonFixture()
    const { container } = render(
      <Preview
        doc={doc}
        interactive={false}
        forcedStates={["hover"]}
        values={{ [ids.toneProp]: "ghost" }}
      />,
    )
    const root = container.querySelector(`[data-node-id="${ids.root}"]`) as HTMLElement

    expect(root.style.backgroundColor).toBe("rgb(47, 74, 208)")
    // Ghost's border is untouched by hover and must survive.
    expect(root.style.borderColor).toBe("rgb(59, 91, 253)")
  })

  it("activates the disabled variant from its backing prop", () => {
    const { doc, ids } = buttonFixture()
    const values = propValues(doc, { [ids.disabledProp]: true })

    expect(activeVariantIds(doc, values)).toContain(ids.disabledVariant)
  })

  it("does not activate a state variant unless the state is forced", () => {
    const { doc, ids } = buttonFixture()

    expect(activeVariantIds(doc, propValues(doc))).not.toContain(ids.hoverVariant)
    expect(activeVariantIds(doc, propValues(doc), ["hover"])).toContain(ids.hoverVariant)
  })

  it("exposes each node's element for the canvas to measure", () => {
    const { doc, ids } = buttonFixture()
    const seen: string[] = []

    render(
      <Preview
        doc={doc}
        interactive={false}
        onNodeRef={(nodeId, element) => {
          if (element) seen.push(nodeId)
        }}
      />,
    )

    expect(seen).toContain(ids.root)
    expect(seen).toContain(ids.label)
  })
})
