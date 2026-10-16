---
title: Involute spur-gear profile generator in src/core/gear/ with V1 parity fixtures
category: core
kind: feature
priority: high
model: opus
milestone: M11
depends: [core-039]
status: done
---

> **What shipped (2026-10-16).** `involuteProfile` and `gearDimensions` landed as specified, with
> the decision-doc vocabulary: the size parameter is `moduleMm` (not `module`), `backlashMm` is
> total pair play (tooth thinned by half of it), and `clearanceMm` defaults to `0.25 * module`.
> Undercut is modelled (trochoid), with `warnings: ['undercut']`; a vanished tooth throws
> `GearToothVanishedError`. Fixtures cover all six reference gears (`bf-gear` 30T and 8T
> included) at default and converged V1 densities. V1 truly cuts at `atan(sin α)`, and the 8T
> printed shape is outside the default band; both are recorded in the addendum to
> `docs/decisions/gears.md`.

## Goal

A framework-free function that turns gear parameters into a closed 2D tooth outline, good
enough that the gears already printed from `window-motor`, `drive-wheel` and `bf-gear` are
reproduced within a stated tolerance. "Done": `involuteProfile(params)` returns the outline
of an external spur gear (mm, centred on the origin, tooth 0 on +X) and a derived-values
record, matches V1 on the three reference gears, and is fast enough to rebuild on every
parameter edit.

## Design

- `src/core/gear/involute.js` — **pure**, no Vue/DOM/three.js, no `@jscad/modeling` import
  (it returns points; the kernel adapter turns them into a `geom2`, per `CLAUDE.md`).
  `involuteProfile({ teeth, module, pressureAngleDeg, profileShift, clearanceMm, backlashMm,
  pointsPerFlank })` → `{ outline: Vec2Mm[], pitchRadiusMm, baseRadiusMm, tipRadiusMm,
  rootRadiusMm, toothAngleDeg }`.
- Derived values come from one function, `gearDimensions(params)`, that the Inspector
  (`ui-057`) and the mesh math (`core-044`) both call, so a readout can never disagree with
  the solid: pitch Ø = `module·teeth`; base Ø = pitch Ø·cos(α); addendum = `module·(1+x)`;
  dedendum = `module·1.25 − x·module` (the `1.25` constant stated, with `clearanceMm`
  overriding it the way V1's `clearance` does); `circularPitch = π·module`.
- **Undercut and the minimum tooth count.** Below ~17 teeth at 20° (≈ 32 at 14.5°) a
  standard involute undercuts. V1 simulates this naturally through the cutter sweep
  (`bf-gear`'s 8-tooth pinion and `window-motor`'s 12-tooth ones depend on it). Decide, per
  `core-039`, whether to model the trochoid or clamp with auto profile-shift, and return a
  `warnings: ['undercut']` field either way — never a silent self-intersecting outline.
- **Backlash and clearance** are lengths in mm (as V1), applied as tooth-thickness
  reduction at the pitch circle and extra root depth. State the sign convention in the JSDoc.
- Outline winding is CCW and the first vertex is the tooth-0 centre on the root circle so
  `core-042`'s twist and `core-045`'s loft see consistent correspondence.

## Interaction model

n/a — core only, no UI surface (`ui-057` adds the Library row and Inspector).

## Documentation

n/a — no user-visible control in this task.

## Affected files

- `src/core/gear/involute.js` + `involute.spec.js`, `src/core/gear/dimensions.js` +
  spec, `scripts/generate-v1-gear-fixture.cjs` (one-off, run against
  `~/src/jscad/jscad-gears`, same pattern as the existing `generate-v1-*-fixture.cjs`
  scripts), `src/core/gear/__fixtures__/v1-gears.json`.

## Effort

L.

## Testing

- **Parity with V1** (tolerance stated in the spec, e.g. area within 0.5 %, tip and root
  radius within 0.01 mm): `window-motor` 36T and 12T (`cp = π·50/36`, clearance 0.5,
  backlash 0.1); the 12T `pa 35` centre gear; `drive-wheel`'s 32T (`cp = π·50/32`,
  `pa 20`, 0.05/0.05); `bf-gear`'s 30T and 8T (`cp 8`, `pa 14.5`).
- **Numerics**, `toBeCloseTo` with explicit digits: tip and root radii equal the closed-form
  values; pitch-circle tooth thickness = `circularPitch/2 − backlash`; every vertex lies
  between root and tip radius; the outline is simple (no self-intersection), CCW, and has
  `teeth · (4·pointsPerFlank + …)` vertices; rotating by `360/teeth` maps the outline onto
  itself.
- **Degenerate cases**: 3, 4, 6 and 200 teeth; `pressureAngle` 0 and 45; negative and large
  `profileShift`; `module` tiny and huge; `backlash` so large the tooth vanishes → a named
  error, not a NaN; non-integer or non-positive `teeth` rejected.
- **Speed**: a 64-tooth gear builds in under 20 ms (V1: seconds) — assert generously, record
  the real number.
- Chromium-only for the unit spec (pure numerics). `TODO/ACCEPTANCE.md`: none touched yet.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
