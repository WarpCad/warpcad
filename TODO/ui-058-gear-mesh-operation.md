---
title: Mesh operation — select two gears, click Mesh, and the second moves to the correct centre distance and phase
category: ui
kind: feature
priority: high
model: opus
milestone: M11
depends: [ui-057, core-044]
status: open
---

## Goal

V1 meshed gears by building a `GearSet` in code. In WarpCad the person drags two gears into
the scene and they sit wherever they landed. "Done": with exactly two compatible gears
selected, a **Mesh** operation moves the second onto the first's mesh position — correct
centre distance, correct tooth phase, no interpenetration — keeping the direction the user
had pushed it, and tells the user plainly when two gears *can't* mesh and why.

## Interaction model

- **Precondition**: **exactly two** bodies selected, each a gear (a `gear.*` composite or one
  of a gear pair's named parts). Anything else: the button is disabled with a tooltip/hint
  saying "Select two gears" (selection-*count* gating per `CLAUDE.md`, not mere presence).
  Two gears that are *incompatible* leave the button enabled but the popover shows
  `mesh.compatibility()`'s messages verbatim ("module 1.4 vs 2.0", "same-hand helical on
  parallel axes") and **Mesh** disabled, rather than silently doing something wrong.
- **Trigger**: **Mesh** on the Operations toolbar beside Snap/Align (the pattern `ui-035`
  built), opening a small popover; `data-testid="op-mesh"`. The **second-selected** gear is
  the one that moves, the first is the anchor — the popover names both and has a **Swap**
  button. Options: *Backlash* (mm, default from the gears), *Keep direction* (default on:
  slide the gear along the line between centres; off: use the gear's current bearing to
  the anchor and only fix the distance), *Align phase* (default on).
- **Feedback**: the moved gear animates/jumps to the new position and stays selected; the
  anchor does not move; History reads `Mesh Spur gear 2 to Spur gear 1`; the popover shows
  the resulting **centre distance** and **ratio** (`core-044`'s, signed).
- **Selection response**: unchanged; the Inspector for the moved gear shows its new
  position. The gizmo keeps working — after a Mesh the user can still drag the gear, which
  un-meshes it (no lock in v1; stated, not hidden).
- **Selection count**: exactly 2. With 3+ the popover offers nothing (a chain is done as
  repeated pairs; a *Planetary set* is its own recipe — `core-049`).
- **Placement**: n/a — an operation on existing geometry.
- **Small-screen behavior**: popover becomes the same bottom sheet the Snap/Align and Mirror
  popovers use at phone width; **Mesh** and **Swap** are 44 px targets; at 390 px it must not
  sit under the Inspector sheet (see `ui-036`'s lesson about lifting it).
- Mesh must emit **one** document operation through the command layer (origin `ui`), one
  undo step, built from the two gears' *records* (their params), not their meshes.

## Documentation

- **Page**: update `docs/gears.md` (created by `ui-057`) with a *Meshing two gears* section
  and add a row to `docs/snap-align.md`'s "related tools" list.
- **Example**: "Drag a **Spur gear** (36 teeth) and a second **Spur gear** (12 teeth, same
  module) into the view, anywhere. Click the 36-tooth gear, then Shift-click the 12-tooth
  one. Click **Mesh**. The small gear jumps beside the large one; the popover reads *Centre
  distance 33.6 mm · Ratio −3 : 1*. Click Undo once and it returns where you dropped it."

## Affected files

- `src/core/gear/mesh.js` (called, not changed), `src/core/library.js` or a new
  `src/core/gear/meshOperation.js` that builds the command record (+ spec),
  `src/components/viewport/OperationsToolbar.vue`, `src/components/features/MeshPopover.vue`
  (new), `docs/gears.md`, `docs/snap-align.md`, `e2e/gear-mesh.e2e.js`.

## Effort

L.

## Testing

- **Real `e2e/gear-mesh.e2e.js` on `/`**: place two gears *by dragging*, select both, assert
  Mesh disabled with one gear and with one gear + a cube, enabled with two, click it, assert
  the centre distance equals `core-044`'s value and the **boolean-intersect volume of the
  two bodies is ≈ 0**; Undo; mismatched-module pair shows the message and a disabled Mesh.
  A second drive with the gears dropped at awkward angles and with the *second* one
  selected first (order matters — the anchor/moving assignment is the likely bug).
- Phone, tablet and laptop with a snapshot at each; **all three engines** (WebGL + worker).
- **Acceptance**: re-drive 1, 3, 6, 7 (touch), 10, 16 (Mirror — same toolbar region and
  popover pattern), and **scenario 19** from `testing-002`. **Closed findings** re-run:
  `ui-035`'s (Snap/Align popover emits a sub-part operand), `ui-036`'s (popover lifted above
  the phone Inspector), `ui-053`'s.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
