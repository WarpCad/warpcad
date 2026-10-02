---
title: Worm and worm wheel — the gear the drive-mount RA bracket only had a cylinder placeholder for
category: core
kind: feature
priority: medium
model: opus
milestone: M11
depends: [core-042, core-044]
status: open
---

## Goal

`drive-mount/DriveMount.jscad` models its right-ascension worm as
`Parts.Cylinder(6, 86).rotateY(90)` inside a `wormbase` box — a stand-in, because the V1
library had no worm. A telescope RA/Dec drive is exactly where a worm earns its place.
"Done": `gear.worm` builds a single- or multi-start worm, `gear.wormWheel` a matching wheel,
and `gear.wormPair` places them at the right centre distance and phase.

## Design

- **Worm**: a threaded shaft whose axial profile is a trapezoid (the rack tooth of
  `core-043`, thickened for the pressure angle) swept helically. The sketch pipeline
  already has `extrudeHelical` (`registry.js` — `method: 'helical'`, `pitchMm`, `turns`,
  `segmentsPerTurn`); the worm reuses it with the rack-tooth cross-section rather than
  adding a new sweep. Params: `starts` (1…4), `module` (axial), `pressureAngleDeg`,
  `lengthMm`, `pitchDiameterMm`, `handedness`, `boreMm`/`shaftMm`. Lead = `starts·π·m`;
  lead angle `γ = atan(lead / (π·d))` is a derived readout and drives `wormWheel`'s helix.
- **Worm wheel**: a **helical gear with helix angle = γ and hand matching the worm**,
  `teeth` as a free param, `faceWidthMm`. Phase 1 builds the *non-throated* wheel (a helical
  gear: line contact becomes point contact, adequate for light-duty printed drives);
  the **throated** (enveloping) wheel is a stated follow-up with a Testing note, not
  silently omitted — the module doc says "non-throated, point contact".
- **Self-locking readout**: `selfLocking = tan γ < μ` with an assumed μ shown as a param
  default; it is information for the user (a mount that must not back-drive), not a
  guarantee. Label it that way.
- **`gear.wormPair`**: centre distance `(d_worm + d_wheel)/2`; worm axis ⟂ wheel axis, offset
  by the centre distance; phase from `mesh.js` crossed-axis helper in `core-046`.
- Worm ratio is `wheelTeeth : starts`, **not** a tooth/tooth ratio — `gearRatio()` from
  `core-044` takes the worm as a special case; test it, don't special-case in a component.

## Interaction model

n/a — core only. Library rows, Inspector readouts and the Mesh operation are `ui-057`/`ui-058`.

## Documentation

n/a — no user-visible control in this task.

## Affected files

- `src/core/gear/worm.js` + spec, `src/core/kernel/recipes/gear.worm.js`, `gear.wormWheel.js`,
  `gear.wormPair.js` + specs, `src/core/gear/mesh.js`, `src/core/kernel/registry.js`,
  `src/core/library.js`.

## Effort

L.

## Testing

- **Numerics**: lead, lead angle, ratio (`wheelTeeth/starts`) for 1-, 2- and 4-start worms;
  axial pitch equals `π·m`; wheel helix equals the worm's lead angle within 1e-9.
- **Geometry**: watertight worm at 1/2/4 starts and a long (200 mm) worm at export
  resolution — **measure** the vertex count and time and record both; a worm is the first
  gear likely to stress the kernel budget (`CLAUDE.md` performance section), so the spec
  fails over a stated ceiling rather than just logging it.
- **Interference proof**: worm + non-throated wheel intersection volume small and stable
  across 12 worm rotations (it is point contact, so assert *below* a stated bound, not zero —
  and say why).
- **Degenerate**: worm with `lengthMm` shorter than one lead, 0 starts, 5 starts, `pitch
  diameter` below the root-diameter limit, a wheel with fewer than 17 teeth (named warning).
- **Re-run**: sketch `helical` extrude's own specs (`sketch-001`) since this reuses
  `extrudeHelical`; scenarios 1, 3, 9, 10. Chromium only here.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
