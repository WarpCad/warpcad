---
title: Rotate rings show directional arrows, so they read as "drag to rotate" and not decoration
category: ui
kind: finding
priority: medium
model: sonnet
milestone: M1.5
depends: [ui-017]
status: done
---

> **Shipped as proposed**, with one deviation worth noting: the new arrowhead markers'
> `data-testid`s are `gizmo-rotate-arrow-<axis>-<index>`, not `gizmo-ring-arrow-*` as a
> literal reading of "arrowhead markers alongside" might suggest. The `gizmo-ring-arrow-*`
> form collides with `selection-inspector.e2e.js`'s pre-existing
> `[data-testid^="gizmo-ring-"]` selector (which asserts exactly the 3 ring polygons) —
> caught by the full-suite run in Step 5, which turned 9 tests red across the engine
> matrix before the rename.

## Problem

`Gizmo.vue`'s rotate rings (`.tgizmo__ring`, drawn from `ringPoints()` in
`src/render/annotate.js:467-475`) are plain closed polylines — a thin coloured circle
per axis, with no visual cue that they are draggable rotation handles rather than a
selection halo or decorative reference circle. `ui-017` already fixed their size (they
now clear the selected body's silhouette); the remaining gap is legibility of *intent*:
nothing about a bare ring says "drag along me to spin the object," the way an arrowhead
on the translate arms already says "drag along me to move it."

## Affected files

- `src/render/annotate.js:206-248, 357-421` — `GizmoRing` typedef and
  `updateGizmoAnnotation`'s per-ring computation (`ux/uy/vx/vy`, the ring's two
  conjugate screen-space semi-diameters).
- `src/render/annotate.js:436-475` — `ringPoints()`/`createRingPoints()`, the sampled
  polyline this task adds arrowhead markers alongside.
- `src/components/viewport/Gizmo.vue:189-233` — the template that draws
  `.tgizmo__ring`; needs new markup for the direction arrowheads.
- `src/render/annotate.spec.js` — new coverage for the arrowhead sample points.

## Proposed fix

Add one or two small chevron/arrowhead markers per ring, drawn tangent to the ring at a
couple of its sampled points (`RING_SEGMENTS = 28` already gives evenly spaced points to
pick from in `ringPoints()`'s output). The tangent direction at sample `i` is the
derivative of `origin + u·cos(t) + v·sin(t)`, i.e. `-u·sin(t) + v·cos(t)` — cheap to
compute from the same `ring.ux/uy/vx/vy` the ring itself already carries, no new
projection needed. Write a small `ringArrowheads(ring, originX, originY, out)` helper in
`annotate.js` (mirroring `writeArrowhead()`'s three-point convention at line 827,
already used for the dimension lines) that returns two arrowhead triangles — one at
roughly a quarter turn, one at three-quarters — each pointing along the ring's local
tangent so together they read as "this circle spins," not just "this circle has two
marks on it." Keep them small relative to `ringPx` so they don't compete with the
translate arms' own arrowheads for visual weight.

## Interaction model

This changes only the rotate ring's *rendering*, not its behaviour — stated explicitly
per `CLAUDE.md` rather than omitted.

- **Precondition**: unchanged — exactly one item (or, once it lands, one group) selected,
  same as `docs/decisions/interaction-model-qa.md` control 4.
- **Trigger**: unchanged — pointer-drag on a rotate ring's existing hit target
  (`.tgizmo__grab--ring` in `Gizmo.vue`); this task adds no new control, only a visual
  affordance on the existing one.
- **Feedback**: the ring now visibly carries directional arrowheads at rest, before any
  drag begins — the new part of the feedback contract; the drag-in-progress behaviour
  (live numeric-field sync) is unchanged from `ui-012`.
- **Placement / Selection response / Selection count**: n/a — unchanged from control 4.
- **Small-screen behaviour**: same as desktop; the arrowheads scale with `ringPx`
  exactly as the ring itself already does per `ui-017`, so they stay legible at phone
  width without a separate touch-target change (the ring's hit-test stroke width is
  untouched).

## Documentation

- **Page**: update `docs/selection-and-inspector.md`'s gizmo section to mention the
  rotate rings now carry small arrow markers indicating drag direction.
- **Example**: "Select an object — the rotate rings around it now show small arrow
  markers along their circumference, indicating you can drag along the ring to spin the
  object about that axis."

## Effort

S (< 1hr) — one new pure function plus a template addition; no new interaction logic.

## Testing

`src/render/annotate.spec.js`: assert the new arrowhead helper's points sit on (or very
near) the ring's own circle and that their implied direction is tangent to it at that
point, with an explicit tolerance.

**Real app e2e**: extend `e2e/gizmo-transform.e2e.js` (navigates to `/`) — select a body
and assert the new arrowhead elements (`data-testid`) render alongside each visible
ring. Chromium only: this is SVG geometry, not a WebGL/canvas-sensitive path (the ring
positions it decorates are already covered by `ui-011`/`ui-012`/`ui-017`'s specs).

**`TODO/ACCEPTANCE.md` scenarios this could affect**: none directly — this is a visual
affordance addition on an already-passing control (scenario 2's gizmo-drag half). Worth
a glance during that scenario's next re-drive, not a dedicated re-drive of its own. No
closed finding exists yet against this subsystem.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
