---
title: Planetary gear set — sun, planets, ring and carrier from one parameter record
category: core
kind: feature
priority: low
model: opus
milestone: M11
depends: [core-043, core-044]
status: open
---

## Goal

A planetary set is the natural showpiece for the gear kit, and the hardest thing to get
right by hand — the tooth counts must satisfy two constraints at once. None of the user's
V1 projects builds one, but the internal-gear support in `jscad-gears` (the 96T ring
example) is half of it. "Done": `gear.planetary` builds a sun, `N` planets, a ring and an
optional carrier plate that all mesh and can be assembled without collision.

## Design

- **Constraints, enforced and explained**: ring `R = S + 2P` (geometry), and equal spacing
  needs `(S + R) / N` to be an integer. `src/core/gear/planetary.js` exposes
  `validPlanetCounts(S, P)` and, given a bad request, returns the *nearest valid* tooth
  counts as a suggestion in the error — never a silently mis-meshing set.
- **Placement**: planets sit on the carrier radius `(S+P)·m/2` at angles `k·360/N`; each
  planet's own phase comes from `core-044`'s `meshPhaseDeg` against the sun, then adjusted so
  the same rotation also meshes the ring. Derive and test that the single phase satisfies
  both meshes (it only does when the equal-spacing constraint above holds).
- **Ratios**: expose the four standard ratios as readouts (`ring fixed`: `1 + R/S`; `carrier
  fixed`: `−R/S`; `sun fixed`: `1 + S/R`), because choosing which member is held is the whole
  design question.
- **Named parts**: `sun`, `planet-1…N`, `ring`, `carrier` (plate with pin bores, a fixed
  small set), `pins`. All use `core-048`'s hub/bore options where relevant.
- **Helical option** reuses `core-042` (opposite hands for sun/planet vs planet/ring is
  *not* needed for planetary — same-hand helical on internal pairs; state the rule used).
- Out of scope: compound planets, differentials, cycloidal and harmonic drives.

## Interaction model

n/a — core only; one more Library row (`ui-057`) with a derived-ratio readout.

## Documentation

n/a — no user-visible control in this task.

## Affected files

- `src/core/gear/planetary.js` + spec, `src/core/kernel/recipes/gear.planetary.js` + spec,
  `src/core/kernel/registry.js`, `src/core/library.js`.

## Effort

L.

## Testing

- **Numerics**: `R = S+2P`; ratios for (S=12, P=18, R=48, N=3, 4) hold; `validPlanetCounts`
  agrees with brute force for S, P up to 60; nearest-valid suggestion is actually valid.
- **Interference proof**: boolean-intersect volume ≈ 0 between every adjacent pair (sun-planet,
  planet-planet, planet-ring) at 12 sun rotation angles; **negative control** with a count
  that violates equal spacing produces overlap or the named error.
- **Degenerate**: N = 1, N too large for the planets to fit without touching (planet-planet
  clearance), S < 6, P < 6.
- **Re-run**: `core-043` and `core-044` specs; scenarios 1, 3, 10. Chromium only; this is
  the heaviest gear recipe, so **measure** and record fold time at preview and export
  resolution, with a stated ceiling the spec enforces.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
