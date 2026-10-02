---
title: Internal (ring) gear and rack — the two shapes V1 hid behind toothCount < 0 and toothCount 0
category: core
kind: feature
priority: medium
model: opus
milestone: M11
depends: [core-041]
status: open
---

## Goal

V1's `Gear` encodes a ring gear as a **negative** `toothCount` and a rack as `0`, and the
ring gear *cannot be built without the pinion it meshes with* (`connectedGear` — it cuts the
teeth by sweeping the enlarged pinion). `jscad-gears/examples/gear-set.jscad` shows the
96-tooth ring with a 14-tooth pinion. "Done": `gear.ring` and `gear.rack` are separate
registry entries; a ring gear is defined by its **own** parameters (teeth, module, pressure
angle, rim thickness) and meshes with any compatible external gear, and a rack is a
true-length bar with a requested number of teeth.

## Design

- **`gear.ring`** (`kind: 'composite'`): the tooth profile of an internal gear is the
  *complement* of the external involute with the same parameters, with tip and root swapped
  (addendum points inward) and the standard +clearance. Generate it analytically from
  `involuteProfile`'s dimensions — no `connectedGear`, no per-pinion cutter sweep. Params:
  `teeth`, `module`, `pressureAngleDeg`, `rimThicknessMm` (outer diameter = root + rim),
  `thicknessMm`, plus the shared `clearanceMm`/`backlashMm`. Optional `helixAngleDeg` (shares
  `core-042`'s helper). Rejects a tooth count that cannot mesh with *any* pinion
  (interference condition: the ring needs `teeth − pinionTeeth ≥ 8` or so for a 20° tooth;
  state the formula used and expose `minPinionTeeth` as a derived readout).
- **`gear.rack`**: a straight-line limit of the spur profile. Params: `teeth` (default 10,
  cap 200 — V1 hard-codes 41), `module`, `pressureAngleDeg`, `heightMm` (back thickness
  behind the teeth), `thicknessMm`. Axis conventions: tooth row along **+X**, teeth pointing
  **+Y**, extruded along Z; the pitch line is the rack's `pitch` part (so a pinion snaps onto
  it — see `core-044`).
- **Shared tooth maths**: both entries call into `src/core/gear/involute.js`; ring and rack
  must not re-implement the flank equation.
- **Named parts** as in `core-041`: `gear`, `pitch`, and for the ring `bore` (the central
  clearing cylinder) so a planet carrier (`core-049`) can address it.

## Interaction model

n/a — core only. Library rows and the placement preview are `ui-057`. (A ring gear is a
*creation*, not an operation: it never asks for a pinion selection.)

## Documentation

n/a — no user-visible control in this task; `ui-057` documents the flow.

## Affected files

- `src/core/gear/internal.js`, `src/core/gear/rack.js` + specs, `src/core/kernel/recipes/
  gear.ring.js`, `gear.rack.js` + specs, `src/core/kernel/registry.js`,
  `src/core/library.js` (`ROW_ORDER`).

## Effort

L.

## Testing

- **Parity with V1** for the two ring gears the user's projects use: `jscad-gears`'
  documented example (96T ring, 14T pinion, `cp = π·50/96`) and `drive-wheel`'s wheel
  (**64T ring, 14T pinion, `cp = π·(78.5+4)/64`, clearance and backlash 0.05, 20°**): tip
  (inner) radius, root radius and rim OD within 0.02 mm. Fixtures come
  from `scripts/generate-v1-gear-fixture.cjs` (`core-040`), extended to cover internal and
  rack output.
- **Meshing proof, not just shape**: a ring gear and the external gear of `core-041` with
  the same module, placed at centre distance `m·(Zring − Zpinion)/2` and the half-tooth
  phase from `core-044`, have **zero interpenetration volume** (boolean intersect volume
  ≈ 0 within the backlash tolerance) at 12 rotation angles. This is the test that proves the
  complement construction is right.
- **Degenerate**: ring where `teeth ≤ pinion teeth` (named error), rack with 1 tooth, rack
  with the cap+1, `pressureAngle` extremes, 0 mm rim (rejected), watertight on all of the
  above.
- **Re-run**: scenarios 1, 3, 10; `core-041` specs. Chromium only.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
