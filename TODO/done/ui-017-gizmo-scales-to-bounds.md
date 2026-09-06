---
title: Transform gizmo scales to the selection's bounding box, instead of a fixed pixel size
category: ui
kind: feature
priority: high
model: sonnet
milestone: M1
depends: [ui-012]
status: open
---

## Goal

Today the gizmo's translate arms and rotate rings are drawn at a fixed screen size —
`GIZMO_ARM_PX = 58` and `GIZMO_RING_PX = 40` (`src/components/viewport/Viewport.vue:79-81`)
— regardless of how large the selected body is on screen. For anything bigger than a
small primitive at the default zoom, the rings sit *inside* or barely clear of the
object's own silhouette, which is exactly the "very small" complaint: a 40px ring is
hard to see and hard to grab against a body that itself renders far wider than 40px.

**Done when**: the gizmo's arm length and ring radius are computed per frame from the
selected body's actual on-screen bounding box (`body.boundsMm`, already sampled at
`Viewport.vue:300` for the dimension lines and converted via `orbit.getMmPerPixel`, the
same conversion `DimensionLines` already uses) rather than the two fixed constants —
so the rings and arms always extend clear of the rendered object, growing and shrinking
with it as the user zooms, with a floor so a tiny object still gets a comfortably
grabbable gizmo rather than shrinking to nothing.

## Interaction model

This resizes an existing control (`docs/decisions/interaction-model-qa.md` control 4);
it changes no precondition, trigger, or feedback semantics, only the control's visual
and hit-test scale — stated explicitly per `CLAUDE.md`, not omitted.

- **Precondition**: unchanged — exactly one item or group selected (same as control 4).
- **Trigger**: unchanged — pointer-drag on a handle, or a numeric-field edit.
- **Feedback**: unchanged, except the rendered arms/rings are now sized to visibly
  clear the selected body's silhouette instead of a constant 58px/40px.
- **Placement / Selection response**: n/a — not a creation or selection-display change.
- **Selection count**: unchanged from control 4.
- **Small-screen behavior**: `ui-012`'s invisible hit-test radius (fatter than the
  rendered handle, for finger contact area — see that task's Q16 note and
  `Gizmo.vue`'s own header comment) must keep scaling the same way the visible handle
  now does. Don't let the visible ring grow with the object while the invisible grab
  target stays pinned to the old fixed size — that would visually promise a bigger
  target than is actually clickable/tappable.

## Documentation

- **Page**: update `docs/selection-and-inspector.md`'s gizmo section (from `ui-011`)
  to note the gizmo's size follows the selected object, rather than a fixed size.
- **Example**: "Select a small bolt and a large case shell in turn — the gizmo's arms
  and rotate rings resize each time, always extending a short distance past whichever
  object's outline, rather than staying a fixed size that disappears inside a large
  object or dwarfs a small one."

## Affected files

- `src/components/viewport/Viewport.vue:79-81, 289-299` (edit — replace the two fixed
  constants with a per-frame size derived from `body.boundsMm` at `syncAnnotations()`)
- `src/render/annotate.js` (edit — `updateGizmoAnnotation`'s `armPx`/`ringPx` params
  stay as params; only the caller's computation of what to pass changes, likely via a
  small new helper here so the math has a unit test home consistent with this module's
  existing framework-free math)
- `src/render/annotate.spec.js` (edit — numeric-tolerance test for the new sizing
  helper)
- `src/components/viewport/Gizmo.vue` (edit only if the invisible hit-test margin is
  hardcoded there rather than derived from `armPx`/`ringPx` — check before assuming a
  change is needed)
- `e2e/gizmo-transform.e2e.js` (edit)
- `docs/selection-and-inspector.md` (edit)

## Proposed fix

Add a framework-free helper in `src/render/annotate.js` — e.g.
`gizmoSizeForBounds(minMm, maxMm, mmPerPixel)` — that takes the selected body's
`boundsMm` (the same `[minMm, maxMm]` pair `syncAnnotations()` already destructures for
the dimension lines at `Viewport.vue:300`), computes the body's screen-space half-diagonal
via `mmPerPixel`, and returns `{ armPx, ringPx }` as that half-diagonal plus a fixed
clearance margin (roughly today's constants, so a small object's gizmo doesn't shrink
below what `ui-012` already tuned as comfortably grabbable — treat the current 58/40 as
a floor, not a value to discard). Cap the growth at some reasonable maximum so an
enormous body doesn't produce a gizmo that runs off screen. Call this helper from
`syncAnnotations()` in place of the two constants, passing its result into the existing
`updateGizmoAnnotation(...)` call. `Gizmo.vue`'s invisible `tgizmo__grab` hit targets
already derive their geometry from the same `ring`/`arrow` points `updateGizmoAnnotation`
writes (per the file's own header comment on hit-test radius) — confirm they scale
automatically once the input `armPx`/`ringPx` do, rather than assuming it.

## Effort

S (< 1hr) — one new pure function plus swapping two call sites; no new architecture.

## Testing

`src/render/annotate.spec.js`: assert `gizmoSizeForBounds` grows with a larger
`boundsMm` span and shrinks (down to the floor, not below it) with a smaller one, at a
few `mmPerPixel` values, with an explicit tolerance (`toBeCloseTo`). Cover the
degenerate case of a zero-size bounding box (a body with no extent on one axis)
producing the floor size, not `NaN` or zero.

Extend `e2e/gizmo-transform.e2e.js`, navigating to `/`: place a large primitive (e.g. a
100mm cube) and a small one, select each in turn, and assert the rendered gizmo's arm
endpoints/ring radii differ between the two selections and both sit outside the
selected body's own projected bounding box — not just that the gizmo is visible at all.

Runs at all three reference viewports (this changes the same touch-target sizing
`ui-012`'s Q16 already required all-three-viewport coverage for). Runs against all
three engines (gizmo geometry and mesh-projection math are WebGL-sensitive, same as
`ui-012`'s own spec).

**`TODO/ACCEPTANCE.md` scenarios this could plausibly affect**: scenario 2 (gizmo drag)
— re-drive the gizmo-drag steps to confirm dragging the now-larger handles still moves
the correct body and doesn't accidentally grab a neighboring body's overlapping gizmo.
Scenario 1's "gizmo attaches" half is a visibility check, not a size check, but worth a
quick glance during the re-drive since it's the same overlay code path. No closed
finding exists yet against the gizmo/annotation subsystem to re-check.
