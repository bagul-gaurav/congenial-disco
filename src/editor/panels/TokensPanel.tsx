"use client"

/**
 * Design tokens.
 *
 * A token is a named decision — this blue, this spacing step — that values
 * across the component point at instead of repeating. Editing one changes every
 * layer reading it, and the exported component carries the tokens it uses as a
 * `tokens` object, so the same decisions survive the trip into Framer.
 */

import * as React from "react"

import { useEditor } from "@/editor/store"
import { createToken, starterTokens } from "@/model/defaults"
import { addToken, addTokens, nodesUsingToken, removeToken, updateToken } from "@/model/ops"
import type { TokenType } from "@/model/types"

import { Button, ColorInput, NumberInput, Select, TextInput } from "./controls"
import { PanelHeading } from "./LayerTree"

const TYPE_LABEL: Record<TokenType, string> = {
  color: "Color",
  space: "Spacing",
  radius: "Radius",
  fontSize: "Font size",
  fontFamily: "Font family",
}

const ORDER: TokenType[] = ["color", "space", "radius", "fontSize", "fontFamily"]

const DEFAULT_VALUE: Record<TokenType, string | number> = {
  color: "#000000",
  space: 8,
  radius: 8,
  fontSize: 16,
  fontFamily: "Inter, system-ui, sans-serif",
}

export function TokensPanel() {
  const doc = useEditor((s) => s.doc)
  const apply = useEditor((s) => s.apply)

  const grouped = ORDER.map((type) => ({
    type,
    tokens: doc.tokens.filter((token) => token.type === type),
  })).filter((group) => group.tokens.length > 0)

  return (
    <div className="flex h-full flex-col">
      <PanelHeading>Tokens</PanelHeading>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {doc.tokens.length === 0 && (
          <div className="pb-3">
            <p className="pb-2 text-xs text-chrome-muted">
              No tokens yet. A token is a named value — a colour, a spacing step — that layers
              point at instead of repeating it.
            </p>
            <Button
              variant="accent"
              className="w-full"
              data-testid="add-starter-tokens"
              onClick={() => apply((current) => addTokens(current, starterTokens()))}
            >
              Add a starter set
            </Button>
          </div>
        )}

        {grouped.map((group) => (
          <section key={group.type} className="border-b border-chrome-border py-2 last:border-b-0">
            <h3 className="pb-1 text-[11px] font-medium uppercase tracking-wide text-chrome-muted">
              {TYPE_LABEL[group.type]}
            </h3>
            {group.tokens.map((token) => (
              <TokenRow key={token.id} id={token.id} />
            ))}
          </section>
        ))}

        <AddToken />
      </div>
    </div>
  )
}

function TokenRow({ id }: { id: string }) {
  const token = useEditor((s) => s.doc.tokens.find((t) => t.id === id))
  const usageCount = useEditor((s) => nodesUsingToken(s.doc, id).length)
  const apply = useEditor((s) => s.apply)

  if (!token) return null

  const setValue = (value: string | number) => apply((doc) => updateToken(doc, id, { value }))

  return (
    <div className="flex items-center gap-2 py-1" data-testid="token-row">
      <TextInput
        value={token.name}
        aria-label={`Rename ${token.name}`}
        onChange={(event) => apply((doc) => updateToken(doc, id, { name: event.target.value }))}
        className="w-24"
      />

      {token.type === "color" ? (
        <ColorInput value={String(token.value)} onCommit={setValue} testId={`token-${token.name}`} />
      ) : token.type === "fontFamily" ? (
        <TextInput value={String(token.value)} onChange={(e) => setValue(e.target.value)} />
      ) : (
        <NumberInput value={Number(token.value)} onCommit={setValue} />
      )}

      <span
        title={`${usageCount} layer${usageCount === 1 ? "" : "s"} use this`}
        className="w-6 shrink-0 text-right text-[11px] text-chrome-muted"
      >
        {usageCount || ""}
      </span>

      <Button
        title="Delete. Layers using it keep the value it held."
        data-testid="delete-token"
        onClick={() => apply((doc) => removeToken(doc, id))}
      >
        ✕
      </Button>
    </div>
  )
}

function AddToken() {
  const apply = useEditor((s) => s.apply)
  const [type, setType] = React.useState<TokenType>("color")
  const [name, setName] = React.useState("")

  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    apply((doc) => addToken(doc, createToken(trimmed, type, DEFAULT_VALUE[type])))
    setName("")
  }

  return (
    <div className="flex items-center gap-2 border-t border-chrome-border pt-3">
      <TextInput
        value={name}
        placeholder="New token"
        aria-label="New token name"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && add()}
      />
      <Select
        value={type}
        options={ORDER.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
        onCommit={(next) => setType(next as TokenType)}
      />
      <Button data-testid="add-token" onClick={add}>
        Add
      </Button>
    </div>
  )
}
