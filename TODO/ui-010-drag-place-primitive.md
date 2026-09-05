---
title: Drag-place a primitive — generic mechanism wired to all 7 base primitives
category: ui
kind: feature
priority: high
model: opus
milestone: M1
depends: [render-001]
status: open
---

## Goal

The project's first geometry-creation feature: dragging a primitive row (Cube/Cuboid,
Cylinder, Cone, Hexagon, Triangle, Tube, Sphere — `primitive.*` in the kernel registry,
§6's Base creation rows) out of the Library panel and into the 3D viewport commits a
new `primitive.*` op record into the document. This is `docs/decisions/
interaction-model-qa.md`'s **control 1**, already fully answered by `ui-001` — this
task is that control's Q10-17 answers turned into working code, not a re-derivation of
the interaction design from scratch.

Per `CLAUDE.md`'s non-negotiable rule, this must be one **generic** drag-place
mechanism parameterized by which primitive op the row names, not seven near-identical
hand-copies — the roadmap's own stated reason for grouping all seven under one task
id instead of seven.

**Done when**: with the app running at `/`, dragging the "Cube" row (or any of the
other six) from the Library panel's "Primitives" section into the viewport and
releasing places that primitive at the drop position; it renders immediately, becomes
selected on drop, and a second drag-and-drop of a different primitive leaves the first
one visibly in place (the exact regression `TODO/ACCEPTANCE.md` scenario 1 exists to
catch, per `CLAUDE.md`'s Verification section — the second attempt's own real bug was
a second body silently hiding the first).

## Required addition — the command layer doesn't exist yet, and this is the task that needs it

`CLAUDE.md`'s Architecture section requires "every document mutation goes through the
command layer inside a transaction with an origin. Never mutate document state
directly from a component." No such module exists yet: `src/core/` currently has only
`replay.js` (`evaluate`d fold, read-only — takes a full action array and derives a
`Scene`) and `ndjson.js` (serialize/parse, no runtime document state). Nothing yet
holds a **growing, mutable array of action records that a running app appends to**,
which is exactly what dropping a primitive needs to do.

This task is the first one that actually performs a document mutation from the UI, so
per `docs/decisions/document-sync.md`'s own architecture (single-writer append log,
no CRDT), it is the task that must stand up the minimal command layer:

- A small, framework-free module (suggest `src/core/document.js`) holding the action
  array, an `append(record, { origin })` function that pushes a new `OpRecord` and
  returns the new derived `Scene` (via `replay.js`'s existing `applyAction`, folding
  incrementally rather than replaying from scratch on every append — `core-002`'s
  `applyAction` already takes a prior scene, use it), and the origin-tagging
  `CLAUDE.md`'s undo/redo section requires (a `{ origin: 'local' }` shape is enough for
  now — this task does not need to build undo/redo itself, only ensure every mutation
  is recorded with an origin so a later undo/redo task isn't retrofitting it).
- A thin Pinia store (`src/stores/document.js`, per `CLAUDE.md`'s "UI-only stores"
  note — this store holds a *reference* to the current derived `Scene` for reactivity,
  it does not duplicate document state itself) that components read from and dispatch
  through.
- This is intentionally minimal — full undo/redo, transaction batching, and
  persistence (`src/storage/`) are separate, larger concerns for later tasks. Scope
  here is exactly "a drop can append one record and the viewport reflects it."

Flagging this now, the same way `render-001` flagged and resolved the outstanding
rendering-library decision: this is real, necessary scope growth, not optional
polish, and it's being stated explicitly rather than discovered mid-implementation.

## Interaction model

(Transcribed from `docs/decisions/interaction-model-qa.md` control 1, Q10-17.)

- **Precondition**: none — primitive rows are always available regardless of scene
  state.
- **Trigger**: pointer-down + drag on a Library row under "Primitives". While the drag
  is over non-viewport UI, a small icon follows the pointer; once the drag crosses into
  the viewport, the icon is replaced by a translucent full ghost mesh positioned at the
  pointer's projected point on the working plane (grid plane at Z=0, since no other
  geometry exists yet to project against — that projection-target logic should already
  be written generically enough for a later task to extend when non-empty-scene
  projection is needed).
- **Feedback**: on release inside the viewport, the ghost commits as a `primitive.*` op
  record (via the command layer above) appended to the action log at the drop
  position, and the new item becomes selected. (Full selection→inspector/gizmo
  behavior is `ui-011`'s job, not this task's — for this task, "becomes selected" means
  only: the new item is marked as the current selection in the UI-only selection
  store, ready for `ui-011` to react to. Do not build the inspector/gizmo response
  here.)
- **Placement**: yes, drag-to-place as described above — explicitly not a fixed-origin
  spawn.
- **Selection response / count**: n/a for this task (deferred to `ui-011`), beyond
  setting the new item as selected per Feedback above.
- **Small-screen behavior**: the Library panel is not persistent at 390px; it lives
  behind a bottom-sheet tab. The drag gesture itself is unchanged (touch-drag instead
  of mouse-drag), but the sheet must already be open to the Library tab before the drag
  can start — there is no way to drag a row that isn't currently rendered. State this
  explicitly in the UI (e.g. the sheet doesn't auto-close mid-drag) since this is a
  precondition step that doesn't exist at laptop width, where the Library column is
  always visible.

## Documentation

- **Page**: `docs/primitive-placement.md` (new) + sidebar entry.
- **Example**: "Open the Library panel (always visible on laptop/tablet; tap the
  Library tab at phone width to open it as a bottom sheet). Press and drag the 'Cube'
  row into the 3D viewport — a translucent preview follows your pointer or finger.
  Release to place it; the cube appears at that position and becomes selected. Repeat
  with 'Sphere', 'Cylinder', or any other primitive row — each drop adds a new,
  independent object; earlier objects stay exactly where you placed them."

## Required addition #2 — 4 of the 7 primitives aren't registered in the kernel yet

`src/core/kernel/registry.js` currently has only `primitive.cuboid`, `primitive.
cylinder`, and `primitive.hexagon` (confirmed by reading the file directly, not
assumed). Cone, Triangle, Tube, and Sphere have no registry entry at all yet. This
task's whole point is a generic mechanism proven across the full base-primitive set —
per `docs-003`'s own roadmap rationale, "one `*.e2e.js` spec exercising two of them is
enough to prove the mechanism," but the Library panel itself should still list, and be
able to place, all 7, not silently ship 3 and call it done.

`@jscad/modeling` 2.13.0's actual primitive export list (confirmed by inspection, not
memory): `sphere` and `triangle` exist directly, so those two are one-line `native(0,
...)` entries exactly mirroring `primitive.cuboid`'s existing pattern. **Cone and Tube
have no direct primitive**, the same situation `primitive.hexagon`'s own code comment
already documents and solves for hexagon (composing from `cylinder` with a low
side/radius trick) — follow that established precedent's reasoning for Cone
(`cylinder`-family shape with `radiusEnd: 0`, or the closest equivalent V3 actually
exposes — check `cylinderElliptic`'s real signature rather than assuming one) and Tube
(a hollow cylinder — either a boolean subtraction of two cylinders, or a direct
extruded-ring approach if one exists). Add a comment at each new entry explaining the
composition choice, matching hexagon's own documented style, so a future reader
doesn't wonder why "primitive" entries not in `@jscad/modeling` are built out of other
primitives.

## Affected files

- `src/core/kernel/registry.js` (edit — add the 4 missing `primitive.*` entries above)
- `src/core/kernel/registry.spec.js` (edit — numeric-tolerance tests for the 4 new
  entries, degenerate cases per `CLAUDE.md`'s numerical-code convention)
- `src/core/document.js` (new — the minimal command layer, see Required addition
  above)
- `src/stores/document.js` (new — UI-facing Pinia store wrapping the command layer)
- `src/stores/selection.js` (new, or extend if `render-001` created a UI-state store
  already — tracks the current selection id(s); this task only needs to *set* it on
  drop, not consume it)
- `src/components/layout/LibraryPanel.vue` (new — the "Primitives" section listing the
  7 draggable rows; other Library sections like Hardware/Kit-parts are `ui-013`'s job,
  not this task's, but the panel shell itself is reasonable to create here since
  nothing else does yet)
- `src/components/viewport/Viewport.vue` (edit — drag-over/drop handling, ghost-mesh
  preview, working-plane projection; this file already exists from `render-001`)
- `e2e/primitive-placement.e2e.js` (new)
- `docs/primitive-placement.md` (new) + docs sidebar config

## Proposed fix

Registry-driven, not hardcoded per primitive: the Library panel's "Primitives" section
iterates the kernel registry's `primitive.*` entries (already present from `core-001`
scaffolding — confirm exact op names, e.g. `primitive.cube`, `primitive.sphere`, etc.,
by reading `src/core/kernel/registry.js` directly rather than assuming names) and
renders one draggable row per entry, each carrying its own `op` string as drag payload
— this is what makes it one mechanism, not seven copies.

Drag/drop: use the native HTML5 drag-and-drop API for mouse, and pointer events
(`pointerdown`/`pointermove`/`pointerup`) for touch, since HTML5 DnD has no reliable
touch equivalent — both paths must converge on the same "ghost follows pointer, commit
on release" logic, sharing code rather than being two parallel implementations (the
same "one source of truth" principle `render-001`'s camera controls already
established for mouse-drag vs. on-screen-button input).

Ghost preview: a translucent low-detail mesh (reuse `src/render/scene.js`'s existing
material/mesh-creation helpers from `render-001` if they generalize; otherwise add the
minimal addition needed) that raycasts against the grid plane (Z=0) to find its world
position from the pointer's screen position, using the camera from `src/render/
camera.js`.

Commit: on drop, build an `OpRecord` (`{ op, params: <primitive's default params>,
name: <auto-generated per-type counter, e.g. "Cube 1">, id: <generated> }`) positioned
via a `transform.translate` record appended immediately after it (or an equivalent
positioned-primitive shape — check whether the registry already has a way to
parameterize a primitive's own position directly before assuming a second record is
needed), dispatch it through the new `src/stores/document.js` → `src/core/document.js`
command layer, and set the new record's id as the current selection.

## Effort

L (multi-session / needs design discussion) — this task also stands up the command
layer, not just the drag UI.

## Testing

`e2e/primitive-placement.e2e.js`, navigating to `/`, covering: dragging a primitive
into the viewport places it and it renders; dragging a second, different primitive
places it too and the first one remains visible and unmoved (the exact scenario-1
regression this project's second attempt shipped); the new item is marked selected
after drop (verify via whatever minimal selection-state signal this task exposes, e.g.
a `data-selected` attribute or store state — full inspector/gizmo response is
`ui-011`'s test, not this one's).

Since the "Small-screen behavior" bullet above is not "same as desktop" (the Library
panel moves to a bottom sheet at phone width), this spec runs at all three reference
viewports (phone 390×844 / tablet 820×1180 / laptop 1440×900) with a snapshot at each.
Since this touches a WebGL/canvas-sensitive path (the ghost preview, the raycast
projection, the committed mesh render), this spec also runs against all three browser
engines (Chromium/Firefox/WebKit) — not Chromium alone.

**`TODO/ACCEPTANCE.md` scenarios this could plausibly affect**: scenario 1 ("Two
independent primitives") directly — this task is what makes that scenario driveable
for the first time; re-drive it by hand per `/fix-todo` Step 6 once this task's code
exists. No other scenario is affected (selection/inspector is `ui-011`; hardware/snap
is `ui-013`; booleans are `ui-014`).

**No closed findings exist yet in this project against the document/command-layer or
drag-placement subsystems** — this is the first task to touch either, so there is
nothing to re-check.
