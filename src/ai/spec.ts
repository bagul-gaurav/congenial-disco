/**
 * Plain-language description → a proposed component API.
 *
 * The first step of the workflow: you say what the component does, and this
 * turns that into a props schema and a list of interaction states you can edit
 * before designing anything. It proposes, it does not decide — the panel merges
 * the result into whatever you have already defined.
 *
 * Runs through OpenRouter's OpenAI-compatible endpoint, using JSON-schema
 * structured outputs so the response shape is enforced by the provider rather
 * than parsed hopefully. The result is validated again with Zod on arrival,
 * because a model that satisfies a schema can still propose nonsense values.
 */

import { z } from "zod"

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5"

export const PROP_TYPES = [
  "text",
  "number",
  "boolean",
  "enum",
  "color",
  "image",
  "link",
  "event",
] as const

export const STATE_TRIGGERS = ["hover", "tap", "focus", "disabled"] as const

export const SpecSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  props: z.array(
    z.object({
      name: z.string().min(1),
      type: z.enum(PROP_TYPES),
      description: z.string().optional(),
      defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
      options: z.array(z.string()).optional(),
    }),
  ),
  states: z.array(
    z.object({
      name: z.string().min(1),
      trigger: z.enum(STATE_TRIGGERS),
    }),
  ),
})

export type Spec = z.infer<typeof SpecSchema>

/**
 * The JSON Schema handed to the provider. Written out rather than generated
 * from the Zod schema so the two can differ where they should: the wire schema
 * uses `strict` mode, which requires every property to be listed in `required`
 * even when it is nullable.
 */
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "description", "props", "states"],
  properties: {
    name: { type: "string", description: "PascalCase component name." },
    description: { type: "string", description: "One sentence on what it does." },
    props: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "type", "description", "defaultValue", "options"],
        properties: {
          name: { type: "string", description: "camelCase identifier." },
          type: { type: "string", enum: [...PROP_TYPES] },
          description: { type: "string" },
          defaultValue: { type: ["string", "number", "boolean", "null"] },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Values for an enum prop; empty for every other type.",
          },
        },
      },
    },
    states: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "trigger"],
        properties: {
          name: { type: "string" },
          trigger: { type: "string", enum: [...STATE_TRIGGERS] },
        },
      },
    },
  },
} as const

const SYSTEM_PROMPT = `You design the API of a single UI component.

Given a plain-language description, propose:
- the props a designer would want to control, and
- the interaction states the component should respond to.

Rules:
- Prop names are camelCase identifiers.
- Use "event" for callbacks (onTap, onChange). Their defaultValue is null.
- Use "enum" only when there is a small fixed set of choices, and list them in options.
- Use "text" for user-visible strings, "link" for URLs, "image" for image sources.
- Propose a "disabled" boolean prop whenever you propose a disabled state.
- Include the hover state for anything clickable.
- Keep it minimal. Six props is a lot. Do not invent styling props such as
  padding or fontSize: those are designed on the canvas, not passed in.`

export interface GenerateOptions {
  description: string
  apiKey: string
  model?: string
  siteUrl?: string
  siteName?: string
  signal?: AbortSignal
}

export async function generateSpec(options: GenerateOptions): Promise<Spec> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
  }
  // OpenRouter uses these for attribution on its dashboard; both are optional.
  if (options.siteUrl) headers["HTTP-Referer"] = options.siteUrl
  if (options.siteName) headers["X-Title"] = options.siteName

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers,
    signal: options.signal,
    body: JSON.stringify({
      model: options.model ?? DEFAULT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: options.description },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "component_spec", strict: true, schema: RESPONSE_SCHEMA },
      },
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenRouter request failed (${response.status}): ${body.slice(0, 500)}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    error?: { message?: string }
  }

  if (payload.error) throw new Error(payload.error.message ?? "OpenRouter returned an error")

  const content = payload.choices?.[0]?.message?.content
  if (!content) throw new Error("OpenRouter returned no content")

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error("OpenRouter returned content that is not valid JSON")
  }

  return normalize(SpecSchema.parse(parsed))
}

/**
 * Tidy up a valid-but-unhelpful proposal: strip options from non-enum props,
 * drop enum props with nothing to choose between, and make sure a disabled
 * state has a boolean prop to be driven by.
 */
export function normalize(spec: Spec): Spec {
  const props = spec.props
    .map((prop) => ({
      ...prop,
      options: prop.type === "enum" ? (prop.options ?? []) : undefined,
      defaultValue: prop.type === "event" ? null : prop.defaultValue,
    }))
    .filter((prop) => prop.type !== "enum" || (prop.options?.length ?? 0) > 1)

  const wantsDisabled = spec.states.some((state) => state.trigger === "disabled")
  const hasDisabledProp = props.some((p) => p.name === "disabled" && p.type === "boolean")

  if (wantsDisabled && !hasDisabledProp) {
    props.push({
      name: "disabled",
      type: "boolean",
      description: "Disables the component.",
      defaultValue: false,
      options: undefined,
    })
  }

  // One state per trigger: two "hover" states would compete for the same label.
  const seen = new Set<string>()
  const states = spec.states.filter((state) => {
    if (seen.has(state.trigger)) return false
    seen.add(state.trigger)
    return true
  })

  return { ...spec, props, states }
}
