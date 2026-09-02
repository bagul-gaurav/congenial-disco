# Studio

A design tool for building UI components and exporting them as **Framer code
components**.

The premise is that a component's API comes first. You describe what the
component does, review the props and interaction states that get proposed, then
design the base and each variant on the canvas. Export produces a single `.tsx`
file you paste into Framer's code editor: property controls show up in the
right-hand panel, and hover/press states animate for real.

## The idea

A document here is not an artboard that happens to emit code — it *is* a
component:

| Concept | What it is |
|---|---|
| **Props** | The component's API. Become `addPropertyControls` entries in Framer. |
| **States** | `hover` / `tap` / `focus` / `disabled`. Become real runtime behavior. |
| **Base design** | The layer tree: frames with auto-layout, text, shapes, images. |
| **Variants** | Deltas against the base, selected by a prop value or a state. |
| **Bindings** | A layer field that reads from a prop instead of a literal. |

Variants store only what they change, so editing the base propagates everywhere
it was not explicitly overridden, and the exporter emits one JSX tree with
conditional styles rather than one tree per variant.

### One IR, two emitters

`src/model/resolve.ts` folds a document into a `ResolvedTree`. Exactly two things
read it:

- `src/emit/react.tsx` — React elements, for the canvas and the live preview
- `src/emit/tsx.ts` — `.tsx` source, for export

Both call the same `src/emit/style.ts`. The preview is not an approximation of
the export; it is the same styling logic through a different back end.

## Getting started

```bash
npm install
cp .env.example .env.local          # set DATABASE_URL and OPENROUTER_API_KEY
npx prisma db push
npm run dev
```

Then open <http://localhost:3000>, create a component, and describe it.

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. |
| `OPENROUTER_API_KEY` | no | Enables the "propose props & states" step. Without it that button returns a clear 501 and everything else works. |
| `OPENROUTER_MODEL` | no | Any OpenRouter slug supporting `json_schema` structured outputs. Defaults to `anthropic/claude-sonnet-4.5`. |
| `OPENROUTER_SITE_URL`, `OPENROUTER_SITE_NAME` | no | Attribution on OpenRouter's dashboard. |
| `DEV_USER_EMAIL` | no | Which user row owns the workspace. There is no login yet. |

## Using it

1. **Describe** the component in the left panel and press *Propose props &
   states*. Edit whatever comes back — it is a proposal, and re-running merges
   rather than replaces.
2. **Design the base**: `F` frame, `T` text, `R` rectangle, `O` ellipse, `V`
   select. Scroll to pan, ⌘/Ctrl+scroll to zoom, alt-drag to pan.
3. **Expose values as props** in the properties panel. A bound text layer shows
   the prop name instead of an editable string.
4. **Design each variant** by selecting it in the bar above the canvas. While a
   variant is active every edit is recorded as an override; the base is
   untouched.
5. **Export** (⌘/Ctrl+E), copy, and paste into Framer under
   *Assets → Code → New Component*.

## Generated output

For a button with a bound label, a `tone` enum, a disabled flag and hover/press
states, the exporter produces roughly:

```tsx
const rootStyle: React.CSSProperties = {
    ...rootBase,
    ...(tone === "ghost" ? rootGhost : null),
    ...(disabled ? rootDisabled : null),
}
const rootMotion = {
    rest: { backgroundColor: rootStyle.backgroundColor ?? "#3b5bfd", scale: rootStyle.scale ?? 1 },
    hover: { backgroundColor: "#2f4ad0" },
    pressed: { scale: 0.97 },
}

return (
    <motion.div
        style={{ ...rootStyle, ...style }}
        variants={rootMotion}
        initial="rest"
        whileHover={disabled ? undefined : "hover"}
        whileTap={disabled ? undefined : "pressed"}
        onTap={disabled ? undefined : onTap}
    >
        <p style={labelStyle}>{label}</p>
    </motion.div>
)
```

Three details in there are load-bearing:

- **States propagate from the root.** A hover delta on a nested layer cannot be
  a `whileHover` on that layer — hovering a child is a different event from
  hovering the component, and a layer that hover *reveals* is not hoverable at
  all. The root carries the label; descendants declare matching `variants`.
- **`rest` reads the composed style**, not the base. Reading the base would make
  a ghost button animate back to the primary fill on pointer-out.
- **`React.CSSProperties` annotations** keep literals from widening to `string`,
  which Framer's editor reports as an error on paste.

## Testing

```bash
npm test         # unit, golden-file, compile and runtime passes
npm run typecheck
```

Four layers, in increasing order of what they prove:

1. **Unit** — override folding in `resolve`, structural invariants in `ops`.
2. **Golden file** — a committed snapshot of the emitted button, so any codegen
   change shows up as a readable diff.
3. **Compile** — every generated component is written to `test/generated/` and
   type checked by `tsc` against a Framer module shim. Catches malformed output
   before it reaches Framer, where the only feedback is a red box.
4. **Runtime** — a generated component is imported and rendered against the real
   `framer-motion`, then hovered. This is what proves variant propagation
   actually works rather than merely looking right in the source.

## Not built yet

Vector editing (pen/bezier), design tokens, component nesting and slots, auth,
sharing links, version history, and multiplayer. The flat `nodes` record and the
pure ops layer are shaped for a CRDT, so collaboration is addable without a
rewrite.

## Layout

```
app/                    Next.js App Router — pages and API routes
src/model/              document model: types, ops, resolve  (pure, no React)
src/emit/               style mapping + the two emitters
src/editor/             store, canvas, panels
src/ai/spec.ts          plain-language → proposed component API (OpenRouter)
src/server/db.ts        Prisma client
test/                   unit, golden, compile and runtime passes
```
