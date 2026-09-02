/**
 * Runtime stand-in for the `framer` module.
 *
 * Aliased in `vitest.config.ts` so a generated component can be imported and
 * actually executed in tests. Framer supplies the real thing; all the generated
 * code needs from it is `ControlType` and a place to register controls.
 */

export const ControlType = {
  String: "string",
  Number: "number",
  Boolean: "boolean",
  Enum: "enum",
  Color: "color",
  Image: "image",
  Link: "link",
  EventHandler: "eventhandler",
  ComponentInstance: "componentinstance",
  Object: "object",
  Array: "array",
} as const

/** Controls registered by components imported during a test run. */
export const registeredControls = new Map<unknown, Record<string, unknown>>()

export function addPropertyControls(
  component: unknown,
  controls: Record<string, unknown>,
): void {
  registeredControls.set(component, controls)
}
