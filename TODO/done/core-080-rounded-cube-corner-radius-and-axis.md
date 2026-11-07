---
title: Give the Cube a corner radius and a rounding axis, so a rounded box is one primitive
category: core
kind: feature
priority: medium
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-11-07 at the owner's request)
depends: []
status: done
---

> **What shipped (2026-11-07).** As proposed, with these changes found during the work:
> the Cube's `roundRadius` and `roundAxis` are read by `primitive.cuboid`; `roundRadius` 0 keeps the
> sharp cube polygon for polygon. Also changed: `paramEdit` now checks enum params against their
> options; `variables.js` keeps the Cube's size bind slots after its schema slots; `dependents.js`
> names a native op's body rather than "undefined". The docs example was corrected (a 1 mm board
> across a 0.5 mm limit is refused). The e2e volume check uses the chorded-arc shortfall from the
> segment count, not a fixed percentage. Caveats found by the acceptance drive are filed as
> `ui-100`–`ui-103`. Known-failures at commit: `testing-016`.

## Goal

The owner's most-used jscad1 shape is a box with its edges rounded along one axis: a circuit
board, a screen lens, a mounting plate, the shell of an enclosure. WarpCad can't make one today
without a sketch. A user should be able to select a Cube, type a **Corner radius**, pick which
**Rounded axis** the rounded edges run along, and get that shape as an ordinary Cube that still
snaps, aligns, resizes, binds to variables and exports like any other.

This is a **Cube option, not a new primitive** (owner, 2026-11-07: "it's just a type of Cube that
lets you set an axis and radius"). `primitive.cuboid` gains two optional params:

- `roundRadius` (mm, default `0`). `0`, or absent, is today's sharp cube, exactly, so every
  existing record and file is unchanged.
- `roundAxis` (`'x' | 'y' | 'z'`, default `'z'`). This is the axis the four rounded edges run
  **parallel to**. `'z'` gives a board or plate with rounded corners seen from above, which is
  what jscad-utils' `Parts.RoundedCube` always built.

`size` stays `[x, y, z]` in world axes whatever the axis, so the dimension lines, the resize
handles, `formula.js` quantities and every AI tool that reads a Cube's size need no change.

Done looks like: a rounded Cube placed, edited, saved, reloaded, filleted on a rim, subtracted
from, and exported, with the same `size` and `center` it had as a sharp cube.

### Evidence from the owner's jscad1 projects (`~/src/jscad/`)

`Parts.RoundedCube(x, y, thickness, cornerRadius)` from `jscad-utils/src/parts.js:103` is
`CAG.roundedRectangle({ center, radius, roundradius }).extrude({ offset: [0, 0, thickness] })`:
the four Z edges are rounded and the top and bottom are flat. There are about 70 call sites in 22
projects, plus raw `CAG.roundedRectangle(...).extrude()` in about 8 more. The patterns this
feature has to cover:

| Pattern | Examples | What WarpCad needs |
|---|---|---|
| Thin board, plate or lens, Z-rounded | `jscad-raspberrypi/src/camera-module-v2.js:18` (23.862 × 25 × t, r 2), `touch-display-7inch.js:21` (192.96 × 110.76 × 0.7, r 8), `miniPiTFT.js:90`, `window-motor/window-motor.jscad:123` (30 × 50 × 3, r 5) | `roundAxis: 'z'`, the default |
| Tall block with rounded vertical edges | `light-clamp/light-clamp.jscad:44` (38 × 25 × 100, r 2), `light-mount/light-mount.jscad:97` (70 × 130 × 28, r 5), `panel/panel.jscad:117` (90 × 90 × 25, r 15) | Same as above. Radii up to 15 mm are common, so the resolution policy matters |
| Rounded about X, built by rotating | `cube-hanger/cube-hanger.jscad:31` (`RoundedCube(...).rotateY(90)`), `kcup/kcup.jscad:116` (same) | `roundAxis: 'x'`, so the user doesn't have to rotate and then re-read the size in a turned frame |
| Shell sized from a bounding box | `picam-touch/picam-touch.jscad:542` (`RoundedCube(interiorVolume, r)`), `:575` (that box `.enlarge()`d by the wall), `PiPiece/PiPiece.jscad:526` | Size X/Y/Z bound to variables or a formula (`ui-059`, scenario 33), with a corner radius on top. Already works once `size` is unchanged |
| Rounded box, then a rim chamfer or fillet | `light-clamp.jscad:44` (`.chamfer(2, 'z+')`), `leafblower/leafblower.jscad:103` | The existing rim op (`src/core/kernel/fillet.js`) on a face **normal to** `roundAxis`. The body is prismatic along that axis, so `assertPrismaticBand` passes |
| Radius larger than the short side allows | `kcup/kcup.jscad:116` (`RoundedCube(…, 10, 10, 10)`: r 10 on a 10 mm side) | **Refuse, don't clamp.** See Proposed fix |

The second constructor form, `RoundedCube(csg, r)`, which takes its size from another solid's
bounds, has no direct equivalent here. The bounding-box shell row above is how WarpCad does it
(bound sizes). It is not part of this task.

## Interaction model

- **Precondition** — exactly one Cube selected (a body whose record is `primitive.cuboid`). The
  two new fields are on every Cube, including ones placed before this change, which show
  Corner radius `0` and Rounded axis `Z`.
- **Trigger** — two new fields in the Inspector's parameter list for a selected Cube, under
  **Size**: **Corner radius** (a number box in mm, like Size) and **Rounded axis** (a native
  `<select>` with `X`, `Y` and `Z`, the same `enum` field kind a Pi's **Model** uses,
  `TODO/ui-052`). Both are also reachable through the AI tools' `set_params` and `create` with
  `params: { roundRadius, roundAxis }`, since the tool registry reads the same param schema. The
  Library's **Cube** row is unchanged: a Cube still drops sharp, and `library-remember-params`
  (`e2e/library-remember-params.e2e.js`) carries a remembered radius into the next drop the way
  it carries a size.
- **Feedback** — the viewport rebuilds the body with the four edges along the chosen axis
  rounded, and the dimension lines still read the full Size. A radius that doesn't fit
  (at least half the shorter of the two sides across the axis) gets the field's error state with
  the kernel's own message ("roundRadius must be smaller than half the shortest side (5 mm), got
  10"), and the body keeps its last good shape, the same as any other refused param edit.
- **Placement** — n/a. Nothing new is placed. A Cube is still placed by dragging from the
  Library, and this only edits one that exists.
- **Selection response** — unchanged apart from the two fields. The move/rotate gizmo and the
  resize handles attach as they do to any Cube. A resize that shrinks a side below
  `2 × roundRadius` is refused by the same kernel check, with the same message.
- **Selection count** — n/a. This is a single-body param edit with no operation control to
  gate.
- **Small-screen behavior** — same as desktop. The fields are two more rows in the Inspector
  sheet that already scrolls at 390 px. Check that the `<select>` doesn't widen the sheet
  (`ui-085` was a sideways scroll in that sheet).

## Documentation

- **Page** — `docs/selection-and-inspector.md`. Change the Cube row of the parameter table
  (line 116, `| Cube | Size (X, Y, Z) |`) to add Corner radius and Rounded axis, and add a
  worked example right after the table. Add one line to `docs/fillet-chamfer.md` saying a
  rounded Cube takes a rim fillet on a face across its rounded axis.
- **Example** — "Make a Raspberry Pi Camera board blank. Drag a **Cube** into the view and
  select it. Set **Size** X `25`, Y `23.862`, Z `1`. Type `2` into **Corner radius** and press
  Enter. The four upright edges round off and the top stays flat. Now set **Rounded axis** to
  `X`: the rounding moves to the four edges that run left to right. Set it back to `Z`. Type `13`
  into **Corner radius**: the field goes red with 'must be smaller than half the shortest side
  (11.931 mm)', and the board keeps its 2 mm corners." All values are millimetres.
- **Media** — one new still, `docs/screenshots/inspector-rounded-cube.png` (the board above,
  selected, Inspector showing both fields), from a new shot in
  `e2e/docs/selection-inspector.docs.js`, embedded in `selection-and-inspector.md`.

## Affected files

- `src/core/kernel/registry.js:1370-1382` — `primitive.cuboid`: read `roundRadius` and
  `roundAxis`. With radius `0`, return exactly today's `primitives.cuboid` call (same polygons,
  not just the same volume, so tessellation fixtures and exports don't change). Otherwise build
  `primitives.roundedRectangle` from the two sides **across** the axis, `extrudeLinear` it by the
  side **along** the axis, rotate the extrusion so its +Z lands on the chosen axis, and translate
  it to centre on `center`. `extrudeLinear` builds from `z = 0`, so it is not centred, as the
  comment at `:1567` warns.
- `src/core/kernel/registry.js:634` — reuse `assertCornerRadiusFits` as it is, with the shorter
  of the two cross sides.
- `src/core/kernel/registry.js:2738` (`PARAM_SCHEMAS`) — a `primitive.cuboid` entry:
  `roundRadius` as `mmNonNegativeParam('Corner radius')` with default `0`, and `roundAxis` as
  `enumParam('Rounded axis', [X, Y, Z])` with default `'z'`. This entry is what gives the
  Inspector its fields and the AI tools their schema. Check that `runtimeParamSchema`'s
  fallback for `size` is kept when the op gains a schema entry. If an entry replaces rather
  than extends it, `size` must be listed in the new entry too.
- `src/core/inspector.js:239-241` — add `roundRadius` to `MM_PARAMS` if the schema entry
  doesn't already carry the unit to the field.
- `src/core/kernel/__fixtures__/tessellationCases.js` — a rounded-cuboid case, so the
  resolution policy (`segmentsFor(roundRadius, policy)`, a multiple of 4) is pinned for it the
  way it is for `profile.roundedRectangle` at line 103.
- `docs/selection-and-inspector.md`, `docs/fillet-chamfer.md`, `e2e/docs/selection-inspector.docs.js`.
- `e2e/rounded-cube.e2e.js` (new).

## Proposed fix

1. **Params, not a new op.** No `primitive.roundedCuboid`. A new op would need its own Library
   row, its own name numbering (`Rounded cube 1`) and a migration for anyone who wants to round
   an existing Cube, and the owner framed it as a kind of Cube. Every place that special-cases
   `primitive.cuboid` keeps working.
2. **Rounded edges run along `roundAxis`**, and the cross-section is the rounded rectangle on
   the other two axes in right-handed order: `z` → (X, Y), `x` → (Y, Z), `y` → (Z, X). Build it
   in the profile's own XY plane, extrude along local Z, then rotate: `x` is a rotation of +90°
   about Y followed by +90° about X (or one equivalent rotation). Pin the mapping with a test
   that measures the bounding box, not by reading the rotation. The bounding box must equal
   `size` on all three axes for each value of `roundAxis`.
3. **Too big a radius is refused, not clamped.** jscad1's `CAG.roundedRectangle` silently
   clamped it to half the short side minus 0.1 mm (`~/src/jscad/csg.js/src/api/primitives2d.js:132-134`),
   which is how `kcup.jscad:116` got a near-slot out of r 10 on a 10 mm side. WarpCad's rule is
   loud failure at the boundary, and `profile.roundedRectangle` already refuses this, so the
   Cube does the same. A true slot or stadium (radius exactly half) is a separate shape and is
   out of scope. If the owner wants it, it becomes its own TODO.
4. **Not in scope:** rounding all twelve edges (`@jscad/modeling`'s `roundedCuboid`, with
   spherical corners). That is a different shape from `Parts.RoundedCube`. A user who wants a
   soft top can get it now with a rim fillet on top of this. Also not in scope: a per-edge
   radius, and a Library row that drops pre-rounded.
5. **AI partner:** nothing to add. `create` and `set_params` read the param schema, so the
   two params appear in the tool's description automatically. Check that the `create` tool's
   description text names them, and update `src/ai/prompt.js` only if it lists a Cube's params
   by hand.

## Effort

M (a few hours): one kernel branch with a three-way orientation, one schema entry, docs and a
new e2e spec. Most of the risk is in the orientation mapping and the radius-0 identity.

## Testing

- **Unit, `src/core/kernel/registry.spec.js`:**
  - `roundRadius: 0`, and the same record with the key absent, both produce polygons identical
    to today's cuboid (deep equality on the geometry, not just volume).
  - For each `roundAxis`, the bounding box equals `size` to `toBeCloseTo(…, 6)`, and the
    volume equals `x·y·z − (4 − π)·r²·L`, with `L` the side along the axis, to within the
    chorded-arc shortfall at the test's segment count (state the tolerance from the segment
    count, as `fillet.js:50-58` does for its own).
  - Degenerate cases: radius exactly half the shorter cross side (refused), just under half
    (accepted), a negative radius (refused), an unknown axis such as `'w'` (refused by name), and
    a side along the axis much smaller than the radius (accepted, because only the cross sides
    bound the radius: a 50 × 50 × 0.7 plate with r 8 is valid).
  - The result is watertight (`src/core/kernel/watertight.js`) for every axis, the check
    `io-006` added for rim fillets.
- **Unit, `src/core/inspector.spec.js`:** a selected Cube without the new keys lists Corner
  radius `0` mm and an `enum` Rounded axis set to `'z'` with three options.
- **E2E, `e2e/rounded-cube.e2e.js` (new, navigates to `/`):** drag a Cube, select it, type a
  Corner radius, and check that the canvas changed and the Size fields didn't. Change the
  Rounded axis and check it again. Type an oversized radius, see the field error and an
  unchanged canvas. Save, reload, and confirm both fields come back. Undo the radius edit, and
  check that one Undo restores the sharp cube. Runs on **all three engines** (Chromium, Firefox,
  WebKit), because it checks rendered kernel output, and at **phone, tablet and laptop**
  viewports with a snapshot at each for the Inspector rows.
- **Acceptance scenarios to re-drive:** **1** (two independent primitives: a rounded Cube and
  a sphere both stay visible), **10** (save, reload, nothing changed), **12** (edit a step in
  the middle of history: change the radius of an early Cube that a later Subtract consumes) and
  **33** (calculate a size from two parts: the bound-size shell pattern, then add a radius).
  **4** only if a reviewer thinks the Inspector change could affect boolean gating; it
  shouldn't.
- **Closed findings to re-run:** `data-007` (primitive resize, snapped dependents follow).
  Re-run its reproduction with a rounded Cube as the resized body, plus one resize that crosses
  `2 × roundRadius` and must be refused. `io-006` (fillet exports open edges): rim-fillet the top
  of a Z-rounded Cube, export STL, and check it is watertight.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
