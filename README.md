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
| **Tokens** | Named design decisions — a colour, a spacing step — that values point at. |

Variants store only what they change, so editing the base propagates everywhere
it was not explicitly overridden, and the exporter emits one JSX tree with
conditional styles rather than one tree per variant.

Every leaf value follows one rule: it is written inline, read from a prop at
runtime, or read from a design token. Widening the leaves rather than keeping a
side-table of "which fields are tokenised" means each emitter handles the three
cases in one place — and a plain literal stays valid, so documents saved before
tokens existed load unchanged.

### One IR, two emitters

`src/model/resolve.ts` folds a document into a `ResolvedTree`. Exactly two things
read it:

- `src/emit/react.tsx` — React elements, for the canvas and the live preview
- `src/emit/tsx.ts` — `.tsx` source, for export

Both call the same `src/emit/style.ts`. The preview is not an approximation of
the export; it is the same styling logic through a different back end.

## Getting started

You need Node 20+ and a Postgres database.

```bash
npm install
cp .env.example .env.local          # set DATABASE_URL (OPENROUTER_API_KEY optional)
npm run db:push                     # create the tables
npm run db:seed                     # optional: a demo button to open and export
npm run dev
```

Then open <http://localhost:3000>. The seed gives you a *Primary Button* with a
bound label, a `tone` enum, a disabled flag and hover/press states already
designed — open it and press ⌘/Ctrl+E to see the exported component
immediately. Or create your own from the same page.

No Postgres handy? Anything speaking the wire protocol works:

```bash
docker run --name studio-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
```

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

### Design tokens

The **Tokens** tab in the left rail holds them; *Add a starter set* seeds a
palette, a spacing scale, radii and type sizes. Any fill, text colour, radius,
gap, padding or font size can then point at one through the small picker beside
its control — and pickers only offer tokens of a matching type, since a spacing
scale is not a set of colours.

Editing a token moves every layer reading it. Deleting one inlines the value it
held everywhere it was used, so a design never silently loses a colour and the
generated code never references a token that is no longer emitted. *Detach* does
the same for a single field.

On export the component carries a `tokens` object holding only what it actually
references — a component using three colours should not import a whole design
system into Framer:

```tsx
const tokens = {
    primary: "#3b5bfd",
    space3: 12,
    radiusMd: 8,
} as const
```

One wrinkle worth knowing: `padding: "12px 12px"` is a single string built from
four values, and a string cannot hold a `tokens.x` reference. So when any part
of a composite is a token the shorthand becomes longhand — `paddingTop`,
`paddingRight`, and so on. When every part is a literal the shorthand stays, and
the common case reads the way a person would write it.

### History and sharing

*History* in the toolbar covers both.

**Versions** are snapshotted automatically as you save, throttled server-side so
a long editing session leaves a readable history rather than one entry per
keystroke; *Save a version* records a labelled point on demand. Restoring
snapshots the current document first, so a restore is itself undoable — it is
never the one action that loses work.

**Share links** hand someone a read-only page: the component running, controls
for its props and states, and the generated code to copy. The URL carries a
32-hex-character token from a CSPRNG, and possession of it is the whole
authorisation — so the page is marked `noindex`, revoking clears the token and
breaks the link immediately, and a revoked token 404s exactly like one that
never existed.

Both *Save a version* and *Create link* flush pending edits first. Autosave is
debounced, so without that you could snapshot or share a document older than the
one on your screen.

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
npm test          # unit, golden-file, compile and runtime passes — no services needed
npm run typecheck
npm run test:e2e  # browser tests; needs Postgres (E2E_DATABASE_URL or DATABASE_URL)
```

Five layers, in increasing order of what they prove:

1. **Unit** — override folding in `resolve`, structural invariants in `ops`.
2. **Golden file** — a committed snapshot of the emitted button, so any codegen
   change shows up as a readable diff.
3. **Compile** — every generated component is written to `test/generated/` and
   type checked by `tsc` against a Framer module shim. Catches malformed output
   before it reaches Framer, where the only feedback is a red box.
4. **Runtime** — a generated component is imported and rendered against the real
   `framer-motion`, then hovered. This is what proves variant propagation
   actually works rather than merely looking right in the source.
5. **Browser** — Playwright drives the actual editor: create and undo a layer,
   edit properties, confirm editing a variant leaves the base alone, point a
   fill at a token and watch it follow, restore a version, share and revoke a
   link, read the export panel. This is the layer that catches what only exists
   in a browser; its first run found an infinite re-render that meant the editor
   never mounted at all.

   Some of these tests are destructive by nature and the database persists, so a
   global setup reseeds the demo component before each run.

If a Chromium is already installed (as in most CI images), point Playwright at
it with `CHROMIUM_PATH` rather than downloading another.

## Not built yet

**Authentication.** There is no login: `DEV_USER_EMAIL` decides whose workspace
you get. Share links are unguessable but public, and anyone who can reach the
app can edit anything in it. Do not deploy this to a public address as it
stands.

Also absent: vector editing (pen/bezier), component nesting and slots, and
multiplayer. The flat `nodes` record and the pure ops layer are
shaped for a CRDT, so collaboration is addable without a rewrite.

## Layout

```
app/                    Next.js App Router — pages and API routes
app/s/[token]/          the public read-only view of a shared component
src/model/              document model: types, ops, resolve, values  (pure, no React)
src/emit/               style mapping + the two emitters
src/editor/             store, canvas, panels
src/ai/spec.ts          plain-language → proposed component API (OpenRouter)
src/server/             Prisma client, and component operations shared by the
                        API routes and the projects page's server actions
test/                   unit, golden, compile and runtime passes
e2e/                    Playwright browser tests
```
