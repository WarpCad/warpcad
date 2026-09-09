---
title: Drag-place hardware/kit-part with snap guides — generic snap-assist mechanism
category: ui
kind: feature
priority: high
model: opus
milestone: M2
depends: [ui-010]
status: done
---

> **What actually shipped, and where it departed from the Proposed fix below.** The
> mechanism landed as scoped — dashed guides on the nearest existing item, a ghost held
> in line within a tolerance radius, and the **snapped** position committing on drop —
> but three calls differ from what this file proposed, each deliberately:
>
> 1. **`calcSnap` is reused as arithmetic, not as a call.** `group.js` is untouched.
>    `calcSnap` takes solids, measures a bounding box and allocates a vector per call,
>    while the snap runs on every `pointermove` against five candidate alignments per
>    axis — which CLAUDE.md's Performance rule rules out. `src/core/library.js`'s
>    `alignmentOffsetMm` is the same `reference-side − moving-side` arithmetic reduced to
>    scalars, and each of its five alignments names the `SNAP_SIDES` orientation it
>    corresponds to. The equivalence is **asserted in the spec against `calcSnap` and
>    `calcCenterWith` themselves** rather than claimed in a comment.
> 2. **The tolerance constant is `SNAP_TOLERANCE_PX`, not `SNAP_TOLERANCE_MM`.** The
>    intent this file states — "scaled by the current `mmPerPixel` … so close enough reads
>    the same at any zoom level" — is a *screen* radius converted at the boundary; a
>    millimetre constant multiplied by `mmPerPixel` would be mm²/px. The unit is in the
>    name and `snapToleranceMm(mmPerPixel)` is the named conversion, per CLAUDE.md's
>    "name every conversion at its boundary".
> 3. **A proximity gate was added that this file did not anticipate.** An axis only snaps
>    when the ghost is also within tolerance of the reference on the *other* axis.
>    Without it, two solids at opposite corners of the grid still share an axis to within
>    a millimetre whenever the drag happened to travel along the other one, and the drop
>    was silently shifted into line with something 400 mm away — found by driving the app,
>    not by reading the maths. §7a asks for a snap "within a tolerance **radius** on
>    approach", and this is what makes it one. The cost is deliberate and named: the
>    long-range "line these two up across the whole canvas" guide a 2D design tool offers
>    is **not** provided here; aligning two distant solids is `ui-026`'s explicit
>    `group.snap`/`group.align` operation, with an operand order and an undo entry.
>
> Nearest-item selection is **world-space distance measured in the working plane** (XY
> millimetres from the projected drop point to each body's centroid), stated in
> `src/render/pick.js`'s own docs — not screen-space, so it cannot change its answer when
> the camera orbits without the pointer moving, and not 3D, so a tall body is not "further
> away" for being tall. Snapping is X/Y only: a placement drag projects onto the working
> plane and carries no height at all.
>
> Two defects the hand-drive caught that no test could, both fixed here: a centred guide
> spanning only the two coincident boxes was a stub *exactly as long as the solid it lay
> on top of* (guides now overhang by one tolerance at each end), and the guides shared
> `--accent` with the transform gizmo's rings and the Z dimension line, so over a selected
> body they read as part of the gizmo (they now have their own `--snap-guide` token, in
> both colour schemes).
>
> Driven with a **Cube and a Cylinder** standing in for scenario 3's Raspberry Pi and
> camera module, per the sequencing note in Goal: `core-010`/`core-011` had not landed,
> and `hardware.bolt` — which exists in the kernel — still has no Library row, because the
> Hardware section is fed by those same recipe tasks. No Hardware section was added here;
> that stays with `core-010`/`core-011`/`core-012`.


## Goal

Extend `ui-010`'s generic drag-place mechanism so that when the scene already has ≥1
existing item, dragging a new Library row over the viewport shows dashed alignment
guides on the nearest existing item's faces/edges and snaps the ghost within a
tolerance radius on approach — per `Initial design.md` §7a's mockup and
`TODO/ACCEPTANCE.md` scenario 3. This is the **mechanism**, the same granularity call
the roadmap already made for `ui-010` itself: proving it against any two placeable
items is the bar, not literally the specific pairing scenario 3 names as its example.

**Sequencing call to make explicit, not discover mid-task**: scenario 3's literal steps
drag a "Raspberry Pi 5" board and a "Camera Module V3" — both are M4 items
(`core-014`/`core-015`), not built by the time M2 runs. The roadmap's own M4 section
already anticipates this: `core-014`'s Acceptance column names "§9 scenario 3, full
assembly" as *its own* completion bar, not this task's. So this task's hand-drive
should stand in with whatever composite parts exist at implementation time —
`hardware.bolt` (already shipped) paired with `hardware.nut`/`hardware.washer` if
`core-010`/`core-011` have landed, or two primitives otherwise — the same kind of
stand-in call `ui-011`'s own retirement note already made for its absent-Bolt-row gap.
State this in the drive report rather than blocking the task on M4 landing first.

## Interaction model

- **Precondition**: a drag-in-progress from a Library row (any Creation row — hardware
  or kit-part) while the scene already contains ≥1 existing item. With zero existing
  items, dragging behaves exactly as `ui-010` already built — no guides, no snap. State
  this explicitly so "nothing to snap to yet" isn't a silent gap.
- **Trigger**: no new trigger — this augments `ui-010`'s existing pointer-drag's
  in-flight feedback and drop behavior, it doesn't add a control.
- **Feedback**: the nearest existing item (nearest to the ghost's current projected
  position — §7a: "closest item... when >1 item is in the scene") grows dashed
  alignment guides on its own faces/edges; the ghost snaps to the guide once within a
  tolerance radius. On drop, the **snapped** position commits as the placed item's
  `center`, not the raw pointer position.
- **Placement**: still drag-to-place per `CLAUDE.md` — this only adds assistance to an
  already drag-based control, it doesn't change that one exists.
- **Selection response**: n/a — this is about placement feedback during drag, not
  post-drop selection (`ui-011`/`ui-012` already cover that).
- **Selection count**: n/a — a creation control, no operand-count gating.
- **Small-screen behavior**: same guide/snap mechanism under touch drag at phone/tablet
  width; the guide lines must stay legible against the narrower canvas. No new toolbar
  chrome is added, so there's no collapse/reflow question the way `ui-019`'s settings
  gear had.

## Documentation

- **Page**: `docs/primitive-placement.md` (existing, from `ui-010`) — add a section on
  snap guides as a continuation of "how placement works", not a new page. No sidebar
  change needed since the page already exists.
- **Example**: "Drag a Bolt into the viewport and release to place it. Drag a Nut in a
  second time and move it near the bolt's thread — dashed guide lines appear on the
  bolt, and the nut's ghost snaps into alignment with the bolt's axis once close
  enough; release to drop it snapped in place."

## Affected files

- `src/core/kernel/group.js` — reuse the existing `calcSnap`/`SNAP_SIDES`/`centroidOf`
  directly; no change expected unless a new axis/orientation combination is needed.
- `src/core/library.js` — extend the drop pipeline (`paramsForDrop`/`recordForDrop`) or
  add a sibling function that computes a snapped `center` against the nearest existing
  body's already-evaluated geometry.
- `src/render/pick.js` — a nearest-body lookup during drag (screen-space or world-space
  distance from the ghost's projected point to each existing body's centroid).
- `src/components/viewport/Viewport.vue` — wire the drag-in-progress guide overlay and
  ghost-snap into the existing `ui-010` drag handlers.
- `src/components/viewport/` — a new overlay component (or an extension of
  `DimensionLines.vue`'s pattern) for the dashed guide lines, reusing the existing
  screen-space SVG overlay technique from `render-001`/`ui-011` rather than a new
  rendering approach.
- `docs/primitive-placement.md` (new section)
- `e2e/snap-placement.e2e.js` (new) or an extension of `e2e/primitive-placement.e2e.js`

## Proposed fix

Reuse `group.js`'s existing `calcSnap(moving, reference, axes, orientation, deltaMm)` —
already built and tested in `core-001` — against the ghost's probe geometry (evaluated
via `evaluateOp`, the same way `library.js`'s existing `restingCenter` evaluates a probe
for the ground-plane case) and the nearest existing body's already-evaluated geometry.
This sidesteps `core-001`'s flagged limitation that a *recipe* can't call `group.snap`
against geometry it didn't itself create — that limitation is about composite recipes
expanding before evaluation; this call happens at drag time against real bodies already
in the document, a different layer entirely.

Nearest-item selection: distance from the ghost's current projected point to each
existing body's centroid (`centroidOf`), matching §7a's "closest item wins" wording
literally — pick screen-space or world-space distance and say which, rather than
leaving the choice implicit. Tolerance radius: one named constant (e.g.
`SNAP_TOLERANCE_MM`), scaled by the current `mmPerPixel` the way `ui-017`'s gizmo sizing
already scales by zoom, so "close enough" reads the same at any zoom level rather than
becoming stricter when zoomed in.

## Effort

L (multi-session / needs design discussion) — real cross-layer wiring (kernel geometry
math + pick/projection + a new overlay component + drag-state changes in
`Viewport.vue`), the same shape `ui-010`/`ui-011` were scoped at.

## Testing

Vitest unit tests for the new pure geometry helpers in `src/core/library.js`/
`src/render/pick.js` (nearest-body lookup, snap-tolerance check), with degenerate
cases: zero existing bodies (no snap), the ghost farther than tolerance from every body
(no snap), exactly at the tolerance boundary.

**A real `e2e/snap-placement.e2e.js` navigating to `/`** is required per `CLAUDE.md`'s
Interaction Model gate, driving an actual two-item drag-and-snap — not only a
`.spec.js`. Runs at **all three reference viewports** (phone/tablet/laptop) since this
is a drag/touch-input interaction (`CLAUDE.md`'s Responsive Layout rule), and against
**all three engines** (Chromium/Firefox/WebKit) since it's a canvas/pointer-drag/WebGL-
adjacent path (`CLAUDE.md`'s Browser Support rule) — stated explicitly rather than
defaulting to Chromium-only.

**Acceptance scenarios this task must re-drive**: **scenario 3** (Snap-placement of a
kit assembly) — drive it with whichever composite parts exist at implementation time
per the sequencing note in Goal above, and update `TODO/ACCEPTANCE.md`'s scenario 3
"Last run" line (currently "not yet driveable; `ui-013` doesn't exist yet"). Also
re-check **scenario 1** (two independent primitives both remain visible) since this
touches the same drop-commit path `ui-010` built, to confirm a snap-assisted drop
doesn't regress the first item's visibility.

No closed finding's subsystem is extended here beyond scenario 1's own standing
regression-surface status.
