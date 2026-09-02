/**
 * A component whose values come from design tokens rather than literals.
 *
 * Covers every place a token can appear: a fill, a text colour, a font size, a
 * corner radius, a stack gap and padding — the last three being the cases where
 * a composite CSS shorthand has to become longhand to carry a reference.
 */

import { corners, createFrame, createText, createToken, padding } from "@/model/defaults"
import { addToken, insertNode } from "@/model/ops"
import type { ComponentDoc } from "@/model/types"
import { DOC_VERSION } from "@/model/types"

export interface TokenizedFixture {
  doc: ComponentDoc
  ids: {
    root: string
    label: string
    primary: string
    onPrimary: string
    space: string
    radius: string
    body: string
  }
}

export function tokenizedFixture(): TokenizedFixture {
  const primary = { ...createToken("Primary", "color", "#3b5bfd"), id: "t_primary" }
  const onPrimary = { ...createToken("On primary", "color", "#ffffff"), id: "t_onprimary" }
  const space = { ...createToken("Space 3", "space", 12), id: "t_space" }
  const radius = { ...createToken("Radius md", "radius", 8), id: "t_radius" }
  const body = { ...createToken("Body", "fontSize", 15), id: "t_body" }

  const root = createFrame({
    id: "n_root",
    name: "Card",
    style: {
      fill: { token: primary.id },
      corners: corners({ token: radius.id }),
    },
    layout: {
      mode: "stack",
      direction: "row",
      gap: { token: space.id },
      padding: padding({ token: space.id }),
      align: "center",
      justify: "center",
      wrap: false,
    },
    children: [],
  })

  const label = createText({
    id: "n_label",
    name: "Label",
    content: "Tokenised",
    style: {
      text: {
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: { token: body.id },
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: 0,
        textAlign: "center",
        color: { token: onPrimary.id },
      },
    },
  })

  let doc: ComponentDoc = {
    id: "doc_tokens",
    name: "Token Card",
    version: DOC_VERSION,
    description: "Every value comes from a token.",
    props: [],
    states: [],
    tokens: [],
    nodes: { [root.id]: root },
    root: root.id,
    variants: [],
  }

  for (const token of [primary, onPrimary, space, radius, body]) doc = addToken(doc, token)
  doc = insertNode(doc, root.id, label)

  return {
    doc,
    ids: {
      root: root.id,
      label: label.id,
      primary: primary.id,
      onPrimary: onPrimary.id,
      space: space.id,
      radius: radius.id,
      body: body.id,
    },
  }
}
