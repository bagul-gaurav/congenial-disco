"use client"

/**
 * The public, read-only view of a shared component.
 *
 * Deliberately not the editor: it shows the component running, lets you flip
 * its props and states to see how it behaves, and hands over the generated
 * code. That is what a reviewer or a developer receiving the link actually
 * needs — nothing here can modify the document.
 */

import * as React from "react"

import { Preview, propValues, type PropValues } from "@/emit/react"
import { emitComponent } from "@/emit/tsx"
import type { ComponentDoc, PropValue, StateTrigger } from "@/model/types"

const POINTER_STATES: StateTrigger[] = ["hover", "tap", "focus"]

export function SharedComponent({ doc, updatedAt }: { doc: ComponentDoc; updatedAt: string }) {
  const [values, setValues] = React.useState<PropValues>(() => propValues(doc))
  const [forced, setForced] = React.useState<StateTrigger[]>([])
  const [showCode, setShowCode] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const { code, componentName } = React.useMemo(() => emitComponent(doc), [doc])

  const set = (id: string, value: PropValue) =>
    setValues((current) => ({ ...current, [id]: value }))

  const availableStates = doc.states.filter((s) => POINTER_STATES.includes(s.trigger))

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard access can be denied; the code is on screen and selectable.
      setCopied(false)
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-medium">{doc.name}</h1>
        <span className="text-xs text-chrome-muted">
          read-only · updated {new Date(updatedAt).toLocaleDateString()}
        </span>
      </header>

      {doc.description && <p className="pt-2 text-sm text-chrome-muted">{doc.description}</p>}

      {/* Light ground: a component is designed against a page, not against the
          editor's dark chrome. */}
      <div className="mt-8 flex min-h-56 items-center justify-center rounded-lg border border-chrome-border bg-[#f4f4f5] p-10">
        <Preview doc={doc} values={values} forcedStates={forced} />
      </div>

      <div className="grid gap-8 pt-8 md:grid-cols-2">
        <section>
          <h2 className="pb-2 text-[11px] font-medium uppercase tracking-wide text-chrome-muted">
            Props
          </h2>
          {doc.props.length === 0 ? (
            <p className="text-sm text-chrome-muted">This component takes no props.</p>
          ) : (
            <div className="space-y-2">
              {doc.props.map((prop) => (
                <label key={prop.id} className="flex items-center gap-3 text-xs">
                  <span className="w-24 shrink-0 text-chrome-muted">{prop.name}</span>
                  <PropControl
                    prop={prop}
                    value={values[prop.id]}
                    onChange={(value) => set(prop.id, value)}
                  />
                </label>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="pb-2 text-[11px] font-medium uppercase tracking-wide text-chrome-muted">
            States
          </h2>
          {availableStates.length === 0 ? (
            <p className="text-sm text-chrome-muted">No interaction states.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableStates.map((state) => (
                <button
                  key={state.id}
                  type="button"
                  onClick={() =>
                    setForced((current) =>
                      current.includes(state.trigger)
                        ? current.filter((t) => t !== state.trigger)
                        : [...current, state.trigger],
                    )
                  }
                  className={`rounded px-2 py-1 text-xs transition ${
                    forced.includes(state.trigger)
                      ? "bg-chrome-accent text-white"
                      : "border border-chrome-border text-chrome-muted hover:bg-white/5"
                  }`}
                >
                  {state.name}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="pt-10">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="toggle-code"
            onClick={() => setShowCode((v) => !v)}
            className="rounded border border-chrome-border px-3 py-1.5 text-xs text-chrome-text transition hover:bg-white/5"
          >
            {showCode ? "Hide" : "Show"} Framer component
          </button>
          {showCode && (
            <button
              type="button"
              onClick={copy}
              className="rounded bg-chrome-accent px-3 py-1.5 text-xs text-white transition hover:opacity-90"
            >
              {copied ? "Copied" : `Copy ${componentName}.tsx`}
            </button>
          )}
        </div>

        {showCode && (
          <pre className="mt-4 max-h-[28rem] overflow-auto rounded border border-chrome-border bg-chrome-panel p-4 text-xs leading-relaxed">
            <code data-testid="shared-code">{code}</code>
          </pre>
        )}
      </section>
    </main>
  )
}

function PropControl({
  prop,
  value,
  onChange,
}: {
  prop: ComponentDoc["props"][number]
  value: PropValue
  onChange: (value: PropValue) => void
}) {
  const base =
    "min-w-0 flex-1 rounded border border-chrome-border bg-chrome-panel px-2 py-1 text-xs text-chrome-text outline-none focus:border-chrome-accent"

  switch (prop.type) {
    case "boolean":
      return (
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      )
    case "enum":
      return (
        <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={base}>
          {(prop.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )
    case "number":
      return (
        <input
          type="number"
          value={Number(value ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
          className={base}
        />
      )
    case "color":
      return (
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border border-chrome-border bg-transparent"
        />
      )
    case "event":
      // Nothing to set: an event prop is wired up in Framer, not here.
      return <span className="text-chrome-muted">callback</span>
    default:
      return (
        <input
          type="text"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      )
  }
}
