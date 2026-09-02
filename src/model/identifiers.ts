/**
 * Turning human-typed names into safe JavaScript identifiers.
 *
 * Used in two places that must agree: the editor (when naming a prop or a
 * component) and the emitters (when writing that name into source). Keeping one
 * implementation means the name shown in the properties panel is always the
 * name that appears in the exported file.
 */

const RESERVED = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally",
  "for", "function", "if", "import", "in", "instanceof", "new", "null",
  "return", "super", "switch", "this", "throw", "true", "try", "typeof",
  "var", "void", "while", "with", "yield", "let", "static", "await",
  // Not reserved words, but shadowing these inside a component is a trap.
  "props", "children", "style", "key", "ref",
])

function words(input: string): string[] {
  return input
    // split camelCase and PascalCase runs
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
}

/** `"On click!"` → `"onClick"`. Always a valid, non-reserved identifier. */
export function toIdentifier(input: string, fallback = "value"): string {
  const parts = words(input)
  if (parts.length === 0) return fallback

  const [first, ...rest] = parts
  let out =
    first.toLowerCase() +
    rest.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("")

  if (/^[0-9]/.test(out)) out = `_${out}`
  if (RESERVED.has(out)) out = `${out}Value`
  return out || fallback
}

/** `"primary button"` → `"PrimaryButton"`. Used for the component name. */
export function toPascalCase(input: string, fallback = "Component"): string {
  const parts = words(input)
  if (parts.length === 0) return fallback

  let out = parts
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join("")

  if (/^[0-9]/.test(out)) out = `_${out}`
  return out || fallback
}

/**
 * Make `name` unique against `taken` by appending a numeric suffix. Prop names
 * become destructured bindings, so a collision is a syntax error rather than a
 * cosmetic problem.
 */
export function uniqueIdentifier(name: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(name)) return name

  let n = 2
  while (used.has(`${name}${n}`)) n += 1
  return `${name}${n}`
}
