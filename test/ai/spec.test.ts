import { describe, expect, it } from "vitest"

import { SpecSchema, normalize, type Spec } from "@/ai/spec"

function spec(overrides: Partial<Spec> = {}): Spec {
  return {
    name: "Button",
    description: "A button.",
    props: [],
    states: [],
    ...overrides,
  }
}

describe("spec normalisation", () => {
  it("drops an enum prop with nothing to choose between", () => {
    const result = normalize(
      spec({ props: [{ name: "tone", type: "enum", options: ["only"] }] }),
    )

    // A one-value enum is a control that cannot be changed — noise in Framer.
    expect(result.props).toHaveLength(0)
  })

  it("keeps an enum prop with real choices", () => {
    const result = normalize(
      spec({ props: [{ name: "tone", type: "enum", options: ["primary", "ghost"] }] }),
    )

    expect(result.props[0].options).toEqual(["primary", "ghost"])
  })

  it("strips options from non-enum props", () => {
    const result = normalize(
      spec({ props: [{ name: "label", type: "text", options: ["nonsense"] }] }),
    )

    expect(result.props[0].options).toBeUndefined()
  })

  it("forces event props to a null default", () => {
    const result = normalize(
      spec({ props: [{ name: "onTap", type: "event", defaultValue: "click" }] }),
    )

    expect(result.props[0].defaultValue).toBeNull()
  })

  it("adds the boolean prop a disabled state needs to be driven by", () => {
    const result = normalize(spec({ states: [{ name: "Disabled", trigger: "disabled" }] }))

    // Without a backing prop the state can never activate in the exported code.
    expect(result.props).toContainEqual(
      expect.objectContaining({ name: "disabled", type: "boolean" }),
    )
  })

  it("does not duplicate an existing disabled prop", () => {
    const result = normalize(
      spec({
        props: [{ name: "disabled", type: "boolean", defaultValue: false }],
        states: [{ name: "Disabled", trigger: "disabled" }],
      }),
    )

    expect(result.props.filter((p) => p.name === "disabled")).toHaveLength(1)
  })

  it("keeps one state per trigger", () => {
    const result = normalize(
      spec({
        states: [
          { name: "Hover", trigger: "hover" },
          { name: "Hovered", trigger: "hover" },
        ],
      }),
    )

    // Two hover states would compete for the same framer-motion label.
    expect(result.states).toHaveLength(1)
  })
})

describe("spec validation", () => {
  it("rejects an unknown prop type", () => {
    const parsed = SpecSchema.safeParse({
      name: "X",
      description: "",
      props: [{ name: "a", type: "gradient" }],
      states: [],
    })

    expect(parsed.success).toBe(false)
  })

  it("rejects an unknown state trigger", () => {
    const parsed = SpecSchema.safeParse({
      name: "X",
      description: "",
      props: [],
      states: [{ name: "Long press", trigger: "longpress" }],
    })

    expect(parsed.success).toBe(false)
  })

  it("accepts a well-formed spec", () => {
    const parsed = SpecSchema.safeParse({
      name: "Button",
      description: "A button.",
      props: [{ name: "label", type: "text", defaultValue: "Click" }],
      states: [{ name: "Hover", trigger: "hover" }],
    })

    expect(parsed.success).toBe(true)
  })
})
