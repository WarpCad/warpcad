---
title: Dimension lines follow the body's own rotated frame, not the world-axis shadow
category: ui
kind: finding
priority: high
model: opus
milestone: M1.5
depends: [ui-012, ui-017]
status: done
---

> **Retirement note (2026-09-06).** Shipped as proposed, steps 1-4, plus two things the
> file did not anticipate.
>
> **The labelling decision (step 4's open question): local-axis labelling.** The three
> dimension lines are named and coloured by the **body's own** X/Y/Z, not the world's.
> Reasoning: the number is now the part's own extent, so tying its label to a grid axis
> would re-introduce the exact mismatch this finding is about — a tipped-over cylinder's
> "length" would change which letter and which colour it wears depending on how it
> happens to be lying, even though it is the same 50 mm edge of the same part. Local
> labelling keeps one number attached to one feature of the part however it is turned or
> the camera orbited, which is what every CAD tool does and what makes the number
> actionable. The letters and colours stay the same three, so nothing about the overlay's
> appearance changes for the unrotated case; `DimensionLines.vue` carries the rationale.
> The transform **gizmo** deliberately stays a world-axis (global-mode) gizmo, per this
> file's own note — a global gizmo alongside local dimensions is the ordinary CAD pairing,
> not an inconsistency. Each line's SVG group carries `data-frame="world" | "local"` so
> the distinction is assertable rather than implied.
>
> **Beyond the proposal.** (1) The Inspector's **Size X/Y/Z** row now reads the same local
> measurement. It was not in Affected files, but leaving it on the world box would have
> had the panel and the overlay quoting a rotated part at two different sizes — the
> two-half-owners trap, and `docs/selection-and-inspector.md` already promised these were
> "the same three numbers the dimension lines are showing". (2) The Step 6 acceptance
> drive found a **pre-existing** defect upstream of this fix: `rotationDeg` is carried as a
> *sum* of deltas while the geometry is their *composition*, so an out-of-order history
> (turn about Y, then about X) un-turns by the wrong rotation and the numbers drift again
> — measured at 46.82/51.05/59.42 instead of 40/40/50. Single-axis and in-order X→Y→Z
> histories are exact. Filed as `TODO/core-004` with the measured reproduction, pinned by
> a unit test in `src/core/inspector.spec.js`, and recorded against scenario 2 in
> `TODO/ACCEPTANCE.md`. Not fixed here: composing properly means choosing between an Euler
> re-decomposition (which can make the Inspector's fields jump near gimbal lock) and
> carrying a quaternion (a document-schema change), and that is a real design call rather
> than a mechanical one.


## Problem

`src/core/inspector.js:235-253` (`describeBody`) measures `boundsMm`/`sizeMm` by calling
`boundsOf(body.geometry)` (`src/core/kernel/group.js:124`, which calls `@jscad/modeling`'s
`measurements.measureBoundingBox`) on the **terminal, already-rotated** solid. That
returns the solid's **world-axis-aligned** bounding box — its shadow on the main grid —
not a box aligned to the object's own local axes.

For an unrotated body this happens to be the object's real size, so it has looked
correct through `ui-011`/`ui-012`/`ui-017`. It stops being correct the moment
`transform.rotate` (added in `ui-012`) is actually used: rotate a cylinder 30° about X
and the three dimension lines `src/render/annotate.js`'s `updateDimensionAnnotation`
draws no longer read off the cylinder's radius and length — they read off the
axis-aligned box the tilted cylinder happens to fit inside, which is larger on every
axis than the part actually is and carries no readable "diameter" or "length" figure at
all. This is a real information loss, not a cosmetic one: dimension lines exist
specifically so a user can read an object's size without opening the Inspector
(`CLAUDE.md`'s grid/dimension rules), and a rotated object's box actively misleads
rather than just failing to help.

The gizmo itself is unaffected — `updateGizmoAnnotation` (`src/render/annotate.js:357-421`)
already draws its translate arms and rotate rings along fixed world X/Y/Z regardless of
the body's rotation, which is an ordinary "global mode" CAD convention and not part of
this finding. Only the **measurement/dimension-line** half is wrong.

## Affected files

- `src/core/kernel/group.js:124-130` (`boundsOf`) or `src/core/inspector.js:235-253`
  (`describeBody`) — needs a companion that measures the body in its own local,
  unrotated frame.
- `src/core/inspector.js:57-61, 246-252` (`BodyDescription.boundsMm`/`sizeMm` typedef and
  construction) — needs to also carry (or be replaceable by) local-frame extents plus the
  rotation already exposed via `rotationOf()` at line 209.
- `src/render/annotate.js:657-814` (`updateDimensionAnnotation` and its `corner()`
  helper at line 648) — the "outermost edge" selection logic currently walks the four
  world-axis-parallel edges of an AABB; it needs to walk the edges of an **oriented** box
  instead once rotation is nonzero.
- `src/components/viewport/Viewport.vue:297` (`syncAnnotations()`'s `body.boundsMm`
  destructure) — the call site that would switch to whatever new shape the fix produces.
- `src/render/annotate.spec.js`, `src/core/inspector.spec.js` — existing coverage that
  currently only exercises axis-aligned bounds.

## Proposed fix

Carry the body's **local half-extents** the same way `rotationDeg` is already carried
rather than re-derived (`inspector.js:193-201`'s own comment explains why: "a rotated
solid's polygons carry no memory of the angle that produced them"). Concretely:

1. Add a local-frame measurement, e.g. `localBoundsOf(geometry, rotationDeg, centerMm)`
   in `group.js` or `inspector.js`, that measures the terminal geometry after applying
   the **inverse** of the body's current `rotationDeg` about the body's own centre (not
   the world origin — translation must not skew the result). This avoids needing to
   replay history back to before the `transform.rotate` record, at the cost of needing
   to exactly match whatever rotation convention `src/core/transform.js`'s
   `transform.rotate` op applies (axis order, degrees-to-radians direction) — get this
   from that file directly rather than re-deriving it, and unit-test the round trip
   (rotate a known box, measure local bounds, confirm it matches the box's un-rotated
   size within tolerance).
2. `describeBody` exposes both: keep `boundsMm`/`sizeMm` as the world AABB (still useful
   for camera framing / hit-testing elsewhere, if anything relies on it — check before
   removing), and add the local half-extents alongside `rotationDeg` and `positionMm`.
3. `updateDimensionAnnotation` gets an oriented variant: instead of `corner()` picking
   world-axis min/max, compute each of the three **local** axis directions in world
   space (rotate world X/Y/Z by `rotationDeg` — reuse or mirror `screenDirection`'s
   rotation math), then build the box's 8 corners as
   `positionMm ± localHalfExtent_x * axisDirX ± localHalfExtent_y * axisDirY ± localHalfExtent_z * axisDirZ`.
   The existing "furthest-from-centre edge wins" selection logic (`annotate.js:659-671`)
   carries over unchanged once corners come from this oriented set instead of the
   axis-aligned one.
4. **Open design question, flag for whoever implements**: the three dimension lines are
   currently labelled/coloured by world axis (`AXIS_LABELS`, `AXIS_STROKE` in
   `Gizmo.vue`/`DimensionLines.vue`). Once dimensions follow the body's local frame,
   decide whether the labels/colours should follow the *local* axis instead (the
   convention most CAD tools use — a rotated part's "length" stays labelled consistently
   regardless of orbit) or stay tied to world axis colour for visual consistency with the
   gizmo. Recommend local-axis labelling, since that is what makes the number meaningful
   again, but this is a real UX call, not a mechanical one — don't silently pick without
   noting it in the retirement note.

## Effort

L (multi-session / needs design discussion) — real geometry/numerics work (inverse
rotation must exactly match `transform.js`'s convention, oriented-box corner math is new,
not a copy of existing axis-aligned code) plus the open labelling question above.

## Testing

`src/render/annotate.spec.js`: extend `updateDimensionAnnotation` coverage with a body
rotated on one, then multiple axes — assert the reported `lengthMm` per dimension line
matches the object's known local size (e.g. a cylinder's radius-derived width and its
height) within `toBeCloseTo` tolerance, not the larger axis-aligned shadow. Cover the
degenerate cases already named in `CLAUDE.md`'s numerical-code convention: a 45°
rotation that makes two local axes project to the same screen direction, and a rotation
that puts one local axis dead-on to the camera (no screen direction at all).

`src/core/inspector.spec.js`: assert the new local-bounds measurement is invariant under
translation (moving a rotated body must not change its reported size) and correctly
inverts a known `transform.rotate` record.

**Real app e2e**: extend `e2e/gizmo-transform.e2e.js` (navigates to `/`) — place a
cylinder, rotate it 90° about a horizontal axis via the gizmo's rotate ring, and assert
the rendered dimension-line labels still read the cylinder's actual diameter and length
(fixed known values from the drop), not the larger axis-aligned box. Chromium is enough
for the numeric assertion; also spot-check WebKit once, since dimension-line projection
shares `annotate.js`'s `worldToScreen` with the gizmo, which is already a
WebGL/canvas-adjacent path per `CLAUDE.md`'s Browser Support section.

**`TODO/ACCEPTANCE.md` scenarios this could affect**: scenario 1 (its "gizmo and
dimension lines attach" half) and scenario 2 (its gizmo-drag/dimension-tracking half) —
re-drive both after this lands, specifically checking a *rotated* body's dimension
numbers, since neither scenario's prior drives ever rotated the selected body before
reading its dimensions. No closed finding exists yet against this subsystem to re-check.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
