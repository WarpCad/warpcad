---
title: Gear meshing math (centre distance, phase, ratio) and a gear.pair recipe
category: core
kind: feature
priority: high
model: opus
milestone: M11
depends: [core-041]
status: open
---

## Goal

V1's `GearSet` is the only reason two V1 gears mesh: it puts gear 2 at
`pitchRadius1 + pitchRadius2` and rotates it by `180 + 180/teeth` (a half-tooth) so a tooth
lands in a gap. In WarpCad that knowledge must live in one pure module that **both** a
ready-made pair and the interactive *Mesh* operation (`ui-058`) use. "Done": given two gear
descriptions it returns the exact transform that meshes them, the true gear ratio, and a list
of reasons the pair is incompatible; a `gear.pair` recipe builds a meshed pair from one
param record.

## Design

- `src/core/gear/mesh.js` — pure functions, mm and degrees named at the boundary:
  - `centerDistanceMm(a, b)`: `rA + rB` (external–external), `rRing − rPinion` (internal),
    `rPinion + rackPitchLine` (rack). Includes `profileShift` and, optionally, backlash.
  - `meshPhaseDeg(a, b)`: the rotation of the second gear about its own axis so teeth
    interleave (the half-tooth rule, generalised to an arbitrary tooth count of *gear 1* —
    V1's `180 + 180/z₂` is only right when gear 1 has a tooth on its +X axis, which
    `core-040` guarantees; state that precondition and test it).
  - `gearRatio(a, b)`: `b.teeth / a.teeth`, signed (negative for an external pair — shaft
    reversal; positive for a ring). V1 computes `gear1.toothCount / gear1.toothCount`, i.e.
    always 1 — a recorded defect, not behaviour to port.
  - `compatibility(a, b)`: reasons a pair will not mesh — module, pressure angle, helix
    angle magnitude, helix *hand* (opposite on parallel axes, same on crossed), face-width
    overlap; each reason is a code + one-sentence message the UI can show verbatim.
- **`gear.pair`** composite recipe: params `{ driveTeeth, pinionTeeth, module, …shared,
  thicknessMm, pitchPlane: 'xy' | 'xz' | 'yz' }` → two `gear.spur` records plus the
  trailing `transform.translate` and `transform.rotate` for the second. Parts: `drive`,
  `pinion` — the names `window-motor` already uses (`gears.parts.drive`, `.pinion`), so a V1
  author's mental model carries over.
- **Operates on records, not meshes**: the transform is computed from params, never by
  measuring built geometry (`docs/decisions/composite-recipe-geometry.md`: a recipe expands
  against an empty fold). For the interactive case, `ui-058` reads each gear's params from
  the document record, not from its mesh.
- A gear that has been *moved or rotated* since placement carries that in its own transform
  records; `mesh.js` takes an explicit `{ center, axis, phaseDeg }` frame per gear so the
  caller supplies the current frame and gets a delta back.

## Interaction model

n/a — core only. The user-facing *Mesh* operation is `ui-058`; the pair recipe's Library row
is `ui-057`.

## Documentation

n/a — no user-visible control in this task.

## Affected files

- `src/core/gear/mesh.js` + `mesh.spec.js`, `src/core/kernel/recipes/gear.pair.js` + spec,
  `src/core/kernel/registry.js`, `src/core/library.js`.

## Effort

M.

## Testing

- **Numerics** (`toBeCloseTo`): centre distance for 36T/12T at `cp = π·50/36` is
  `(36+12)/2 · (cp/π)`; ratio is exactly `−3` and `−12/36` the other way; phase for even
  and odd tooth counts, with `profileShift` ≠ 0.
- **Interference proof (the one that matters)**: build `window-motor`'s 36T/12T pair via
  `gear.pair`, then boolean-intersect the two bodies at 12 angular positions of the drive
  gear (pinion rotated by −3× each step): intersection volume ≈ 0 within backlash
  tolerance. Repeat for `bf-gear`'s 30T/8T at 14.5° and a helical pair (opposite hands).
  Intentionally wrong phase must produce a clearly **non-zero** volume (negative control).
- **Compatibility**: mismatched module, mismatched pressure angle, same-hand helical on
  parallel axes, a ring with fewer teeth than its pinion — each yields its code and message.
- **Degenerate**: equal tooth counts, ratio 1; one-tooth difference ring pair; zero thickness.
- **Re-run**: `core-041` and `core-043` specs (shared module). Scenarios 1, 3, 10. Chromium only.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
