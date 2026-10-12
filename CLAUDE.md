# WarpCad — Project Instructions

A browser-based parametric CAD application. 2D sketching to 3D solids, CSG modeling,
installable as a PWA, designed to be driven by an AI partner as well as by hand.

> **Status: greenfield, third attempt.** Nothing is built yet, and `TODO/ROADMAP.md`
> doesn't exist yet either — see `PREVIOUS-ATTEMPT.md` and `SECOND-ATTEMPT.md` for the
> retrospectives on why the first two attempts were shelved, and the Working Files
> section below for how the roadmap gets built this time. Read both before scaffolding
> anything: the first failed because nothing got assembled into an app a user could
> reach; the second fixed that and still failed, because its verification loop proved
> code existed and passed its own tests without ever proving a human could operate it.
> Correct this file as reality diverges; the `.claude/commands/*` workflows read it as
> the source of truth.

## What's actually decided this time, and what isn't

Two library commitments from the previous attempts are explicitly **not** carried
forward — they are open questions again, not defaults:

- **No CRDT.** The previous document model was Yjs + y-indexeddb. Whether this attempt
  needed multi-writer merge semantics at all was reopened rather than inherited. It is now
  answered (`docs-022`, 2026-10-12, accepted): **yes to a merge, still no
  CRDT library** — a hand-rolled, state-based merge over the NDJSON project file, see
  `docs/decisions/document-sync.md`.
- **No `manifold-3d`.** The previous geometry kernel choice is not assumed. Which
  library evaluates booleans, tessellation, and CSG is an open kickoff decision.

Everything else in the previous Stack (three.js, Pinia, Playwright, Storybook,
vite-plugin-pwa, GitHub Pages) carries forward only as a **default to reconsider**, per
the existing Library decisions process below — same status they already had. The one
new firm commitment is **Vue 3 + Vite + Vitest** for UI and testing; treat that as
settled, not up for re-litigation at kickoff.

What *is* carried forward without re-litigation, because it's process, not library
choice, and both retrospectives independently validated it: the Interaction Model
rules, the reachability/documentation gates, the responsive and browser-support
targets, and the acceptance-scenario verification model below. These aren't tied to
Yjs or manifold-3d — they're lessons about how this specific app needs to be built and
checked, and they cost two shelved attempts to learn.

## Interaction Model (read this before scaffolding anything)

The first attempt's failure was building components that were individually correct and
tested but never assembled into an operable app, and a boolean-operation menu
implemented as a flat dump of every registered feature type — because nothing had ever
specified what a user actually does at the keyboard. The second attempt fixed exactly
that (see `PREVIOUS-ATTEMPT.md`) and then failed anyway, for a different reason: its
verification loop proved code exists, is wired up, and does what its own author's test
script asserts — it never proved an unscripted human, moving at human speed and making
human mistakes, could actually accomplish a task end to end (see `SECOND-ATTEMPT.md`).
**Both failure modes matter here. The rules below prevent the first one. The
Verification section further down prevents the second — passing everything in this
section is necessary, not sufficient.**

Rules that follow from the first failure, non-negotiable for any user-visible work:

- **No feature with a UI surface gets scaffolded from a spec that only lists what it
  does.** Every such feature's spec (a `TODO/<id>.md` file, or the answers gathered in
  `/feature` Phase 1) must state its **precondition** (what must already be selected or
  true), its **trigger** (the specific control — button, menu item, shortcut, gesture —
  and where it lives), and its **feedback** (what confirms it happened on screen).
- **Creation and operation are never the same list.** Actions that create new geometry
  (box, sphere, sketch) and actions that operate on existing geometry (union, subtract,
  extrude, fillet, pattern) must never be presented as an undifferentiated dropdown or
  menu built by iterating a feature registry. An operation control is disabled or
  hidden until its required operands are actually selected — "read the registry, don't
  hardcode a list" is a reasonable implementation instinct that produces a broken UI
  here unless the registry itself encodes operand requirements the UI can act on.
- **A task that adds a control is not done until the control is reachable.** "Reachable"
  means: mounted somewhere the app's actual root view renders, exercised by a real
  `*.e2e.js` Playwright spec that navigates to `/` — not a component-level `.spec.js`
  or a `*.story.e2e.js` Storybook-only spec. This is a gate on every UI-touching task,
  not a milestone-end integration task to catch up later. See Conventions and
  `TODO/README.md`. **This gate was fully honored in the second attempt and it still
  wasn't enough** — a passing scripted spec proved the click sequence its own author
  wrote works, not that the feature works when driven differently. Reachable-and-tested
  is the floor, not the finish line; see Verification below for the layer on top.
- **Run the reachability audit on a standing cadence once there's a root view to
  check**, not only when someone remembers to ask — `.claude/prompts/project-audit.md`
  section 4 covers this; wire it into a `/loop` or scheduled routine once there's
  something to check.
- **A task that adds or changes a user-visible control is not done until it has
  end-user documentation.** A control that's reachable and tested but that nobody can
  figure out how to use has failed this section's whole point just as surely as one
  that isn't mounted — "I see things appearing, but I don't know what they do" is the
  same class of failure as "the button doesn't exist," just discovered later and by a
  human instead of a Playwright spec. Every such task's spec names the `docs/` page it
  creates or updates and states a concrete usage example, not a restatement of its own
  Interaction model in different words. See Conventions and `TODO/README.md`'s
  Documentation section. Covered by the same standing-cadence audit as reachability
  (`.claude/prompts/project-audit.md` section 7).

The rules above set the bar for *any* control's spec. The following are specific,
non-negotiable answers for how this particular app works — every feature spec must be
consistent with them, not re-derive them from scratch. Note that none of these depend
on which geometry kernel or document/sync library gets picked at kickoff:

- **Geometry is created by placing it in the 3D view, not by spawning it at a fixed
  transform.** "Add cube" is a drag interaction: the trigger arms a placement mode, a
  preview follows the pointer (mouse drag or touch drag) across the viewport, and the
  object commits into the document on release/drop. A control that instead inserts
  geometry at a hardcoded origin and leaves the user to move it afterward fails this
  rule — the placement step is not optional polish to add later.
- **Selecting an object in the 3D view shows that object's controls and dimensions.**
  The inspector panel is driven by the selection, not just a highlight outline —
  selecting is itself a trigger with an inspector-panel feedback contract, the same as
  any other trigger under the rules above.
- **A selected object is movable and rotatable from the 3D view itself** via a
  transform gizmo (translate/rotate handles) attached to the selection — not only
  through numeric fields in a side panel. Gizmo drag and numeric-field edits must drive
  the same underlying transform and stay in sync with each other.
- **Tool enablement is gated on selection *count*, not just selection presence.** A
  single-object tool (move, rotate, a fillet on one edge) stays disabled unless exactly
  one applicable object is selected; a multi-object tool (boolean union/subtract,
  pattern-to-instances, align) stays disabled until the number of operands it needs —
  two, or "two or more" — is actually selected. This is the selection-count-specific
  case of the creation-vs-operation rule above, and applies even to tools that aren't
  booleans.
- **The viewport has its own navigation chrome**: orbit/pan/zoom controls reachable
  without a keyboard, and an orientation gizmo (view cube or axis triad) that shows the
  current camera orientation and can itself be clicked/tapped to snap to a standard
  view. Keyboard/mouse navigation alone fails this rule, because touch devices — see
  Responsive Layout below — have no keyboard. **The second attempt's own stop note is
  the concrete failure this rule exists to prevent**: "clicking dragging in the 3D
  viewport just rotates the base grid" — orbit-only navigation with no independently
  reachable pan/zoom chrome, discovered only when a human actually tried it.
- **The grid renders major and minor lines and its own dimensions**: minor lines at the
  base grid spacing, major lines at a multiple of it (typically every 5th or 10th), plus
  enough labeling (an axis ruler, a scale readout, or an on-hover dimension) that a user
  can read real-world size off the grid without opening the inspector.

## Verification (read this as carefully as Interaction Model — it's the layer that was missing)

This section exists because the second attempt did everything Interaction Model asks
and still shipped an app where adding an item overwrote the previous one, the scene was
too dark to see anything in, sketch mode never opened, and dragging in the viewport
only ever rotated the grid — every one of those with passing tests and a clean
reachability audit. Read `SECOND-ATTEMPT.md` in full before treating "tests pass" as
equivalent to "it works." The concrete mechanism this time:

- **`TODO/ACCEPTANCE.md` holds a small, fixed set of named end-to-end use cases** —
  5-10 of them, written up front at kickoff, before feature work starts, in the same
  session as the Interaction Model walkthrough. Examples of the right shape: "place a
  box and a sphere, confirm both remain visible"; "union two solids and confirm the
  result"; "drag a library part in and confirm it renders complete, not partial"; "open
  sketch mode and draw one entity"; "navigate the viewport using touch-only input."
  These are the model of the second attempt's own stop note: *"adding a cube and a
  sphere and subtracting one from the other."*
- **These are driven, not scripted.** The point is that a pre-written Playwright click
  sequence proves only that the exact sequence its author encoded still works — it does
  not catch a button whose enabled state depends on a selection state the author didn't
  realize could be lost, or a drag at a slightly different angle, or a tap before an
  async operation settles. Re-running these scenarios means actually launching the app
  (the `run` skill — "launch and drive this project's app" — is the mechanism) and
  interacting with it the way an exploring human would, not asserting against a fixed
  script. This is closer to exploratory testing than to another layer of automated
  assertions, on purpose.
- **Every `/fix-todo` run re-drives the acceptance scenarios that plausibly touch the
  subsystem it just changed, and reports PASS/FAIL explicitly**, per
  `.claude/commands/fix-todo.md`'s own verification step. A regression against any of
  these is the loudest possible signal in the whole process — louder than that task's
  own green test suite — because these are the only checks standing in for a human
  actually trying the app.
- **A closed finding's subsystem is a standing regression surface, not a one-time
  close.** When a new task extends a subsystem a prior finding was filed against (a new
  feature *kind* added to the same evaluation pipeline a past bug was fixed in, a new
  placement path added to the same viewport a past lighting or navigation bug touched),
  that task's own Testing section must explicitly re-run the closed finding's original
  reproduction steps against the new code — not just its own new spec. The second
  attempt shipped two exact-symptom regressions of findings that had already been fixed
  and marked done days earlier, because nothing re-checked a closed finding when a
  feature landed on top of the code it touched.
- **A human drives the actual running app for five free-form minutes at the end of
  every milestone**, not just before the whole project is declared done — no script, at
  the reference phone/tablet/laptop viewports (Responsive Layout below). This is the
  only check in the whole process with no scripted expectations on either side, which
  is exactly why it's the one the second attempt never actually got until the project
  was already being shelved. `/run-todos` pauses and asks for this explicitly when a
  milestone's last task completes — see `.claude/commands/run-todos.md`.
- **`TODO/VERIFY.md` stays small and specific, not an ever-growing checklist.** The
  second attempt let this file grow to ~2,000 lines of "should work now" items across
  dozens of tasks — a list nobody could keep up with is the same as no list. Its job now
  is narrower: log only what's genuinely one-off and not already covered by an
  acceptance scenario (a visual/feel judgment call, a device-specific quirk). If an
  entry's substance duplicates something `TODO/ACCEPTANCE.md` already checks on a
  standing basis, it belongs there instead, not as a new VERIFY.md line.

## Responsive Layout

Three target form factors, each a real target from day one — not "works on desktop,
fix mobile later." The interaction model above (drag-to-place, gizmos, viewport nav
chrome) must all still work at phone width; a viewport that only navigates by keyboard
shortcut is a phone-specific failure of the rules above, not a separate concern.

| Class | Reference viewport | Notes |
|---|---|---|
| Phone | 390×844 (iPhone) | Narrowest target. Panels and toolbars must collapse or reflow — never require horizontal scrolling of primary UI. |
| Tablet | 820×1180 (iPad) | Enough width for a persistent side panel; still touch-primary. |
| Laptop/desktop | 1440×900+ | Persistent panels, mouse + keyboard primary. |

- **Design tool and panel placement for the phone case first**, not "place it for
  desktop, then shrink." A toolbar that only fits by shrinking icons below tap-target
  size, or a panel that only works via mouse hover, fails this rule even if it looks
  fine at laptop width.
- **The AI chat panel overlays the viewport at phone and tablet widths** — a
  translucent or collapsible overlay, or a dismissible/minimizable bottom sheet — so the
  3D or 2D view stays visible underneath or behind it, rather than a permanent
  side-by-side split that pushes the viewport off-screen. A persistent side-by-side
  panel is fine at laptop width.
- **Every `*.e2e.js` spec that covers layout, panel visibility, or overlay behavior
  runs at all three reference viewports** (table above) via Playwright viewport/device
  projects, with a visual snapshot captured at each — not only the default desktop
  project. See `.claude/commands/test.md`.
- **A real human should be hand-testing on real phone/tablet hardware while the app is
  actively being built, not only at milestone boundaries** — the second attempt's own
  stop note: *"I tried to keep up on my iphone and ipad as Claude worked, but nothing
  really worked, and I assumed it was a browser issue. Instead it was just not
  working."* If that's happening, treat it as a live signal, not background noise — see
  Browser Support below on turning it into same-day coverage rather than a deferred task.

## Browser Support

Three target rendering engines, all real targets — this app leans on WebGL, which
diverges across engines far more than plain DOM/CSS does, so "it works in Chrome" is
not evidence it works everywhere. (The committed geometry kernel, `@jscad/modeling` —
see `docs/decisions/geometry-kernel.md` — is pure JS, not WASM; WASM-specific risk in
this app is scoped to whatever else ends up using it, not the kernel.)

| Engine | Playwright project | Stands in for |
|---|---|---|
| Chromium | `chromium` | Chrome, Edge, other Chromium browsers |
| Firefox | `firefox` | Firefox |
| WebKit | `webkit` | Safari, desktop and iOS |

- **Engine is a second axis, orthogonal to viewport** (Responsive Layout above), not a
  substitute for it. All-Chromium coverage across all three reference viewports is not
  the same claim as "verified on every supported browser" — a WebGL context-loss bug,
  a WASM-instantiation quirk, or a touch-event difference can be engine-specific
  regardless of viewport.
- **Move cross-engine coverage into the milestone that introduces the risky surface,
  not a dedicated milestone scheduled for whenever the roadmap gets to it.** Both
  previous attempts shipped real Safari/iPad-only bugs (a white-flash theming bug, a
  touch-orbit bug that only broke on vertical drag) found by manual on-device testing
  after the fact, and the second attempt's own cross-browser coverage task sat unstarted
  behind 50+ other roadmap rows the whole time it was needed. When scoping a milestone
  that touches WebGL, canvas, touch input, or persistence, its own Testing sections
  should say explicitly which engines matter and schedule that coverage inside the
  milestone — not defer it to a later `testing-*` catch-all.
  - Not every spec needs the full nine-way (3 viewport × 3 engine) matrix. A spec with
    no WebGL/WASM/canvas/touch/persistence involvement (e.g. plain form validation) can
    stay Chromium-only across viewports.
  - A UI-touching task's Testing section (`TODO/README.md`) must say explicitly which
    engines its spec needs and why, defaulting to "all three" for anything touching the
    viewport, kernel, or persistence.
- **`TODO/VERIFY.md`'s manual "should work now" queue is a seed for graduating into real
  coverage, not a permanent substitute for it** — an entry that's been hand-verified
  more than once, or that exercises a WebGL/WASM/canvas/IndexedDB-sensitive path, should
  graduate into a real `*.e2e.js` spec running against all three engines above rather
  than stay a standing manual click-through forever.

## Stack

Only one row here is a firm commitment carried into this attempt. Everything else is a
**default to reconsider** at kickoff via the Library decisions process below — carried
forward because the previous attempt's own comparison judged it sound in isolation, not
because it's final. The two rows marked "open" are explicitly *not* defaults; the
previous choice is rejected, not merely unconfirmed, and the question underneath it
(do we need multi-writer merge at all? which kernel?) should be asked fresh.

| Concern | Status | Note |
|---|---|---|
| UI framework | **Committed** | Vue 3 + Vite |
| Testing (unit) | **Committed** | Vitest |
| State (UI-only) | Default — reconsider | Pinia, previous attempt |
| Testing (E2E) | Default — reconsider | Playwright, previous attempt |
| Testing (component workshop) | Default — reconsider | Storybook, previous attempt |
| Rendering | **Committed** | three.js (pinned `0.185.1`), see `docs/decisions/rendering.md` |
| PWA | Default — reconsider | vite-plugin-pwa, previous attempt |
| Hosting | Default — reconsider | GitHub Pages (static, no backend), previous attempt |
| Geometry kernel | **Committed** | `@jscad/modeling` (JSCAD V3), see `docs/decisions/geometry-kernel.md` |
| Document model / sync | **Committed** (accepted 2026-10-12, `docs-022`) | NDJSON project file with a hand-rolled, state-based merge (replica ids, Lamport stamps, position keys, tombstones; record lines byte-identical, merge metadata in the state line as version 2) — **no CRDT library**; Yjs/Automerge/Loro re-checked and rejected, and the earlier single-writer deferral kept as history — see `docs/decisions/document-sync.md`. The AI partner is the second writer that made it a goal (`docs/decisions/ai-partner.md`) |
| LLM client | **Committed** (accepted 2026-10-06) | raw `fetch` to the Messages API behind a one-method provider interface, Anthropic-only v1, no dependency; `@anthropic-ai/sdk` rejected for now (fails the licence allow-list via a transitive Unlicense dep, 14% of the bundle) — see `docs/decisions/ai-partner.md` |
| MCP SDK | **Committed** (accepted 2026-10-06) | `@modelcontextprotocol/server` 2.3.1 (v2 split package, Apache-2.0), in its own `mcp/package.json` — see `docs/decisions/ai-partner.md` |

## Architecture

Not fixed yet — decided at kickoff alongside the open Stack rows above, with the same
rigor as any other Library decision. Two structural *patterns* proved themselves across
both previous attempts regardless of which specific library sat underneath them, and
are worth carrying forward as strong defaults even though the libraries they were
built on are not:

- **A linear feature timeline** — an ordered history where each feature consumes the
  previous result (the Fusion/SolidWorks model) — is a sound shape for a parametric CAD
  document independent of whether a `Y.Array`, a plain array with a custom sync layer,
  or something else backs it. Geometry is always derived from the timeline and always
  disposable; never persist a mesh as document state, whatever the document layer turns
  out to be.
- **All kernel work happens off the main thread** (a Web Worker, regardless of which
  geometry library ends up inside it). The main thread must never block on geometry
  evaluation — this is a performance requirement independent of which kernel is chosen.

Also independent of the open Stack decisions:

- **No client-side router, no history-API routes.** The app is one screen; there is
  nothing to navigate between. Anything shareable (a gist ID, a project reference) goes
  in the URL hash fragment (`#/gist/<id>`), never a path segment — GitHub Pages (if that
  remains the hosting choice) has no server-side rewrite rule, so a path-based deep link
  404s on refresh and a hash fragment never round-trips to the server at all.
- **Undo/redo is scoped by transaction origin**, so remote or programmatic edits never
  land in the local user's own undo stack — whatever document/sync layer gets chosen at
  kickoff needs to support this scoping; treat it as a requirement on that decision, not
  an afterthought once the library is picked.

## Project Structure

- `src/core/` — document model, feature timeline, evaluation engine, kernel adapter.
  **Framework-free**: no Vue, no DOM, no three.js (or whatever rendering library is
  chosen) imports. Testable in plain Node.
- `src/core/kernel/` — the geometry kernel adapter (`@jscad/modeling`, see
  `docs/decisions/geometry-kernel.md`) and its worker RPC.
  Everything else in `core/` talks to the kernel through this interface, never to the
  underlying geometry library directly — this indirection is what makes the kernel
  swappable if the Library-decisions health check ever needs to revisit it.
- `src/sketch/` — 2D sketch model, snapping, dimensions, profile detection.
- `src/render/` — 3D scene, camera, picking, gizmos, the mesh bridge.
- `src/storage/` — persistence and sync backends (IndexedDB, File System Access, a
  hosted git-based backend). Which of these are actually built, and in what order, is a
  kickoff/roadmap decision, not fixed by this list.
- `src/ai/` — design-intent capture, MCP tool surface, BYOK chat client.
- `src/components/<category>/` — Vue components (categories below)
- `src/views/` — top-level screens; thin composition layers only
- `src/composables/` — reusable stateful logic
- `src/stores/` — UI state only (selection, active tool, panel layout). Document state
  lives wherever the document/sync decision above lands, never mirrored into Pinia (or
  whatever UI-state store is chosen).
- `e2e/` — Playwright (or whatever E2E tool is chosen) specs. `*.e2e.js` navigates to
  `/` (the real app); `*.story.e2e.js` targets a Storybook (or equivalent) iframe and
  proves a component in isolation, not a user-facing capability. This distinction is
  load-bearing from the first testing task, not something added after the fact — write
  `e2e/naming.spec.js` in the build/scaffold task to guard it (fail the build if a
  `*.e2e.js` without `.story` points at the component-workshop tool).
- `mcp/` — the MCP server (Node, runs outside the browser)
- `docs/` — end-user documentation site (tool TBD, see Library decisions)

## Conventions

- **Tests**: `.spec.js` (unit, next to source), `.e2e.js`/`.story.e2e.js` (E2E, in
  `e2e/` — see Project Structure above for the difference)
- **Types**: every exported function has a JSDoc signature. `npm run typecheck`
  (`tsc --noEmit`) is a test stage and a CI gate — a type error is a failing build.
- **Always mock at the boundary**: the kernel worker, WebGL contexts, the File System
  Access API, `fetch` to any hosted backend, `requestAnimationFrame`. A unit test must
  never need a real GPU context or a real network.
- **Geometry logic belongs in `src/core/`**, not in components. A component doing
  coordinate math beyond laying out its own pixels is a bug waiting to happen.
- **Numerical code needs numerical tests**: assert with an explicit tolerance
  (`toBeCloseTo`), and cover degenerate cases — zero-length segments, coincident
  points, parallel directions, empty profiles, self-intersection, non-manifold results.
- **Units and coordinate spaces are explicit.** Documents are millimetres, doubles,
  Z-up. Name every conversion at its boundary (`worldToScreen`, `mmToPx`). A raw number
  never crosses a module edge without its space being obvious from the name.
- **Every document mutation goes through the command layer** inside a transaction with
  an origin. Never mutate document state directly from a component — that breaks undo.
- **Views must be thin**: extract any panel over ~30 template lines into
  `src/components/<category>/`.
- **UI**: dark mode primary, light via `prefers-color-scheme`, CSS custom properties
  rather than hardcoded colors.
- **Interactive elements carry `data-testid`.**
- **A UI-touching task's Testing section requires a real app-level `*.e2e.js` spec**,
  not only a `.spec.js` or `.story.e2e.js` — see Interaction Model above and
  `TODO/README.md`. This is checked per task, at the time the task is done.
- **Layout/panel/overlay-affecting E2E specs run at three Playwright viewport
  projects** (phone/tablet/laptop — see Responsive Layout) with a snapshot at each.
- **A spec covering a WebGL/WASM/canvas/persistence-sensitive path runs against all
  three supported browser engines** (Chromium/Firefox/WebKit — see Browser Support),
  not Chromium alone.
- **A UI-touching task's spec requires a Documentation section** naming the `docs/`
  page (new or updated) it adds end-user instructions to, with at least one concrete,
  step-by-step usage example — checked per task, at the time the task is done, exactly
  like the e2e-reachability rule above. There is no later "write the docs" pass that
  silently absorbs this; see `TODO/README.md`. The section must also name the
  `e2e/docs/` shot(s)/movie(s) the task adds or updates — pictures are generated by
  `npm run docs:media`, never captured by hand, and `e2e/docs-media.spec.js` (the `guards`
  project) fails on a dead image link, an orphaned file, or a picture no spec produces.
- **A UI-touching or subsystem-extending task's spec names which `TODO/ACCEPTANCE.md`
  scenarios it must re-drive**, and whether it extends a subsystem any closed finding
  was filed against (in which case that finding's original repro steps get re-run too)
  — see Verification above and `TODO/README.md`.

## Component Categories

All under `src/components/`:

`viewport/` — drawing surface, camera/navigation controls, orientation gizmo,
transform (move/rotate) gizmos, grid (major/minor lines + dimensions), axes, on-canvas
overlays
`timeline/` — the feature history list, rollback, suppress, reorder
`features/` — per-feature-type parameter editors
`sketch/` — 2D sketch tools, dimensions, constraint UI
`inspector/` — property panels, unit-aware numeric entry
`storage/` — project browser, save/open, remote-backend connection UI
`ai/` — chat panel, intent capture, agent activity
`layout/` — wrappers, panels, splitters, toolbars
`controls/` — generic reusable inputs
`display/` — read-only badges, counters, status indicators

## Performance

Interactive-latency application: the budget is a **16ms frame** during pan, zoom, and
drag.

- No per-frame allocation in the render or pointer path. A GC pause is a visible stutter.
- Kernel evaluation never runs on the main thread. Long ops (a boolean over many
  operands, a level-set/offset operation, mesh refinement) use whatever
  progress/cancellation primitive the chosen kernel exposes, and a superseded rebuild is
  cancelled rather than awaited.
- Decoded meshes and typed arrays are held in **plain non-reactive** variables — Vue's
  deep reactivity walking a multi-megabyte `Float32Array` is a performance bug.
- Measure before and after any change made for speed: `.claude/prompts/perf-benchmark.md`.

## Library decisions

When selecting or re-evaluating a dependency — and this now includes the two rows
marked **Open** in the Stack table above, which need a first-time decision, not just a
re-check — `docs/decisions/<name>.md` must include:

- Several real options compared on features, size, stars, open/closed issue ratio,
  release recency, and maintainer count — not just the winner's rationale.
- An explicit **rejection table**: each runner-up and the specific reason it lost, not
  just the winner's strengths.
- For the geometry kernel specifically: this project already has direct experience with
  `manifold-3d` from the previous attempt (see `docs/decisions/` there, if referencing
  it) — factor that experience in explicitly (what worked, what didn't) rather than
  re-deriving a fresh opinion, but don't let "we already know this one" substitute for
  actually comparing it against current alternatives.
- If a dependency is deliberately deferred to a later milestone (a constraint solver,
  an export format library), **re-run the health check when it's actually about to be
  pulled in**, not just once at initial selection — months can pass in between, and a
  library that looked fine at selection time can turn out to be a single-maintainer
  project with no recent activity by the time it's load-bearing.

## AI Partner

The document records **design intent, not just geometry**: each feature carries the
prompt or instruction that produced it, and the project carries its own standing
instructions. This is what makes a model able to pick up an existing part and extend it
rather than guess at it.

Two access paths, both planned, served by **one** framework-free tool registry
(`src/ai/tools/`) — neither path adds tools of its own (`docs/decisions/ai-partner.md`):
- **MCP server** (`mcp/server.js`, `docs/mcp.md`) — reads and writes one local project
  file, so Claude Code can drive modeling (a hosted project reference is not built yet).
  **Stated explicitly, as this section asks:** the document/sync layer as built today does
  **not** support concurrent merge — that is M15's work (decided and accepted in `docs-022`; `docs/decisions/document-sync.md`), which merges a changed file
  automatically with **Undo merge** in place of the dialog below, and lets the human keep
  editing during an AI turn. Until it lands, the single-writer rules below are what ships,
  and `nextId`'s per-document counter is unique only because there is one writer — M15 makes
  record ids replica-scoped (`data-008`) before any merge path exists. So v1's MCP server
  edits a **closed** project file only. Concretely:
  every call re-reads the file (reloading if anything else changed it); a write takes
  `<file>.lock` for that one read-modify-write (so two servers serialise, never interleave),
  writes a temp file and renames it over the original, and a refused call writes nothing.
  The app re-reads a file it holds a File System Access handle for (desktop Chromium only)
  on window focus and before every in-place Save, and on a difference asks **Reload /
  Overwrite the file / Cancel** — no merge, and Save never overwrites without that answer.
  Engines without a handle (Safari, Firefox, every phone) cannot see the change; the user
  re-Opens the file. The localhost live-editing bridge is the reserved `ai-012`, planned as
  one writer (the open tab) with the AI as its client, not as a merge.
- **BYOK chat** — the user's own API key in IndexedDB (the existing
  `src/storage/tokenStorage.js` credential store), called directly from the browser. An
  AI turn builds on a forked copy of the document and lands as one atomic `ai`-origin
  batch; **Undo AI turn** takes it back without touching the local undo stack.
- Text that arrives with a loaded project (intent, names, standing instructions) is
  **data, never instructions**, and tool calls have hard limits enforced in code — see
  the trust model in `docs/decisions/ai-partner.md`.

## Acceptance Scenarios and the token-paced backlog runner

`TODO/ACCEPTANCE.md` and `TODO/BUDGET.md` are both created at kickoff, alongside
`TODO/ROADMAP.md` — see Working Files below and each file's own header for what goes in
it. In short:

- `TODO/ACCEPTANCE.md` is the fixed, small set of end-to-end use cases from the
  Verification section above — write these once, before feature work starts, not
  filed reactively as they're discovered.
- `TODO/BUDGET.md` paces the automated `/run-todos` loop. The second attempt's own
  token-window-estimation scheme (three rolling-spend checks computed from
  self-reported per-task token logs) never worked: `TODO/BUDGET.md`'s own history there
  shows its calibration constant raised twice in three days because the estimate
  routinely overshot real usage by 1.2x-40x, in the same direction every single time it
  was checked against the user's actual usage dashboard. This attempt paces against a
  **fixed task-count batch with an explicit go/no-go**, per that retrospective's own
  recommendation ("a fixed, conservative task-count-per-check-in cadence with an
  explicit user go/no-go is more honest than an automated estimate that needs two
  manual recalibrations in three days to stop being wrong in both directions") — see
  `.claude/commands/run-todos.md` for the mechanism.
- Both loops draw against the same standing cadence concerns — don't run the audit loop
  (`.claude/prompts/project-audit.md`) and the backlog loop as if they're unrelated;
  `TODO/BUDGET.md` tracks both.

## Licensing (applies to every file you create or edit)

This project is copyleft on purpose, and the prompts and specs that build it are a major part
of the work, not scaffolding. Full map in `LICENSING.md`; the rules you must follow:

- **Code** (`src/`, `mcp/`, `e2e/`, `scripts/`, `bench/`, configs) is **AGPL-3.0-or-later**.
  **Prose** — `TODO/`, `.claude/commands/`, `.claude/prompts/`, `docs/`, this file, and every
  other `*.md` — is **CC BY-SA 4.0**. `chat/` is all rights reserved.
- **Every new source or Markdown file carries its SPDX marker.** Run
  `node scripts/spdx.mjs --fix` after `git add`ing new files; `npm run spdx` (CI) fails
  without it. Markdown markers go at the *end* of the file, because many files open with
  front matter. Never remove or alter a marker.
- **New `TODO/<id>.md` files and new `.claude/` command/prompt files are licensed
  CC BY-SA 4.0 like their siblings** — don't paste in text from a source with an
  incompatible license.
- **Don't add a dependency, asset or code snippet under an incompatible license**
  (proprietary, "non-commercial", SSPL, and the like). `npm run licenses` holds the allow-list
  for production dependencies; a new entry on it is a decision for the user, not for you.
- **Commits carry a DCO sign-off** (`git commit -s`) in addition to the attribution trailer
  the commit workflow already adds — see `CONTRIBUTING.md`.
- Never relicense, drop attribution, or "clean up" a license notice, even when refactoring
  or moving a file; carry its marker with it.

## Working Files

- `TODO/ROADMAP.md` — the ordered build plan. **Does not exist yet.** Create it during
  kickoff: for each major capability, walk through the interaction-model questions in
  `.claude/commands/feature.md` Phase 1 (Q10-16) *before* writing the roadmap entry, not
  after — the first attempt's prompt asked for lots of clarifying questions but got
  stack/storage questions back, not UI/UX ones, and paid for that gap later. Also
  resolve the remaining **Open** Stack row (document/sync — geometry kernel is now
  committed, see `docs/decisions/geometry-kernel.md`) via Library decisions before the
  roadmap can name real task dependencies for it. (Done for document/sync by `docs-022`,
  2026-10-12 — see `docs/decisions/document-sync.md`.)
- `TODO/ACCEPTANCE.md` — the fixed set of 5-10 named end-to-end use cases the AI itself
  drives and reports PASS/FAIL against, per Verification above. **Does not exist yet.**
  Write it at kickoff, same session as the roadmap.
- `TODO/` — one file per feature or finding; run one with `/fix-todo <id>`, or work
  through the backlog unattended with `/loop /run-todos` (see Acceptance Scenarios and
  the token-paced backlog runner, above).
- `TODO/BUDGET.md` — the batch-size/check-in cadence for `/run-todos` and its
  append-only Runner Log. **Does not exist yet** — created at kickoff with a
  conservative starting batch size; adjust the number there, not in `CLAUDE.md` or the
  command file.
- `TODO/VERIFY.md` — a small, specific manual-verification queue, kept deliberately
  short per Verification above — not the ever-growing per-task checklist the second
  attempt's stop note flagged. Appended by `/fix-todo` Step 8 only for what's genuinely
  one-off and not already covered by an `ACCEPTANCE.md` scenario.
- `TROUBLESHOOTING.md` — non-obvious root causes. Read before debugging; append via `/troubleshoot`.
- `docs/decisions/` — library and architecture decisions, with the data behind them
  (see Library decisions above).
- `chat/` — drafted social posts, appended by `/commit`.
- `PREVIOUS-ATTEMPT.md` — retrospective on why the first build of this project was
  shelved. Read it once at the start.
- `SECOND-ATTEMPT.md` — retrospective on why the second build was shelved, after fixing
  everything the first retrospective asked for. Read it once at the start, alongside
  the first — the Interaction Model and Verification sections above are both distilled
  directly from these two documents, and understanding *why* each rule exists is what
  lets you judge an edge case the rule's wording didn't anticipate.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
