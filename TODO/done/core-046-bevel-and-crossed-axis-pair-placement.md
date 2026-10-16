---
title: Bevel-pair and crossed-axis placement — apex-coincident bevels and the drive-wheel four-gear train
category: core
kind: feature
priority: medium
model: opus
milestone: M11
depends: [core-044, core-045]
status: done
---

> **What shipped (2026-10-16).** `mesh.js` gained `bevelCompatibility`, `bevelMeshPlacement` (phase `phi2 = 180 - (1/2 - u1) * 360 / z2` degrees, independent of Sigma; `bevel.js` unchanged) and crossed-axis helical frame math (same hand only, `Sigma = beta1 + beta2`). `gear.bevelPair` is registered (no `ui` until `ui-057`), takes per-gear bore/hub params, and exposes `drive` and `pinion` only. Interference proof measured 0 mm^3 at 12 angles for 16T/32T at 90 and 60 degrees and 24T/32T at 120 degrees (16T/32T at 120 degrees is a crown gear, refused by name); half-tooth controls overlap. The `drive-wheel` four-gear train is a fixture built from two pairs and one 180 degree turn, no fudge offsets. Details in `docs/decisions/gears.md`'s `core-046` addendum. Open: surface a hidden `apex` part for `ui-058`?

## Goal

`core-044` meshes gears on parallel axes. Two other mate types appear in the user's
projects and neither has a clean answer in V1: **bevel pairs** (`drive-wheel`'s four-gear
right-angle train, placed with `rotateY(±90/180)` plus `snap(..., ±addendum)` fudge) and,
for `core-047`, **crossed-axis** pairs. "Done": `mesh.js` handles all three mate types,
`gear.bevelPair` builds a meshed right-angle pair, and `drive-wheel`'s four-bevel arrangement
can be reproduced from a document without a single hand-tuned offset.

## Design

- **Bevel mate frame**: both apexes coincide at a point `P`; the two axes make angle Σ
  (default 90°). Given gear A's frame, B's frame is "rotate A's axis by Σ about the
  shared perpendicular, put B's apex at A's apex". The **phase** rule (half-tooth) is the same
  idea as `core-044` but measured on the back-cone virtual gears; derive it, don't copy it.
- `bevelCompatibility(a, b)`: same module at the large end, same pressure angle, `Σ` matches
  the pair's design `Σ`, **cone angles sum correctly** (`δ₁ + δ₂ = Σ`), same cone distance
  within tolerance, hand for spiral (v2). Each failure a code + message like `core-044`.
- **`gear.bevelPair`** recipe: `{ driveTeeth, pinionTeeth, module, shaftAngleDeg, … }` →
  two `gear.bevel` records, rotation of the second, shared apex at the origin (with a
  trailing translate from the library as usual). Parts `drive`, `pinion`.
- **Four-gear train** (the `drive-wheel` case, a 3-gear differential-style cluster): not a
  recipe — a *document* that a user builds from pairs. Ship it as a worked example in the docs
  (`docs-021`) and as the fixture for this task's integration test, to prove the pair
  operation composes rather than needing a special recipe.
- Crossed-axis (non-intersecting, non-parallel) helical pairs: only the **frame math**
  (`centerDistance`, shaft angle, matching hand) lands here, for `core-047`'s worm; a
  generic skew-gear Library row is not in scope.

## Interaction model

n/a — core only. The user reaches this through `ui-058` (Mesh) and `ui-057` (Library rows).

## Documentation

n/a — no user-visible control in this task.

## Affected files

- `src/core/gear/mesh.js` (extend) + spec, `src/core/gear/bevel.js` (phase),
  `src/core/kernel/recipes/gear.bevelPair.js` + spec, `src/core/kernel/registry.js`,
  `src/core/library.js`.

## Effort

M.

## Testing

- **Interference proof** as in `core-044`: a 16T/32T 90° pair meshed by `gear.bevelPair`,
  boolean-intersect volume ≈ 0 within backlash at 12 rotation angles; negative control with
  the phase off by half a tooth gives clearly non-zero volume. Repeat at Σ = 60° and 120°.
- **Apex test**: both `apex` parts coincide within 1e-6 mm after placement; the cone angles
  sum to Σ within 1e-9.
- **Integration fixture**: `drive-wheel`'s base / drive / antidrive / top arrangement built
  from `gear.bevelPair`s has no pair with non-zero intersection volume, and the four apexes
  meet at the expected point(s). This is the "V1 needed fudge, this doesn't" proof.
- **Degenerate**: Σ = 90° with δ₁ ≥ 90° (z₁ ≫ z₂, a crown limit) handled by a named
  error; mismatched cone distances; equal teeth.
- **Re-run**: `core-044` and `core-045` specs; scenarios 1, 3, 10. Chromium only.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
