"use client"

/**
 * The spec panel — where the workflow actually starts.
 *
 * You describe the component in a sentence, the model proposes a props API and
 * a set of interaction states, and you edit the proposal. Only then do you go
 * and design what those states look like. The design serves a declared API
 * rather than the API being reverse-engineered from a finished drawing.
 */

import * as React from "react"

import { useEditor } from "@/editor/store"
import { createProp, createState, createVariant, defaultValueFor } from "@/model/defaults"
import { addProp, addState, addVariant, removeProp, removeState, updateProp, updateState } from "@/model/ops"
import type { PropType, StateTrigger } from "@/model/types"

import { Button, Field, Select, TextInput } from "./controls"
import { PanelHeading } from "./LayerTree"

const PROP_TYPES: PropType[] = [
  "text",
  "number",
  "boolean",
  "enum",
  "color",
  "image",
  "link",
  "event",
]

const TRIGGERS: StateTrigger[] = ["hover", "tap", "focus", "disabled"]

interface SpecResponse {
  name: string
  description: string
  props: Array<{ name: string; type: PropType; defaultValue?: unknown; options?: string[]; description?: string }>
  states: Array<{ name: string; trigger: StateTrigger }>
}

export function SpecPanel() {
  const doc = useEditor((s) => s.doc)
  const apply = useEditor((s) => s.apply)

  const [description, setDescription] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const generate = async () => {
    if (!description.trim()) return
    setBusy(true)
    setError(null)

    try {
      const response = await fetch("/api/spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Request failed (${response.status})`)
      }

      const spec = (await response.json()) as SpecResponse

      // The proposal is merged, not applied wholesale: anything already defined
      // stays, so re-running against a refined description is safe.
      apply((current) => {
        let next = { ...current, name: current.name || spec.name, description: spec.description }

        for (const proposed of spec.props) {
          if (next.props.some((p) => p.name.toLowerCase() === proposed.name.toLowerCase())) continue
          next = addProp(
            next,
            createProp({
              name: proposed.name,
              type: proposed.type,
              options: proposed.options,
              description: proposed.description,
              defaultValue:
                (proposed.defaultValue as never) ?? defaultValueFor(proposed.type, proposed.options),
            }),
          )
        }

        for (const proposed of spec.states) {
          if (next.states.some((s) => s.trigger === proposed.trigger)) continue
          const backing =
            proposed.trigger === "disabled"
              ? next.props.find((p) => p.type === "boolean" && p.name.toLowerCase() === "disabled")
              : undefined
          next = addState(next, createState(proposed.name, proposed.trigger, backing?.id))
        }

        return next
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeading>Component</PanelHeading>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        <section className="border-b border-chrome-border pb-3">
          <Field label="Name">
            <TextInput
              value={doc.name}
              onChange={(event) => apply((current) => ({ ...current, name: event.target.value }))}
            />
          </Field>

          <label className="block pt-2 text-xs text-chrome-muted">
            Describe what it does
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="A primary button with a label, a tone, and a disabled state"
              className="mt-1 w-full resize-none rounded border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text outline-none focus:border-chrome-accent"
            />
          </label>

          <Button variant="accent" className="mt-2 w-full" disabled={busy} onClick={generate}>
            {busy ? "Thinking…" : "Propose props & states"}
          </Button>

          {error && <p className="pt-2 text-xs text-red-400">{error}</p>}
        </section>

        <PropsSection />
        <StatesSection />
      </div>
    </div>
  )
}

function PropsSection() {
  const doc = useEditor((s) => s.doc)
  const apply = useEditor((s) => s.apply)

  return (
    <section className="border-b border-chrome-border py-3">
      <div className="flex items-center justify-between pb-1">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-chrome-muted">Props</h3>
        <Button
          onClick={() => apply((doc) => addProp(doc, createProp({ name: "value", type: "text" })))}
        >
          Add
        </Button>
      </div>

      {doc.props.length === 0 && (
        <p className="text-xs text-chrome-muted">No props yet. These become controls in Framer.</p>
      )}

      {doc.props.map((prop) => (
        <div key={prop.id} className="mb-2 rounded border border-chrome-border p-2">
          <div className="flex items-center gap-2">
            <TextInput
              value={prop.name}
              onChange={(event) =>
                apply((doc) => updateProp(doc, prop.id, { name: event.target.value }))
              }
            />
            <Select
              value={prop.type}
              options={PROP_TYPES.map((t) => ({ value: t, label: t }))}
              onCommit={(type) =>
                apply((doc) =>
                  updateProp(doc, prop.id, {
                    type: type as PropType,
                    defaultValue: defaultValueFor(type as PropType, prop.options),
                  }),
                )
              }
            />
            <Button title="Delete prop" onClick={() => apply((doc) => removeProp(doc, prop.id))}>
              ✕
            </Button>
          </div>

          {prop.type === "enum" && (
            <Field label="Options">
              <TextInput
                value={(prop.options ?? []).join(", ")}
                placeholder="primary, ghost"
                onChange={(event) => {
                  const options = event.target.value
                    .split(",")
                    .map((o) => o.trim())
                    .filter(Boolean)
                  apply((doc) => updateProp(doc, prop.id, { options }))
                }}
              />
            </Field>
          )}

          <label className="flex items-center gap-2 pt-1 text-xs text-chrome-muted">
            <input
              type="checkbox"
              checked={prop.exposed}
              onChange={(event) =>
                apply((doc) => updateProp(doc, prop.id, { exposed: event.target.checked }))
              }
            />
            Show as a control in Framer
          </label>

          {prop.type === "enum" && (prop.options?.length ?? 0) > 0 && (
            <VariantShortcuts propId={prop.id} options={prop.options ?? []} />
          )}
        </div>
      ))}
    </section>
  )
}

/** One click to create the variant that designs a given enum value. */
function VariantShortcuts({ propId, options }: { propId: string; options: string[] }) {
  const doc = useEditor((s) => s.doc)
  const apply = useEditor((s) => s.apply)
  const setActiveVariant = useEditor((s) => s.setActiveVariant)

  const missing = options.filter(
    (value) =>
      !doc.variants.some(
        (v) => v.selector.kind === "prop" && v.selector.propId === propId && v.selector.value === value,
      ),
  )

  if (missing.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1 pt-2">
      {missing.map((value) => (
        <Button
          key={value}
          onClick={() => {
            const variant = createVariant(value, { kind: "prop", propId, value })
            apply((doc) => addVariant(doc, variant))
            setActiveVariant(variant.id)
          }}
        >
          + design “{value}”
        </Button>
      ))}
    </div>
  )
}

function StatesSection() {
  const doc = useEditor((s) => s.doc)
  const apply = useEditor((s) => s.apply)
  const setActiveVariant = useEditor((s) => s.setActiveVariant)

  const unusedTriggers = TRIGGERS.filter((t) => !doc.states.some((s) => s.trigger === t))
  const booleanProps = doc.props.filter((p) => p.type === "boolean")

  return (
    <section className="py-3">
      <div className="flex items-center justify-between pb-1">
        <h3 className="text-[11px] font-medium uppercase tracking-wide text-chrome-muted">States</h3>
        {unusedTriggers.length > 0 && (
          <Select
            value=""
            options={[
              { value: "", label: "Add…" },
              ...unusedTriggers.map((t) => ({ value: t, label: t })),
            ]}
            onCommit={(trigger) => {
              if (!trigger) return
              apply((doc) => addState(doc, createState(trigger, trigger as StateTrigger)))
            }}
          />
        )}
      </div>

      <p className="pb-2 text-xs text-chrome-muted">
        Hover, tap and focus animate for real in the exported component. Disabled is driven by a
        boolean prop.
      </p>

      {doc.states.map((state) => {
        const variant = doc.variants.find(
          (v) => v.selector.kind === "state" && v.selector.stateId === state.id,
        )

        return (
          <div key={state.id} className="mb-2 rounded border border-chrome-border p-2">
            <div className="flex items-center gap-2">
              <TextInput
                value={state.name}
                onChange={(event) =>
                  apply((doc) => updateState(doc, state.id, { name: event.target.value }))
                }
              />
              <span className="rounded bg-white/5 px-2 py-1 text-[11px] text-chrome-muted">
                {state.trigger}
              </span>
              <Button title="Delete state" onClick={() => apply((doc) => removeState(doc, state.id))}>
                ✕
              </Button>
            </div>

            {state.trigger === "disabled" && (
              <Field label="Driven by">
                <Select
                  value={state.propId ?? ""}
                  options={[
                    { value: "", label: booleanProps.length ? "Choose a prop…" : "Add a boolean prop" },
                    ...booleanProps.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  onCommit={(propId) =>
                    apply((doc) => updateState(doc, state.id, { propId: propId || undefined }))
                  }
                />
              </Field>
            )}

            <Button
              className="mt-2 w-full"
              onClick={() => {
                if (variant) {
                  setActiveVariant(variant.id)
                  return
                }
                const created = createVariant(state.name, { kind: "state", stateId: state.id })
                apply((doc) => addVariant(doc, created))
                setActiveVariant(created.id)
              }}
            >
              {variant ? "Edit this state's design" : "Design this state"}
            </Button>
          </div>
        )
      })}
    </section>
  )
}
