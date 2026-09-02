/**
 * A minimal stand-in for Framer's ambient module types.
 *
 * The compile test writes generated components into `test/generated/` and runs
 * `tsc --noEmit` over them with this shim on the path. That catches malformed
 * output — a bad identifier, a mistyped control, a broken JSX tree — before it
 * ever reaches Framer, where the only feedback is a red box on the canvas.
 *
 * It deliberately describes only the surface the emitter uses.
 */

declare module "framer" {
  export const ControlType: {
    String: "string"
    Number: "number"
    Boolean: "boolean"
    Enum: "enum"
    Color: "color"
    Image: "image"
    Link: "link"
    EventHandler: "eventhandler"
    ComponentInstance: "componentinstance"
    Object: "object"
    Array: "array"
  }

  export interface PropertyControl {
    type: string
    title?: string
    description?: string
    defaultValue?: unknown
    options?: readonly string[]
    optionTitles?: readonly string[]
  }

  export function addPropertyControls(
    component: unknown,
    controls: Record<string, PropertyControl>,
  ): void
}

declare module "framer-motion" {
  import type * as React from "react"

  type Variants = Record<string, Record<string, unknown>>

  interface MotionProps {
    variants?: Variants
    initial?: string | boolean | Record<string, unknown>
    animate?: string | Record<string, unknown>
    whileHover?: string | Record<string, unknown>
    whileTap?: string | Record<string, unknown>
    whileFocus?: string | Record<string, unknown>
    onTap?: (() => void) | undefined
    transition?: Record<string, unknown>
  }

  type MotionComponent<T extends keyof React.JSX.IntrinsicElements> = React.ComponentType<
    React.JSX.IntrinsicElements[T] & MotionProps
  >

  export const motion: {
    div: MotionComponent<"div">
    p: MotionComponent<"p">
    span: MotionComponent<"span">
    img: MotionComponent<"img">
    a: MotionComponent<"a">
  }
}
