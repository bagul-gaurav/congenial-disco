# Studio — project context

This document is the *why*. It is written to be readable without knowing the
codebase, and to be enough to pick the project back up cold. The
[README](README.md) is the *how* — architecture, file layout, and the
engineering detail behind every claim made here.

---

## In one paragraph

**Studio is a design tool whose output is working code.** You describe a UI
component in plain language, it proposes the component's API — the knobs a
developer or designer would want to turn — you design it on a canvas, and it
exports a single file you paste into [Framer](https://framer.com). In Framer
that file is not a picture of a button: it is a real button, with real hover
and press animations, and with its knobs showing up in Framer's own properties
panel.

## The problem it solves

Framer lets you drop in **code components** — custom React components that
behave like native Framer elements, with editable properties in the sidebar.
They are the escape hatch for anything Framer's built-in tools cannot express.

The catch is that writing one is a coding job, and a fiddly one:

- The properties panel doesn't appear by itself. You have to declare each
  control by hand, in a specific format, and keep those declarations in sync
  with the component's actual behaviour.
- Hover and press states have to be wired up through an animation library, and
  the intuitive way of doing it is subtly wrong (see *hover propagation* below).
- The only feedback when you get it wrong is a red error box inside Framer.

So designers can't make them, and developers find them tedious. Studio's bet is
that this whole job is **mechanical enough to generate** — if the tool
understands what a component *is*, rather than just what it looks like.

## The core idea: the API comes first

Most design tools draw a rectangle and let you argue about what it means later.
Studio inverts that. A document here is not a drawing that happens to emit
code — **it is a component definition**, and the drawing is one part of it.

| Piece | In plain terms |
|---|---|
| **Props** | The knobs. "This button has a label, a tone, and can be disabled." |
| **States** | Hover, press, focus, disabled — what the component *does*, not just how it looks. |
| **Base design** | The default look: boxes, text, shapes, laid out on the canvas. |
| **Variants** | *Differences* from the default. "When tone is ghost, the fill is transparent." |
| **Bindings** | A field that reads from a knob instead of a fixed value. The label text isn't "Buy now" — it's *whatever `label` is set to*. |
| **Tokens** | Named design decisions. "Brand blue", "spacing step 3". Change the name's value, everything using it moves. |

Two consequences are worth understanding, because most of the engineering
follows from them:

**Variants store only what they change.** Edit the default and the change
flows into every variant that didn't explicitly override it. If variants were
full copies, a padding tweak would mean editing five near-identical designs and
finding out later you missed one.

**There is one description, rendered two ways.** The same internal
representation drives both the live canvas preview and the exported file. The
preview isn't an approximation of the export — it's the same logic pointed at a
different output. What you see is what Framer gets.

### One hard-won detail

Hover doesn't work the way it looks like it should. If a nested layer changes on
hover, you cannot attach the hover behaviour to that layer: hovering a *child*
is a different event from hovering the *component*, and a layer that only
appears on hover can't be hovered in the first place. So the outermost element
owns the hover, and everything inside listens for it.

This is the kind of thing you only discover by rendering the output and actually
hovering it — which is why the test suite does exactly that, against the real
animation library, rather than just checking the generated text looks right.

## What exists today

A working end-to-end tool. Everything below has been run and verified:

- **Component library** — create, rename, duplicate, delete components.
- **Editor** — canvas with frames, text, rectangles, ellipses; auto-layout;
  a layer tree; a properties panel; undo/redo.
- **AI-proposed API** — describe the component, get a props-and-states
  proposal back. Optional; the tool works fully without it.
- **Design tokens** — a starter palette, spacing, radii, type sizes. Point any
  colour, spacing or radius at a token. Deleting a token keeps the design
  looking identical.
- **Version history** — snapshots taken automatically as you work, plus
  labelled ones on demand. Restoring is itself undoable.
- **Read-only share links** — a public page showing the component running, with
  its knobs live, plus the code. Revocable instantly.
- **Export** — one `.tsx` file, copy and paste into Framer.
- **Safety rails** — two browser tabs on one component can't silently overwrite
  each other; the tool says *"Edited elsewhere — reload"* instead.

### Verified on 2 September 2026

| Check | Result |
|---|---|
| `npm install` | 402 packages, clean |
| `npm run typecheck` | passes |
| `npm run lint` | passes |
| `npm test` | 141 tests, 13 files, all pass (~6s) |
| `npm run build` | production build succeeds |
| `npm run test:e2e` | 37 browser tests, all pass (~32s) |
| Migrations + seed + dev server | all work |

## Getting it running locally

You need **Node 20+** and a **Postgres** database. Full detail is in the
README; the short version, with the two traps that cost time:

```bash
npm install
cp .env.example .env.local     # set DATABASE_URL
cp .env.local .env             # ← trap #1, see below
npm run db:deploy              # create the database tables
DATABASE_URL="postgresql://..." npm run db:seed   # ← trap #2
npm run dev
```

Then open <http://localhost:3000>. The seed gives you a finished *Primary
Button* to open and export immediately.

No Postgres on the machine?

```bash
docker run --name studio-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
```

**Trap #1 — two env files.** The app itself reads `.env.local`, but the database
tooling only reads `.env`. With just `.env.local`, `npm run db:deploy` fails with
`Environment variable not found: DATABASE_URL`. Keeping both files (identical
content) is the quickest fix. *The README's setup instructions are wrong on this
point.*

**Trap #2 — the seed script reads neither file.** `npm run db:seed` needs
`DATABASE_URL` set in the shell, even when both env files exist. Same error
message if you forget.

**Running the browser tests** requires a production build first —
`npm run build`, then `npm run test:e2e`. Without it Playwright fails with
*"Could not find a production build"*. If the machine already has a Chromium,
point at it with `CHROMIUM_PATH` instead of downloading another.

Neither trap is dangerous; both just look like the project is broken when it
isn't. Fixing them properly is on the roadmap below.

## Roadmap

Ordered by what unblocks the most. The first three are what stand between this
and being usable by anyone other than its author.

### 1. Fix the setup papercuts — hours
The two env-file traps and the missing build step above. Either make the tooling
read one file, or correct the README. Cheap, and it's the first impression.

### 2. Authentication — the gate on everything else
**There is no login.** An environment variable decides whose workspace you get,
and anyone who can reach the app can edit anything in it. **Do not put this on a
public address as it stands.** The database already has a user table waiting for
this, so it's a wiring job rather than a rebuild.

Two things must land with it:

- **Ownership checks.** Every route takes a component id and acts on it without
  asking whose it is. With no login there's nothing to check against; once
  there is, the check belongs in one shared place, not repeated at each call site.
- **Limits on the AI endpoint.** The "propose props & states" feature is an
  unmetered pipe to a paid API — no rate limit, no budget. Fine on a laptop,
  expensive on a public URL.

### 3. Two dependency upgrades — scheduled, not urgent
Two security advisories sit in build-time tooling: one inside Next.js (fixed in
Next 16), one inside the database CLI (fixed in Prisma 7). Neither is reachable
by a visitor to the running app, but both fixes are major-version upgrades, so
they need a deliberate slot rather than a routine patch.

### 4. Feature work, roughly in order of payoff

- **Component nesting and slots** — using one component inside another. The
  single biggest gap for real design-system work.
- **Vector editing** — pen and bezier tools. Today's shapes are rectangles,
  ellipses, text and frames.
- **Multiplayer** — two people in one document. The data was deliberately shaped
  to make this addable later rather than requiring a rewrite; it is still a
  large piece of work.

Any of these that changes the shape of a saved document needs a **migration
step**. Every stored document records the version it was written under and is
brought forward on load, so old work and old snapshots keep opening. A document
written by a *newer* version is refused rather than guessed at — quietly
dropping fields it doesn't recognise is how a rollback destroys someone's
design.

## Things that were decided, and shouldn't be relitigated casually

Each of these looks like an odd choice until you hit the problem it prevents.

- **Migrations, not "just push the schema."** A database with no migration
  history has no upgrade path.
- **Saves are conditional.** A save based on a stale copy is refused, not
  applied. Two tabs on one component is enough to hit this, and last-write-wins
  there loses an afternoon of work.
- **Deleting a token doesn't change the design.** The value it held gets written
  into every place that used it, so nothing shifts and the exported code never
  points at something that no longer exists.
- **Restoring an old version snapshots the current one first.** A restore is
  itself undoable; it is never the click that loses work.
- **Exports carry only the tokens they use.** A component using three colours
  shouldn't drag an entire design system into Framer.
- **Share links are unguessable, not authenticated.** Possession of the link is
  the whole permission, so the page is hidden from search engines and revoking
  breaks the link instantly. That's a deliberate tradeoff, and it's another
  reason not to deploy publicly before login exists.

## Where to look next

- [README.md](README.md) — architecture, file-by-file layout, the generated
  output explained, and the five-layer testing strategy.
- `prisma/schema.prisma` — the data model, heavily commented with the reasoning.
- `src/model/` — the document model. Pure logic, no UI. The heart of the thing.
- `e2e/` — browser tests. Reading them is the fastest way to see what the tool
  actually does, step by step.
