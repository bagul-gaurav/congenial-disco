"use client"

/**
 * The properties panel.
 *
 * Every edit here goes through the store's `edit`, which routes the change to
 * the active variant as an override when one is selected. So the same controls
 * author the base design and each variant's deltas, and there is no separate
 * "variant mode" to keep consistent.
 *
 * The bind buttons are the "expose as prop" mechanic: they turn a literal value
 * on a layer into a reference to a prop, which is what makes the property show
 * up as an editable control in Framer.
 */

import * as React from "react"

import { useActiveVariant, useEditor, useSelectedNode } from "@/editor/store"
import { corners, createProp, defaultValueFor } from "@/model/defaults"
import { addProp, bindField, clearOverride, unbindField, type BindableField } from "@/model/ops"
import { isBinding, type Node, type PropType, type SizeValue } from "@/model/types"

import { Button, ColorInput, Field, NumberInput, Select, TextInput } from "./controls"
import { PanelHeading } from "./LayerTree"

const SIZE_MODES = [
  { value: "hug", label: "Hug contents" },
  { value: "fill", label: "Fill parent" },
  { value: "fixed", label: "Fixed" },
]

/** Prop types that can meaningfully drive each bindable field. */
const FIELD_PROP_TYPE: Record<BindableField, PropType> = {
  content: "text",
  src: "image",
  fill: "color",
  textColor: "color",
}

export function PropertiesPanel() {
  const node = useSelectedNode()
  const variant = useActiveVariant()

  if (!node) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeading>Properties</PanelHeading>
        <p className="p-3 text-xs text-chrome-muted">Select a layer to edit its properties.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeading>{node.name}</PanelHeading>

      {variant && (
        <div className="border-b border-chrome-border bg-chrome-accent/10 px-3 py-2 text-[11px] text-chrome-text">
          Editing <strong>{variant.name}</strong>. Changes are stored as overrides; the base design
          is untouched.
          <OverrideReset nodeId={node.id} variantId={variant.id} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2">
        <SizeSection node={node} />
        {node.type === "frame" && <LayoutSection node={node} />}
        <AppearanceSection node={node} />
        {node.type === "text" && <TextSection node={node} />}
        <BindingSection node={node} />
      </div>
    </div>
  )
}

function OverrideReset({ nodeId, variantId }: { nodeId: string; variantId: string }) {
  const apply = useEditor((s) => s.apply)
  const hasOverride = useEditor(
    (s) => !!s.doc.variants.find((v) => v.id === variantId)?.overrides[nodeId],
  )

  if (!hasOverride) return null

  return (
    <Button
      className="mt-2 block"
      onClick={() => apply((doc) => clearOverride(doc, variantId, nodeId))}
    >
      Reset to base
    </Button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-chrome-border py-2 last:border-b-0">
      <h3 className="pb-1 text-[11px] font-medium uppercase tracking-wide text-chrome-muted">
        {title}
      </h3>
      {children}
    </section>
  )
}

function SizeSection({ node }: { node: Node }) {
  const edit = useEditor((s) => s.edit)

  const axis = (key: "width" | "height") => {
    const value = node.size[key]
    return (
      <React.Fragment key={key}>
        <Field label={key === "width" ? "Width" : "Height"}>
          <Select
            value={value.mode}
            options={SIZE_MODES}
            onCommit={(mode) => {
              const next: SizeValue =
                mode === "fixed"
                  ? { mode: "fixed", value: value.mode === "fixed" ? value.value : 100 }
                  : (mode as "fill" | "hug") === "fill"
                    ? { mode: "fill" }
                    : { mode: "hug" }
              edit(node.id, { size: { [key]: next } })
            }}
          />
        </Field>
        {value.mode === "fixed" && (
          <Field label="">
            <NumberInput
              value={value.value}
              onCommit={(px) => edit(node.id, { size: { [key]: { mode: "fixed", value: px } } })}
            />
          </Field>
        )}
      </React.Fragment>
    )
  }

  return (
    <Section title="Size">
      {axis("width")}
      {axis("height")}
    </Section>
  )
}

function LayoutSection({ node }: { node: Node }) {
  const edit = useEditor((s) => s.edit)
  const apply = useEditor((s) => s.apply)
  const activeVariantId = useEditor((s) => s.activeVariantId)

  if (node.type !== "frame") return null
  const { layout } = node

  return (
    <Section title="Layout">
      <Field label="Mode">
        <Select
          value={layout.mode}
          options={[
            { value: "stack", label: "Stack (flex)" },
            { value: "absolute", label: "Absolute" },
          ]}
          onCommit={(mode) => {
            // Switching layout mode restructures the frame rather than tweaking
            // a value, so it is a base-design change even inside a variant.
            if (activeVariantId) return
            apply((doc) => {
              const current = doc.nodes[node.id]
              if (current?.type !== "frame") return doc
              const next =
                mode === "absolute"
                  ? { mode: "absolute" as const, padding: current.layout.padding }
                  : {
                      mode: "stack" as const,
                      direction: "row" as const,
                      gap: 8,
                      padding: current.layout.padding,
                      align: "center" as const,
                      justify: "start" as const,
                      wrap: false,
                    }
              return { ...doc, nodes: { ...doc.nodes, [node.id]: { ...current, layout: next } } }
            })
          }}
        />
      </Field>

      {layout.mode === "stack" && (
        <>
          <Field label="Direction">
            <Select
              value={layout.direction}
              options={[
                { value: "row", label: "Horizontal" },
                { value: "column", label: "Vertical" },
              ]}
              onCommit={(direction) =>
                edit(node.id, { layout: { direction: direction as "row" | "column" } })
              }
            />
          </Field>
          <Field label="Gap">
            <NumberInput value={layout.gap} onCommit={(gap) => edit(node.id, { layout: { gap } })} />
          </Field>
          <Field label="Align">
            <Select
              value={layout.align}
              options={["start", "center", "end", "stretch"].map((v) => ({ value: v, label: v }))}
              onCommit={(align) => edit(node.id, { layout: { align: align as never } })}
            />
          </Field>
          <Field label="Justify">
            <Select
              value={layout.justify}
              options={["start", "center", "end", "between", "around"].map((v) => ({
                value: v,
                label: v,
              }))}
              onCommit={(justify) => edit(node.id, { layout: { justify: justify as never } })}
            />
          </Field>
        </>
      )}

      <Field label="Padding">
        <NumberInput
          value={layout.padding.top}
          onCommit={(value) => {
            if (activeVariantId) return
            apply((doc) => {
              const current = doc.nodes[node.id]
              if (current?.type !== "frame") return doc
              return {
                ...doc,
                nodes: {
                  ...doc.nodes,
                  [node.id]: {
                    ...current,
                    layout: {
                      ...current.layout,
                      padding: { top: value, right: value, bottom: value, left: value },
                    },
                  },
                },
              }
            })
          }}
        />
      </Field>
    </Section>
  )
}

function AppearanceSection({ node }: { node: Node }) {
  const edit = useEditor((s) => s.edit)
  const fill = node.style.fill

  return (
    <Section title="Appearance">
      <Field label="Fill">
        {isBinding(fill) ? (
          <BoundValue propId={fill.bind} nodeId={node.id} field="fill" />
        ) : (
          <ColorInput
            value={fill ?? "#ffffff"}
            onCommit={(value) => edit(node.id, { style: { fill: value } })}
          />
        )}
      </Field>

      <Field label="Radius">
        <NumberInput
          value={node.style.corners?.topLeft ?? 0}
          onCommit={(value) => edit(node.id, { style: { corners: corners(value) } })}
        />
      </Field>

      <Field label="Opacity">
        <NumberInput
          value={node.style.opacity ?? 1}
          step={0.05}
          min={0}
          max={1}
          onCommit={(value) => edit(node.id, { style: { opacity: value } })}
        />
      </Field>

      <Field label="Border">
        <NumberInput
          value={node.style.border?.width ?? 0}
          onCommit={(width) =>
            edit(node.id, {
              style: {
                border: { width, color: node.style.border?.color ?? "#000000", style: "solid" },
              },
            })
          }
        />
      </Field>
      {(node.style.border?.width ?? 0) > 0 && (
        <Field label="Border color">
          <ColorInput
            value={node.style.border?.color ?? "#000000"}
            onCommit={(color) =>
              edit(node.id, {
                style: { border: { width: node.style.border?.width ?? 1, color, style: "solid" } },
              })
            }
          />
        </Field>
      )}
    </Section>
  )
}

function TextSection({ node }: { node: Node }) {
  const edit = useEditor((s) => s.edit)
  if (node.type !== "text") return null

  const text = node.style.text
  const color = text?.color

  return (
    <Section title="Text">
      <Field label="Content">
        {isBinding(node.content) ? (
          <BoundValue propId={node.content.bind} nodeId={node.id} field="content" />
        ) : (
          <TextInput
            value={node.content}
            onChange={(event) => edit(node.id, { content: event.target.value })}
          />
        )}
      </Field>

      {text && (
        <>
          <Field label="Size">
            <NumberInput
              value={text.fontSize}
              onCommit={(fontSize) => edit(node.id, { style: { text: { fontSize } as never } })}
            />
          </Field>
          <Field label="Weight">
            <Select
              value={String(text.fontWeight)}
              options={[300, 400, 500, 600, 700, 800].map((w) => ({
                value: String(w),
                label: String(w),
              }))}
              onCommit={(weight) =>
                edit(node.id, { style: { text: { fontWeight: Number(weight) } as never } })
              }
            />
          </Field>
          <Field label="Align">
            <Select
              value={text.textAlign}
              options={["left", "center", "right"].map((v) => ({ value: v, label: v }))}
              onCommit={(textAlign) =>
                edit(node.id, { style: { text: { textAlign } as never } })
              }
            />
          </Field>
          <Field label="Color">
            {isBinding(color) ? (
              <BoundValue propId={color.bind} nodeId={node.id} field="textColor" />
            ) : (
              <ColorInput
                value={color ?? "#000000"}
                onCommit={(value) => edit(node.id, { style: { text: { color: value } as never } })}
              />
            )}
          </Field>
        </>
      )}
    </Section>
  )
}

/** Shows which prop a field reads from, with a way to break the link. */
function BoundValue({
  propId,
  nodeId,
  field,
}: {
  propId: string
  nodeId: string
  field: BindableField
}) {
  const apply = useEditor((s) => s.apply)
  const prop = useEditor((s) => s.doc.props.find((p) => p.id === propId))

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <code className="truncate rounded bg-chrome-accent/20 px-2 py-1 text-[11px] text-chrome-text">
        {prop?.name ?? "missing prop"}
      </code>
      <Button
        title="Stop reading from this prop"
        onClick={() =>
          apply((doc) =>
            unbindField(doc, nodeId, field, String(prop?.defaultValue ?? "")),
          )
        }
      >
        Unbind
      </Button>
    </span>
  )
}

/**
 * "Expose as prop". Binding a field either points it at an existing prop of a
 * compatible type or creates a new one seeded from the layer's current value.
 */
function BindingSection({ node }: { node: Node }) {
  const doc = useEditor((s) => s.doc)
  const apply = useEditor((s) => s.apply)
  const activeVariantId = useEditor((s) => s.activeVariantId)

  const fields: BindableField[] = []
  if (node.type === "text") fields.push("content")
  if (node.type === "image") fields.push("src")
  fields.push("fill")
  if (node.style.text) fields.push("textColor")

  const bound = (field: BindableField): boolean => {
    if (field === "content") return node.type === "text" && isBinding(node.content)
    if (field === "src") return node.type === "image" && isBinding(node.src)
    if (field === "fill") return isBinding(node.style.fill)
    return !!node.style.text && isBinding(node.style.text.color)
  }

  const currentValue = (field: BindableField): string => {
    if (field === "content" && node.type === "text" && !isBinding(node.content)) return node.content
    if (field === "fill" && !isBinding(node.style.fill)) return node.style.fill ?? "#000000"
    if (field === "textColor" && node.style.text && !isBinding(node.style.text.color)) {
      return node.style.text.color
    }
    return ""
  }

  const expose = (field: BindableField) => {
    const type = FIELD_PROP_TYPE[field]
    apply((current) => {
      const prop = createProp({
        name: field === "content" ? node.name : `${node.name} ${field}`,
        type,
        defaultValue: currentValue(field) || defaultValueFor(type),
      })
      return bindField(addProp(current, prop), node.id, field, prop.id)
    })
  }

  const attach = (field: BindableField, propId: string) => {
    apply((current) => bindField(current, node.id, field, propId))
  }

  if (activeVariantId) {
    return (
      <Section title="Props">
        <p className="text-xs text-chrome-muted">
          Bindings belong to the base design. Switch to Base to expose a layer as a prop.
        </p>
      </Section>
    )
  }

  return (
    <Section title="Expose as prop">
      {fields.map((field) => {
        if (bound(field)) return null
        const compatible = doc.props.filter((p) => p.type === FIELD_PROP_TYPE[field])

        return (
          <div key={field} className="flex items-center gap-2 py-1">
            <span className="w-20 shrink-0 text-xs text-chrome-muted">{FIELD_LABEL[field]}</span>
            <Button className="flex-1" onClick={() => expose(field)}>
              New prop
            </Button>
            {compatible.length > 0 && (
              <Select
                value=""
                options={[
                  { value: "", label: "Use existing…" },
                  ...compatible.map((p) => ({ value: p.id, label: p.name })),
                ]}
                onCommit={(propId) => propId && attach(field, propId)}
              />
            )}
          </div>
        )
      })}
    </Section>
  )
}

const FIELD_LABEL: Record<BindableField, string> = {
  content: "Text",
  src: "Image",
  fill: "Fill",
  textColor: "Text color",
}
