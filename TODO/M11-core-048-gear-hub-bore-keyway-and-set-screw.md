---
title: Gear hubs, bores, D-flats, keyways and set-screw holes — what every V1 gear project bolted on by hand
category: core
kind: feature
priority: medium
model: sonnet
milestone: M11
depends: [core-041]
status: open
---

## Goal

A bare toothed disc is never the part. Every V1 gear project adds the same extras
by hand: `window-motor` unions bearing posts and a `Pinslot` (a 1.2 × 14 mm slot with a
2.5 mm head) and aligns a hexnut; `bf-gear` uses `centerHoleDiameter`; `drive-wheel`
builds a `hub()`, `flange()` and `axel()` with a hex nut seat. "Done": `gear.*` recipes
take a small, closed set of **shaft-attachment options** that cover those cases, each a named
part so booleans, snap and the BOM still address them.

## Design

- Options (all optional, all in mm, on `gear.spur`/`helical`/`bevel`/`wormWheel` through one
  shared helper in `src/core/gear/hub.js` so the recipes don't each grow a copy):
  - `boreMm` (round; already in `core-041`), `dFlatMm` (D-shaft flat depth, for 5 mm N20 and
    similar motor shafts), `keywayMm: { width, depth }`, hex or square **nut trap**
    (`nutTrap: { spec: 'M3' }` reading `tables/nut-specs.js`, so the size comes from the same
    table as `hardware.nut` — no second copy of M-sizes);
  - `hub: { diameterMm, lengthMm, side: 'top' | 'bottom' | 'both' }` — a boss on the face;
  - `setScrew: { spec: 'M3', angleDeg }` — a radial tapped clearance hole through the hub
    into the bore, with an optional nut trap on the same axis (the standard grub-screw
    arrangement); reads `tables/screw-specs.js`.
  - `lighteningHoles: { count, diameterMm, onRadiusMm }` — a ring of through-holes in the
    web for large gears (the first thing a printed 64-tooth wheel needs).
- Each is a **negative or positive part with a stable name** (`bore`, `d-flat`, `keyway`,
  `nut-trap`, `hub`, `set-screw`, `lightening`) — same discipline as the hardware recipes
  (`hardware.screw`'s `clearance` parts), so `subtract` on a placed gear still addresses only
  the named bit (`core-020/024` behaviour).
- Fit clearances reuse `tables/fit-clearances.js` (`close`/`loose` as in
  `Hardware.Clearances` in V1), so a bore for a motor shaft is `shaft + clearance`, not a
  hand-typed number.
- **Hard cap**: the helper rejects a feature that would break through the root circle
  (a bore or lightening hole closer than 1 module to the root) with a named error.

## Interaction model

n/a — core only. `ui-057` presents these as a collapsed "Shaft & hub" group in the Inspector.

## Documentation

n/a — no user-visible control in this task.

## Affected files

- `src/core/gear/hub.js` + spec, `src/core/kernel/recipes/gear.spur.js` (and the other gear
  recipes via the helper), `src/core/kernel/tables/*` (read only).

## Effort

M.

## Testing

- **Unit**: each option alone and in combination returns the documented named parts; volume
  of the result equals the plain gear plus/minus the analytic volume of each feature within
  0.5 %; a D-flat's flat sits at `bore/2 − dFlat` along the chosen axis; nut-trap size equals
  `nutSpecs['M3']` across-flats plus the fit clearance.
- **Degenerate**: a bore larger than the root circle, a hub smaller than the bore, a
  lightening hole overlapping the bore or the root, zero-width keyway, `setScrew` with no
  hub (allowed only if the gear is thick enough — else a named error).
- **Watertight** after every combination above. **Re-run**: scenarios 3 (boolean on a
  hidden sub-part — the `bolt` repro) and 6 (group vs sub-part selection). Chromium only.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
