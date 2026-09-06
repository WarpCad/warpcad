---
title: Gizmo move/rotate ↔ numeric-field sync (makes ui-011's display-only handles interactive)
category: ui
kind: feature
priority: high
model: opus
milestone: M1
depends: [ui-011]
status: open
---

## Goal

`ui-011` built a gizmo (visual only) and an Inspector Transform section (read-only)
attached to the current selection. This task makes them **interactive and mutually
live**: dragging a gizmo handle moves/rotates the body and the Transform section's
numeric fields update in step, live, during the drag; editing a Transform field
commits a move/rotate on blur/Enter and the mesh updates immediately. This is
`docs/decisions/interaction-model-qa.md`'s **control 4**, already answered — but read
the Required addition below before implementing: the concrete shape of "how a
transform gets applied" changed since that Q&A was written, because `ui-010` decided
to store a fresh primitive's position directly in its own `center` param rather than
via a trailing `transform.translate` record.

**Done when**: selecting a body, dragging its gizmo's translate arrow, moves the body
and the Inspector's Position fields update live during the drag, not only after
release. Editing a Position or Rotation field directly and committing (blur/Enter)
moves/rotates the body to match. Both directions write through the same underlying
mutation — dragging then reading the field, or typing then reading the gizmo's
position, always agree. **Critically**: after a move or rotate, exactly one body is
still rendered at the new position — not two (see Required addition).

## Required addition — moving a body must not duplicate it

`src/components/viewport/Viewport.vue` renders from `documentStore.raw.bodies()`
(`src/core/document.js`'s `bodies()`), which currently produces **exactly one `Body`
per record that carries an `id`** — it does not know about "the same logical object,
now in its Nth state." Read `document.js` in full before implementing; the problem is
concrete, not hypothetical:

If this task appends a `transform.translate`/`transform.rotate` record with
`target: <existing body's id>` (the shape `control 4`'s Q&A originally assumed, and the
shape `transform.translate`'s existing registry entry — `operandCount: 1` — already
supports), that record gets its **own** id and becomes a **second** entry in
`bodies()`'s output. The original id's geometry is still sitting in `scene.byId`,
unchanged, at the old position. Render both, and the body has just been duplicated —
the exact inverse of `TODO/ACCEPTANCE.md` scenario 1's regression ("placing a second
body silently hid the first"; this would be "moving a body silently doubles it"), and
just as visible to a user on the very first drag.

This task must give `document.js` (or a layer built on top of it) a way to say "the
current representation of logical body X is now id Y" so `bodies()` reports exactly
one entry per logical object, always reflecting its latest transform, while the
original and every intermediate id stay in `entries`/`scene.byId` for history (a
future undo/redo task needs the full chain — don't delete anything, just don't
double-render it). A `supersedes` field on the transform record (or an equivalent
"latest id per lineage" index `document.js` maintains) is one reasonable shape; choose
whatever fits `document.js`'s existing append-only, immutable-entries design most
cleanly, and document the choice in the module's own doc comment the way `document.js`
already documents its other design decisions.

Two things this does **not** require: (1) `src/core/inspector.js`'s existing
position/rotation display already reads off the *evaluated geometry*, not the raw
param — per `ui-011`'s own commit message — so once `bodies()` exposes the correct
terminal geometry, the Inspector's display continues to work unchanged, no inspector.js
change needed for this reason alone. (2) `group.js`'s `add()`/`combine()` path
(`names` array, `resolvePieces`) is a **separate, latent hazard** you likely won't
need to touch — it currently appends to `names` without deduplicating, so two records
sharing a `name` would union a body with itself in the *combined* group output.
`document.bodies()` (the actual render path per the grep above) doesn't go through
`combine()`, so this task probably doesn't exercise it — but if your chosen design
does end up naming a superseding record the same as its predecessor and something
calls `combine()`/`toGeom3()` on the group, this bug is real and will bite. If you
don't need to touch it, log it via `/troubleshoot` rather than silently leaving it for
whoever finds it next.

Add a native `transform.rotate` op to the kernel registry — none exists yet
(`src/core/inspector.js`'s `rotationOf` was built as the seam for this, per `ui-011`'s
commit). Mirror `transform.translate`'s existing shape (`native(1, ...)`,
`operandCount: 1`); accept degrees in `params` and convert to radians at the registry
boundary, per `registry.js`'s own documented unit-conversion convention — never in a
component.

## Interaction model

(Transcribed from `docs/decisions/interaction-model-qa.md` control 4, Q10-17.)

- **Precondition**: exactly one item or group currently selected (gizmo already
  attached per `ui-011`).
- **Trigger**: **either** (a) pointer-drag on a gizmo handle (translate arrow or
  rotate ring) in the viewport, **or** (b) direct edit of a numeric field in the
  Inspector's Transform section.
- **Feedback**: for (a), the mesh transforms live during the drag and the Transform
  section's fields update live in step — not only after release. For (b), the mesh
  updates immediately on field commit (blur/Enter). Either path results in the same
  underlying mutation (see Required addition).
- **Selection count**: exactly 1 selected item, or exactly 1 selected group (group
  case: the gizmo transforms the whole group's combined bounding box/origin — if
  `ui-015`/group-combine doesn't exist yet in this codebase, implement the single-item
  case fully and state explicitly that the group case is deferred to whichever task
  lands group-combine, rather than guessing at group semantics that don't exist yet).
- **Small-screen behavior**: gizmo handles need a larger invisible hit-test radius
  than their rendered size, to compensate for finger contact area vs. a mouse
  pointer's single-pixel precision. Numeric fields are edited via the platform's
  on-screen keyboard in the same bottom sheet `ui-011` already opens on selection.

## Documentation

- **Page**: update `docs/selection-and-inspector.md` (from `ui-011`) — add a section
  on moving/rotating a selected body, rather than a new page (this is the same
  feature's next increment, not a separate capability).
- **Example**: "With a body selected, drag any of the gizmo's three arrows to move it
  along that axis — the Inspector's Position fields update as you drag. Drag a
  rotation ring to rotate it. Or, type a new value directly into a Position or
  Rotation field in the Inspector and press Enter — the body moves to match."

## Affected files

- `src/core/kernel/registry.js` (edit — add `transform.rotate`)
- `src/core/kernel/registry.spec.js` (edit — numeric-tolerance tests for the new op)
- `src/core/document.js` (edit — the supersession/lineage mechanism described above)
- `src/core/document.spec.js` (edit — a move/rotate must not increase `bodies()`'s
  length; the body's geometry must reflect the latest transform)
- `src/components/viewport/Gizmo.vue` (edit — from `ui-011`, add pointer-drag
  interactivity to the existing visual handles)
- `src/components/inspector/Inspector.vue` (edit — from `ui-011`, make Transform
  fields editable, remove the "read-only until transform tools land" note `ui-011`
  added)
- `e2e/gizmo-transform.e2e.js` (new)
- `docs/selection-and-inspector.md` (edit)

## Proposed fix

One shared function (in a framework-free module, not duplicated in both the gizmo
drag handler and the field-commit handler) that takes a body id, an axis, and a delta
(translate) or angle (rotate), and appends the right `transform.*` record through
`document.js`'s command layer with the supersession mechanism applied. Both the
gizmo's pointer-drag handler and the Inspector field's commit handler call this same
function — this is the same "one source of truth, not two input paths that can drift"
principle `render-001`'s camera controls and `ui-010`'s drag/drop already established
in this codebase.

During an active gizmo drag, don't append a new record on every pointermove (that
would flood the log with one entry per frame) — track the live delta locally, render a
preview transform directly on the mesh (three.js object transform, not a document
mutation) for immediate visual feedback, and append exactly one `transform.*` record
on pointerup with the total delta. The Inspector's fields should still read the live
preview transform during the drag (not wait for the append), which means the
selected body's current transform needs to be readable as reactive state the
Inspector can watch, separate from the document's own version counter.

## Effort

L (multi-session) — the document-layer supersession mechanism is real new
architecture, not just gizmo/field wiring.

## Testing

`e2e/gizmo-transform.e2e.js`, navigating to `/`: place a body, drag its gizmo's
translate handle, confirm the mesh moves and the Inspector's Position field updates
live during the drag (not only after release) and confirm **exactly one body**
remains rendered afterward (the duplication regression this task exists to prevent).
Edit a Position field directly, confirm the mesh moves to match. Repeat for rotation.
Place two bodies, transform one, confirm the other is unaffected (no cross-talk
through the document fold).

Runs at all three reference viewports (gizmo touch-target sizing is explicitly not
"same as desktop" per Q16). Runs against all three engines (gizmo drag math and mesh
transform are WebGL-sensitive).

**`TODO/ACCEPTANCE.md` scenarios this could plausibly affect**: strengthens scenario 2
("Hardware property edit") — `docs-004` already added a gizmo-drag step to that
scenario's steps for exactly this task. Re-drive scenario 2 in full this time (it's
been PARTIAL PASS twice now; `ui-013`'s absent Hardware row is still a real gap so a
Cylinder standing in for the Bolt is still expected, but the property-edit and
gizmo-drag steps should now be fully drivable). Also re-check scenario 1 (place two
bodies, confirm neither duplicates or vanishes when the other is transformed) since
this task's document-layer change is exactly the kind of change `CLAUDE.md`'s
Verification section calls out for re-checking a subsystem a scenario already covers.
No closed findings exist yet against the document/command-layer subsystem to re-check.
