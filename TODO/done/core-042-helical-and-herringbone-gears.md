---
title: Helical and herringbone gears — a helix angle on gear.spur, driven by the extrude twist
category: core
kind: feature
priority: medium
model: opus
milestone: M11
depends: [core-041]
status: done
---

> **What shipped (2026-10-16).** As specified, with four calls recorded in the `docs/decisions/gears.md`
> core-042 addendum: `moduleMm` and `pressureAngleDeg` are the normal values and the profile is the
> transverse section; `grooveMm` is not built (refused by name, filed as `core-062`); a negative
> `helixAngleDeg` is refused (use `handedness: 'left'`); a twist past 360 degrees or 2M vertices is
> refused (worm is `core-047`). `profile.extrudeLinear` gained `twistDeg`, `twistSteps` and `herringbone`
> (a single chevron `extrudeFromSlices`), not just param validation.

## Goal

Helical gears are missing from the V1 library; the only trace is `guide-mount`'s old
`Gears.involuteGear({ twist })`. "Done": `gear.spur` accepts `helixAngleDeg` (and
`herringbone: true`), and the result is a watertight twisted solid whose teeth lie at the
requested helix angle on the pitch cylinder.

## Design

- **Twist from helix angle, not the other way round.** `profile.extrudeLinear` already takes
  `twistAngle` and `twistSteps` (`registry.js`). For a helix angle β on pitch radius `r` and
  thickness `t`: `twist = t·tan(β)/r` (radians). Compute it in `src/core/gear/helix.js` and
  hand the existing op that number; do **not** add a native helical-gear op.
- **Hand**: `handedness: 'right' | 'left'` flips the twist sign. A meshing helical pair
  needs *opposite* hands on parallel axes and the **same** hand on crossed axes; `core-044`
  uses this to warn on a bad pair.
- **Twist steps** are a quality setting: enough that the chord error of a twisted flank is
  below the export tolerance (derive `steps ≥ ceil(|twist| / maxStepRad)`; cap it). A coarse
  preview and a fine export again come from `core-035`'s two resolutions.
- **Herringbone**: two mirrored helical halves, unioned at mid-thickness, with an optional
  `grooveMm` relief gap. The union of two exactly-coincident faces is the classic
  non-manifold trap — build it as *one* loft/extrude through three slices
  (`extrudeFromSlices`, as the sketch loft does) or overlap by an epsilon and say which.
- **Axial thrust and normal module**: helical gears are specified by *normal* module; the
  transverse module the profile uses is `mₙ/cos β`. Name both in the params and the
  Inspector readouts (`ui-057`) so a user mating to a store-bought gear isn't off by `cos β`.
- Cap `|β|` at 45° and teeth·thickness for the resolution to stay inside the vertex budget.

## Interaction model

n/a — core only. `ui-057` adds the helix-angle and herringbone controls.

## Documentation

n/a — no user-visible control in this task.

## Affected files

- `src/core/gear/helix.js` + spec, `src/core/kernel/recipes/gear.spur.js` (new params),
  `src/core/kernel/registry.js` (param validation only).

## Effort

M.

## Testing

- **Numerics**: `twist = t·tan(β)/r` at β = 0 (no twist — output identical to the plain spur
  gear, byte for byte), 15°, 30°, 45° and negative; rotating the top slice relative to the
  bottom equals the computed twist within 1e-6 rad.
- **Watertight** at every β above and for herringbone; herringbone volume ≈ 2 × half-gear
  volume within tolerance; no coincident-face seam (a thin-slice section at mid-thickness is
  a single solid outline).
- **Degenerate**: β = 0 with `herringbone: true` (valid — a spur gear with a seam, must not
  produce a non-manifold join); `twistSteps = 1` rejected below the minimum for |β| > 0.
- **Re-run**: scenarios 1, 3, 10; and `core-041`'s own watertight/hostile-input specs, since
  this extends the same recipe. Chromium only.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
