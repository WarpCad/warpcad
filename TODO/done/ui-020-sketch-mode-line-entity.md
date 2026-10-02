---
title: Open sketch mode and draw one line entity — src/sketch/'s first task
category: sketch
kind: feature
priority: medium
model: opus
milestone: M4
depends: [render-001]
status: done
---

> **What actually shipped** — the design decisions above landed as written (the
> `sketch.*` fold branch, `sketchEntities()`, the SVG stroke overlay, the reused
> `camera.snapTo('top')` and `pick.js` projection). Four things go beyond what this
> file listed, three of them found by the Step 6 acceptance drive rather than by any
> test, and all recorded in `TODO/ACCEPTANCE.md` scenario 9's Last run entry:
>
> - **Files beyond Affected files**: `src/render/annotate.js` (the stroke projection
>   and segment-distance helpers, where every other overlay's maths already lives),
>   `src/components/viewport/SketchStrokes.vue` (the overlay, extracted rather than
>   inlined per the thin-views rule), `src/composables/useSketchCommands.js` and
>   `src/stores/sketchPreview.js` (mirroring `useTransformCommands`/`transformPreview`,
>   so the draw gesture, the endpoint handles and the Inspector's typed fields are
>   structurally one mutation path), `src/stores/selection.js` (a separate `sketchId`,
>   so a selected line can never present itself as a boolean operand), and
>   `NavigationChrome.vue`/`OrientationGizmo.vue` (the toggle's home, and the camera
>   lock's other half).
> - **The drawn line is not auto-selected**, unlike a dropped primitive — the drive
>   found auto-selection auto-opening the phone Inspector sheet over the line that had
>   just been drawn (reachable canvas 69% → 29%).
> - **Sketch mode claims the viewport's single top-left toolbar slot**, hiding the
>   Operations toolbar and the drag-mode row for the duration; a top-centred Sketch
>   toolbar collided with the orientation gizmo at both the tablet and phone
>   references, where the viewport element is 390px wide either way.
> - **Endpoint editing is in scope**, since this file's own Testing section required
>   dragging a handle and watching the Inspector update — so the `supersedes`-a-sketch-
>   record path this file described as a future task is built and covered.

## Goal

`src/sketch/` does not exist yet. `Initial design.md` gives sketch mode far less
design depth than the 3D catalog, so per `CLAUDE.md`'s ordering rule this needed its
own interaction-model Q&A pass before being scoped — done in
`docs/decisions/interaction-model-qa.md`'s new section 7, alongside this file, and
transcribed as `TODO/ACCEPTANCE.md` scenario 9. This task implements exactly that
Q&A's answer: a **Sketch** mode toggle that locks the camera to the working plane and
lets the user draw **one entity type — a straight line** — nothing more. Rectangle,
circle, arc, snapping, dimensions, and constraint solving are explicitly later tasks
extending this one, not something this task has to anticipate. "Done" looks like:
click Sketch, camera snaps to a straight-on view, drag once on the grid, release — a
line entity commits and renders as a distinct 2D stroke; click it and its start/end/
length show in the Inspector with draggable endpoint handles instead of a 3D gizmo;
click Exit Sketch and free orbit returns, with the line still in the scene.

## Interaction model

Fully answered in `docs/decisions/interaction-model-qa.md` section 7 — this file
does not re-derive it, only implements it. Summary:

- **Precondition** — nothing selected; this is a mode toggle, not an operand-gated
  operation.
- **Trigger** — a **Sketch** button in the main viewport chrome (alongside the
  existing nav-chrome controls, not the Library or Operations toolbar). Entering
  sketch mode snaps the camera to the working plane's straight-on view and suspends
  orbit; a **Sketch toolbar** (Line tool, active by default since it's the only tool;
  **Exit Sketch**) mounts. Drawing: pointer-down on the plane starts a live preview
  segment tracking the pointer; pointer-up commits it. A zero-length release commits
  nothing (degenerate case, stated explicitly in the Q&A).
- **Feedback** — the committed line renders as a distinct thin bright stroke, visually
  unlike a shaded 3D solid. Exiting returns free orbit and hides the Sketch toolbar;
  the line persists in the scene.
- **Placement** — yes, drag-to-place, the 2D analogue of `ui-010`'s mechanism (see
  Proposed fix for direct reuse of `pick.js`'s existing working-plane math).
- **Selection response** — clicking a drawn line shows its start/end/length in the
  Inspector; **no 3D transform gizmo attaches** — draggable endpoint handles instead,
  driving the same Inspector fields live (the 2D equivalent of control 4's gizmo/field
  sync contract).
- **Selection count** — n/a; single-entity selection only, at ordinary count 1.
- **Small-screen behavior** — Sketch toolbar collapses at phone width the same way
  the existing nav chrome already does; drawing needs no modifier key on any pointer
  type, since sketch mode's own orbit-suspension removes the gesture collision a
  marquee or pan would otherwise have with a plain drag.

## Documentation

- **Page**: `docs/sketch-mode.md` (new) — first page for `src/sketch/`; note
  explicitly that this covers only line-drawing today, with a forward-reference to
  where rectangle/circle/arc will land once they exist, so a reader isn't left
  wondering if they're missing a control that simply isn't built yet.
- **Example**: "Click the Sketch button in the viewport chrome — the camera snaps to
  a flat, straight-on view and a small toolbar appears with Line and Exit Sketch.
  Drag once anywhere on the grid and release — a line appears exactly where you
  dragged. Click the line: its start point, end point, and length appear in the
  Inspector, with two small draggable handles on the line itself instead of the
  usual move/rotate gizmo. Click Exit Sketch to return to normal 3D navigation; your
  line stays in the scene."

## Affected files

- `src/sketch/` (new directory) — `src/sketch/entity.js`: a plain `LineEntity`
  shape (`{ id, startMm: Vec2Mm, endMm: Vec2Mm }`) and pure helpers (`lengthOf`,
  `moveEndpoint`), framework-free per `CLAUDE.md`'s Project Structure, mirroring
  `src/core/kernel/group.js`'s own "pure functions over plain values" convention.
- `src/core/document.js` — **the real design decision this task makes**: a
  `sketch.line` record is appended through the ordinary `documentStore.append()`
  path (so undo/redo and origin-tagging work for free, per every other mutation in
  this project), but `document.js`'s own fold must recognize `record.op.startsWith(
  'sketch.')` and route it to a **new, parallel `sketchEntities` map** instead of the
  kernel's `evaluate()` — a sketch line is 2D vector data, not a `Geom3`/`Group`, and
  routing it through the kernel registry at all would mean either inventing a third
  `RegistryEntry.kind` the fold's `evaluate()` (`src/core/kernel/index.js:172`) has to
  branch on, or teaching the kernel adapter about non-geometry records — both cross
  the `src/core/kernel/` boundary `CLAUDE.md`'s Project Structure draws on purpose
  ("Everything else in `core/` talks to the kernel through this interface... never to
  the underlying geometry library directly"). Skipping the kernel round-trip entirely
  for `sketch.*` ops keeps that boundary intact. New `document.sketchEntities()`
  accessor, mirroring `bodies()`'s existing shape, for `Viewport.vue` to read.
- `src/render/pick.js` — no change needed; its existing working-plane
  `ndcFromClient`/ray-projection math (built for `ui-010`'s drag-to-place ghost) is
  exactly the math a sketch-point pick needs, reused directly rather than duplicated.
- `src/render/camera.js` — no change needed; `camera.snapTo('top')`
  (`camera.js:285-292`) already snaps to a straight-down view of the Z=0 working
  plane, which **is** the working plane `pick.js` already projects onto — sketch mode
  calls the same existing function, it does not need a new view preset.
- `src/components/viewport/Viewport.vue` — a `sketchMode` local/store flag; while
  active, `decideGestureKind()` routes every plain drag to "draw a line" instead of
  orbit (mirroring how the existing marquee/pan modifier-gesture routing already
  works, per section 6's addendum); a new render path for sketch strokes (distinct
  material/style from `bodyMaterial`), parallel to but independent of `syncBodies()`.
- `src/components/viewport/SketchToolbar.vue` (new) — Line tool (only one, for now)
  + Exit Sketch, mounted only while `sketchMode` is active.
- `src/components/inspector/Inspector.vue` — a sketch-entity branch: start/end/length
  fields and endpoint-handle wiring, alongside (not replacing) the existing body
  contract.
- `docs/sketch-mode.md` (new).
- `e2e/sketch-line-entity.e2e.js` (new) — see Testing.

## Proposed fix

**Reuse, don't rebuild, the working-plane and drag-preview machinery `ui-010`
already proved.** `pick.js`'s screen→world projection onto Z=0 and its "everything
writes into a caller-supplied vector, no per-frame allocation" discipline apply
identically to a sketch-point pick — the *only* new math is `lengthOf(start, end)`
and a live preview segment, both trivial compared to `ui-010`'s own primitive-preview
ghost.

**The document-layer decision (see Affected files) is this task's real content.**
Sketching bypasses the kernel deliberately: `document.js`'s fold gets one new branch,
checked before the existing kernel-evaluate call, that recognizes a `sketch.`-prefixed
op and stores `record.params` into `sketchEntities` (keyed by `record.id`, same
lineage-root bookkeeping pattern `bodies()` already uses for `supersedes`, since a
future "edit an endpoint" task will want to supersede a sketch record the same way
`transform.translate` supersedes a body's). No kernel test coverage is needed for
`sketch.line` — it never reaches `src/core/kernel/` at all; coverage lives entirely in
`document.spec.js`.

**Camera lock, not a new projection.** Sketch mode's "straight-on view of the working
plane" is exactly `STANDARD_VIEWS.top` (`camera.js:45`, already covering the Z=0
plane `pick.js` already targets) — call the existing `camera.snapTo('top')` on entry
and suspend the orbit gesture (a boolean guard in `decideGestureKind()`) until exit,
rather than building a second camera-orientation mechanism.

## Effort

L — a real, first-of-its-kind cross-layer decision (how a non-geometry record
coexists with the kernel-evaluated document fold, stated above) plus a new component
tree (`SketchToolbar.vue`, the render path's stroke overlay, the Inspector's
sketch-entity branch) with no existing pattern in this codebase to closely mirror,
even though the *math* involved (a projected line segment) is simple. `model: opus`
per `TODO/README.md`'s guidance: real architectural ambiguity, a cross-layer contract
(document ↔ render ↔ inspector) with no existing pattern to mirror, at `Effort: L`.

## Testing

Vitest:
- `src/sketch/entity.spec.js` — `lengthOf` on a real 3-4-5 triangle case
  (`toBeCloseTo`); a zero-length segment (`start === end`) reports length `0` without
  throwing (the entity module itself doesn't reject it — the *interaction* layer is
  what refuses to commit one, per the Interaction model's degenerate-case bullet);
  `moveEndpoint` updates only the named endpoint, leaving the other untouched.
- `src/core/document.spec.js` — appending a `sketch.line` record populates
  `sketchEntities()` and does **not** appear in `bodies()`; the kernel's `evaluate()`
  is never called for a `sketch.*` op (spy/assert call count, not just output) —
  proving the boundary-preserving claim above rather than asserting it in prose only;
  undo/redo (once it exists) would need to treat a `sketch.line` append the same as
  any other origin-tagged record — note this explicitly as a forward-looking
  assertion if undo/redo isn't implemented yet at the time this lands (check
  `document.js`'s current state at Step 2).

`*.e2e.js` — required, first `src/sketch/` UI surface:
- `e2e/sketch-line-entity.e2e.js` (new): click Sketch, confirm the camera view
  changed (compare `camera.js` state before/after, or a rendered-pixel signature) and
  the Sketch toolbar mounted; drag once on the grid, release, confirm exactly one
  line entity exists and renders with a style distinct from a 3D body (a CSS/material
  property check, not a pixel-perfect snapshot); click the line, confirm the Inspector
  shows start/end/length and no gizmo is present; drag an endpoint handle, confirm the
  Inspector's length field updates live; click Exit Sketch, confirm free orbit
  returns (a drag now orbits, not draws) and the line is still present. A second case
  confirms a zero-length drag (pointer-down/up at the same point) commits nothing.
- Reference viewports: **all three** (phone/tablet/laptop) — new mode-gated toolbar,
  per the Interaction model's Small-screen bullet, and this is the first control this
  project builds with no keyboard-or-modifier touch equivalent to check for gesture
  collisions.
- Engines: **all three** (Chromium/Firefox/WebKit) — new camera-lock behavior and a
  new render path (the sketch-stroke overlay), both WebGL-adjacent per CLAUDE.md's
  Browser Support section, at the same bar `render-001`'s own first viewport task set.

**Acceptance scenarios**: **scenario 9** (this task's own, added to
`TODO/ACCEPTANCE.md` alongside this file) — drive it in full per that scenario's
Steps/Expect. Also re-drive **scenario 7** (touch-only viewport navigation), since
this task adds a new orbit-suspension state to `Viewport.vue`'s gesture routing —
confirm ordinary 3D navigation (outside sketch mode) is completely unaffected by the
new code path existing.

**Regression surface**: this is `src/sketch/`'s first task, so there is no prior
closed finding in that subsystem to re-run. It does add a new branch to
`document.js`'s fold (checked before the kernel-evaluate call) — re-run the full
existing `document.spec.js` suite unchanged to confirm no existing `bodies()`/
`currentIdOf()`/`consumes`/`supersedes` behavior moved for ordinary (non-`sketch.`)
records, the same standing-regression-surface check every prior `document.js`-touching
task (`ui-014`, `ui-015`, `ui-016`, `core-020`) has run.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
