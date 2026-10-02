---
title: A real straight bevel gear (pitch cone, Tredgold teeth) to replace V1's faked 45° "bevel"
category: core
kind: feature
priority: high
model: opus
milestone: M11
depends: [core-041]
status: open
---

## Goal

The user asked for "any missing gear coverage like bevel gears". `drive-wheel` is the
evidence of the gap: its `Bevel()` is `poly2solid(shape.enlarge(-t.a*2, -t.a*2), shape, t.b)`
over a hard-wired 45° triangle (`solve90SA({ A: 45, b: 15 })`). `jscad-utils`' `enlarge`
is a per-axis *scale* (`1 + value/size`), so this is a uniform scale of the same spur tooth
outline — the right idea. What is missing: the cone angle is fixed at 45° whatever the
tooth ratio, and because the scale is taken from the bounding box (tip Ø 53.1 → 23.1 mm,
×0.435) the **pitch** cone actually tapers ≈ 43°, not 45°, so apexes never meet; the
tooth shape is the plain 32-tooth spur profile rather than the back-cone virtual gear's;
and the pitch cone is never defined, so four of them only sit together because
`snap(..., -addendum)` was nudged by hand. "Done": `gear.bevel` builds a
straight bevel gear from teeth, module, shaft angle and its mating tooth count, with a real
pitch cone, and the result is watertight and meshes with its partner (`core-046`).

## Design

- **Geometry (Tredgold's approximation)**: a bevel gear's tooth cross-section at distance
  `s` from the cone apex is the spur profile of its **back-cone virtual gear**
  (`z' = z / cos δ`, module unchanged) *scaled by `s / s_back`*. So the solid is a loft of
  the same `involuteProfile` outline at ≥ 2 scales along the cone, not an offset. Build it
  with the existing loft path (`extrudeFromSlices` / `loftRings` in `src/sketch/resample.js`
  — it already handles equal-vertex-count slices; here the count is constant by
  construction, which makes this the *easy* loft case).
- **Pitch cone angle**: for shaft angle Σ and teeth `z₁` (this) / `z₂` (mate):
  `tan δ₁ = sin Σ / (z₂/z₁ + cos Σ)`; Σ = 90° gives `δ₁ = atan(z₁/z₂)`, and equal tooth
  counts at 90° give the 45° **miter** gear `drive-wheel` was approximating. Put the formula
  in `src/core/gear/bevel.js`; `core-046` uses the same function for the mate.
- **Params**: `teeth`, `module` (at the large end), `pressureAngleDeg`, `mateTeeth`,
  `shaftAngleDeg` (default 90), `faceWidthMm` (cap at `coneDistance/3` — the standard
  rule — with a warning, not a refusal, above it), `boreMm`, `clearanceMm`, `backlashMm`,
  `hubLengthMm` (optional boss behind the back cone, so a printed gear has something to
  hold a bore). Same V1 alias table as `core-041`.
- **Axis convention**: axis = local Z, **apex at the origin side** (+Z toward the large
  end, apex at `z = 0`) — chosen so two bevels meet by making their apexes coincide, which
  is exactly the placement rule `core-046` needs. State it in the module doc; tests assert it.
- **Named parts**: `gear`, `bore`, `apex` (a point-sized reference part at the cone apex),
  `pitchCone`.
- Out of scope, noted for later: spiral/Zerol bevel, hypoid, crown gears and face gears
  (a crown gear is the `δ = 90°` limit — keep the formula from dividing by zero there and
  say so).

## Interaction model

n/a — core only. Library row and Inspector are `ui-057`; the pair placement is `core-046`.

## Documentation

n/a — no user-visible control in this task.

## Affected files

- `src/core/gear/bevel.js` + spec, `src/core/kernel/recipes/gear.bevel.js` + spec,
  `src/core/kernel/registry.js`, `src/core/library.js`.

## Effort

L.

## Testing

- **Numerics**: `δ` for 90° shafts at z₁/z₂ = 1 (45°), 1/2 (26.565°), 2 and 1/∞ → 0; for
  Σ = 60° and 120°; cone distance `= pitchRadius / sin δ`; the base slice's pitch radius
  equals `m·z/2` — all with `toBeCloseTo`.
- **Geometry**: tooth *size* at the small end ≈ `s_small/s_large ×` the large end (V1's
  scale-based loft satisfies this too, so it is a regression guard, not a fix — assert it
  with a section at 50 % depth); the pitch cone half-angle equals δ within 0.01° (V1's is
  ≈ 43° where 45° is wanted — assert the *new* value, not V1's); the
  cone surface passes through the apex within 1e-6 mm; watertight for 8…80 teeth and for
  δ near 0° and 89°.
- **Parity as a sanity bound, not a match**: V1's `drive-wheel` bevel (32T, `cp π·50/32`,
  15 mm tall, miter) must produce a body whose bounds are within 5 % of the new
  `gear.bevel` 32T/32T miter with `faceWidth` set to give the same height — they are
  *different shapes*, so say so in the spec and don't assert equality.
- **Degenerate**: `mateTeeth` = `teeth`; `Σ` = 0° and 180° (rejected); `faceWidth` > cone
  distance (named error); 2 teeth.
- **Re-run**: scenarios 1, 3, 10, and `core-041`'s watertight specs. Chromium only here;
  all three engines when `ui-057` lands.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
