"use client"

/**
 * The variant switcher, and the single most important piece of state in the
 * editor: whether you are editing the base design or one variant's deltas.
 *
 * It sits above the canvas rather than in a side rail because it changes what
 * every subsequent edit means.
 */

import { useEditor } from "@/editor/store"
import { removeVariant } from "@/model/ops"

import { Button } from "./controls"

export function VariantBar() {
  const doc = useEditor((s) => s.doc)
  const activeVariantId = useEditor((s) => s.activeVariantId)
  const setActiveVariant = useEditor((s) => s.setActiveVariant)
  const apply = useEditor((s) => s.apply)

  const describe = (variantId: string): string => {
    const selector = doc.variants.find((v) => v.id === variantId)?.selector
    if (!selector) return ""

    if (selector.kind === "prop") {
      const prop = doc.props.find((p) => p.id === selector.propId)
      return `${prop?.name ?? "?"} = ${selector.value}`
    }
    const state = doc.states.find((s) => s.id === selector.stateId)
    return state ? `on ${state.trigger}` : ""
  }

  return (
    <div className="flex items-center gap-1 border-b border-chrome-border bg-chrome-panel px-3 py-2">
      <button
        type="button"
        data-testid="variant-base"
        onClick={() => setActiveVariant(null)}
        className={`rounded px-2 py-1 text-xs transition ${
          activeVariantId === null
            ? "bg-chrome-accent text-white"
            : "text-chrome-muted hover:bg-white/5"
        }`}
      >
        Base
      </button>

      <span className="px-1 text-chrome-border">/</span>

      {doc.variants.length === 0 && (
        <span className="text-xs text-chrome-muted">
          No variants yet — add a state or an enum prop in the Component panel.
        </span>
      )}

      {doc.variants.map((variant) => (
        <div key={variant.id} className="group relative">
          <button
            type="button"
            data-testid="variant-chip"
            title={describe(variant.id)}
            onClick={() => setActiveVariant(variant.id)}
            className={`rounded px-2 py-1 text-xs transition ${
              activeVariantId === variant.id
                ? "bg-chrome-accent text-white"
                : "text-chrome-muted hover:bg-white/5"
            }`}
          >
            {variant.name}
            <span className="pl-1 opacity-60">{describe(variant.id)}</span>
          </button>

          <button
            type="button"
            title="Delete variant"
            className="absolute -right-1 -top-1 hidden h-4 w-4 rounded-full bg-chrome-border text-[10px] text-chrome-text group-hover:block"
            onClick={() => {
              apply((doc) => removeVariant(doc, variant.id))
              if (activeVariantId === variant.id) setActiveVariant(null)
            }}
          >
            ✕
          </button>
        </div>
      ))}

      <div className="flex-1" />

      <ForcedStateToggles />
    </div>
  )
}

/**
 * Pin an interaction state on so the canvas shows it. Independent of which
 * variant is being edited — useful for checking a hover design against the
 * ghost tone without switching variants twice.
 */
function ForcedStateToggles() {
  const doc = useEditor((s) => s.doc)
  const forcedStates = useEditor((s) => s.forcedStates)
  const toggleForcedState = useEditor((s) => s.toggleForcedState)

  const pointerStates = doc.states.filter((s) => s.trigger !== "disabled")
  if (pointerStates.length === 0) return null

  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-chrome-muted">Preview:</span>
      {pointerStates.map((state) => (
        <Button
          key={state.id}
          variant={forcedStates.includes(state.trigger) ? "accent" : "default"}
          onClick={() => toggleForcedState(state.trigger)}
        >
          {state.trigger}
        </Button>
      ))}
    </div>
  )
}
