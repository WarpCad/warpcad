---
title: A sketch's Linear extrude with a Twist and the default one twist step folds the solid instead of twisting it
category: core
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-14 from the testing-019 drive of core-042 #1
depends: []
status: done
---

> **What shipped (2026-11-15).** A sketch's Linear twist now goes through the gear path's `twistedExtrude`. Twist steps left
> at 1 (the default, which a stored document cannot tell from a typed 1) means "automatic": the resolution's step count,
> raised so no step turns more than 3° (`SKETCH_TWIST_STEP_DEG`). The resolution's chord tolerance alone gave 11 steps at
> Normal and still lost 6%, because the loss comes from the flat side faces, not the vertex chord. A count above 1 is checked
> against `minTwistSteps`, so 2 for a 90° twist is refused with the minimum named. The 30 × 16 × 30 mm sketch at Twist 90
> now reads 14 091 mm³ (2.1% under). The Inspector's Sketch section was not touched (`Inspector.vue` held another session's
> uncommitted edits); the Extrude panel carries the Twist steps note, and the Inspector has no Twist steps field to explain,
> so nothing there needed it. A long thin profile still loses more: filed as `core-084`.

## Problem

`FIND-testing-019` drove `TODO/VERIFY.md` `core-042` #1 on a production build (Chromium, 1440x900). A Sketch with a 30 × 16 mm
rectangle, **Linear**, Height 30, Twist 0 reads **14 400 mm³** exactly. Setting **Twist** to 90 (in the Extrude panel or the
Inspector's Sketch section) with **Twist steps** left at its default of 1 reads **3 820 mm³**, 27% of the true volume. The mesh is
**not inside-out** (positive volume; solid, outward-lit faces from Top, Front, Right and Bottom), and the readout is right for the mesh
drawn. The mesh is a single-slab fold: the top face is turned 90° and the side faces are twisted quads, so it is a bow-tie, not a
twisted prism.

Measured volume by **Twist steps** at Twist 90, 30 × 16 × 30 mm:

| Twist steps | Volume (mm³) | Bounds X × Y at the base (mm) |
|---|---|---|
| 1 (default) | 3 820.0 | 30.0 × 30.0 |
| 2 | 8 907.0 | 32.5 × 32.5 |
| 4 | 11 822.7 | 33.8 × 33.8 |
| 12 | 13 604.5 | 34.0 × 34.0 |
| 30 | 14 090.9 | 34.0 × 34.0 |

Cause: `src/core/kernel/registry.js` (the `primitive.sketch` Linear branch, near line 771) hands `twistSteps` (default 1,
`SKETCH_EXTRUSION_DEFAULTS`) straight to `extrudeLinear`. The gear path, `twistedExtrude`, derives steps from the design's
resolution (`twistStepsFor`) and refuses an explicit count below the floor (`minTwistSteps`), as its own comment says, so "a record valid at preview is
valid at export". The sketch path skips both, and the Inspector's Sketch section exposes **Twist** with no **Twist steps** field.

## Affected files

- `src/core/kernel/registry.js` (the sketch Linear branch)
- `src/core/kernel/tessellation.js` (`twistStepsFor`, `minTwistSteps`)
- `src/components/sketch/` (the Extrude panel's Twist steps field) and the Inspector's Sketch section
- `docs/sketch-mode.md` (the Linear row and the Twist steps text)

## Proposed fix

1. Make a sketch's Linear twist take its steps from `twistStepsFor` when `twistSteps` is left at the default (an explicit value is
   still checked against `minTwistSteps`), the way `twistedExtrude` does.
2. Say in the Extrude panel and `docs/sketch-mode.md` what **Twist steps** does, and that a coarse count folds the solid.
3. A unit spec: a 30 × 16 mm rectangle, 30 mm, Twist 90 is within 3% of 14 400 mm³ at the default.

## Effort

S.

## Testing

- Unit spec above, with `toBeCloseTo`-style tolerances, plus Twist 0, a negative twist and a 360° twist.
- Re-run `FIND-testing-019`'s `core-042` #1 reproduction (the 30 × 16 mm sketch above) against the new code.
- Engines: Chromium and WebKit (kernel and viewport). Acceptance scenario 9 (Sketch primitive) re-driven.

## Interaction model

Precondition: a Sketch body selected, or the Sketch editor open. Trigger: the **Twist** field. Feedback: the Inspector's volume
reads about 14 400 mm³ and the viewport shows a twisted prism.

## Documentation

- **Page**: `docs/sketch-mode.md`, the Linear row and the Twist steps text.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
