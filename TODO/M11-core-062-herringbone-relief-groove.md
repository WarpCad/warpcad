---
title: Herringbone relief groove — an optional gap at mid-thickness (grooveMm)
category: core
kind: feature
priority: low
model: sonnet
milestone: M11
depends: [core-042]
status: open
---

## Goal

`core-042` builds a herringbone as one chevron extrude and refuses `grooveMm` by name
(unknown param). Real herringbone gears often leave a relief groove at the chevron's apex so
a hob or cutter can run out and the two halves do not need a perfect seam. "Done":
`gear.spur` accepts `grooveMm` (with `herringbone: true`), and the result is a watertight
solid with an annular groove of that width centred at mid-thickness.

## Design

- **Build the groove by subtraction, not by splitting the chevron.** Keep the single
  `extrudeFromSlices` chevron from `core-042`, then subtract a thin annular cut at Z = 0 whose
  inner radius is the root radius and outer radius is the tip radius plus an epsilon
  (`core-042`'s decisions in `docs/decisions/gears.md`). Two separate halves with a gap would
  need a second extrude and a union, and gain nothing.
- **Limits.** `0 < grooveMm < thicknessMm / 2`, and refused (by name) without
  `herringbone: true`. A groove wider than the gear is a limit error, not a silently empty part.
- **Bore.** The groove must not cut into the bore wall: its inner radius is `max(root, bore)`.
- **Named parts** are unchanged; add no new part.

## Interaction model

n/a — core only. `ui-057` adds the control.

## Documentation

n/a — no user-visible control in this task.

## Affected files

- `src/core/kernel/recipes/gear.spur.js` (new param, limits), `src/core/gear/limits.js`,
  `src/core/gear/aliases.js` (canonical name), and their specs.

## Effort

S.

## Testing

- **Numerics**: volume equals the herringbone volume minus the annulus volume within
  tolerance; groove width recovered from a thin-slice section at Z = 0.
- **Watertight** with and without a bore.
- **Degenerate**: `grooveMm` without `herringbone`, zero, negative, `>= thicknessMm / 2`, and
  a groove at the limit — each refused by name or valid as stated.
- **Re-run**: scenarios 1, 3, 10; `core-042`'s herringbone and β = 0 specs. Chromium only.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
