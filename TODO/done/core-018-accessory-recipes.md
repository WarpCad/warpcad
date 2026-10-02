---
title: "Accessory composite recipes: Active Cooling Fan, HAT, HAT Standoff, Spacer — standalone, board parameter dropped"
category: core
kind: feature
priority: medium
model: opus
milestone: M4
depends: [core-014]
status: done
---

> **What actually shipped, and the three places this file's own Proposed fix was wrong.**
> All four recipes landed as scoped, plus a V1 execution fixture this file's Testing
> section said not to build ("No V1 execution fixture") — reversed for the fifth task
> running, and it earned its keep immediately by catching two of the three errors below.
>
> 1. **`Parts.Board`'s corner radius is silently clamped, and `Spacer` depends on it.**
>    `spacer.js:82` asks for a 3.1 radius on a 6.2-wide brace — exactly half its width.
>    `CAG.roundedRectangle` does not reject that; it shrinks it to
>    `min(halfWidth, halfHeight) - 0.1` = **3.0**. Ported literally, the recipe *throws*:
>    `@jscad/modeling` and this registry's own `assertCornerRadiusFits` both require a
>    radius strictly under half the shortest side. The clamp is now reproduced in the
>    kit's `clampCornerRadius`, and with it the brace matches V1's volume to twelve
>    significant figures (496.94410833398 against 496.94410833398).
> 2. **`HatStandoff` takes its heights from neither table entry.** This file reads it as
>    "one `boolean.union` over two parts from `core-014`'s `tables/rpi-parts.js`". True of
>    the two *diameters* (6.2 and 2.8); false of the heights, which `hat-standoff.js:15-16`
>    passes explicitly as `options.height` and `options.height + 3` — 10 and 13, against
>    the table's own 1.5 and 4. Taking the table wholesale builds a standoff 8.5mm short
>    that still looks like a standoff. Its spec now asserts the split, not just the result.
> 3. **`Spacer`'s degenerate case does not fail the way this file predicted.** It asks for
>    `gussetInside >= gussetOutside` to "throw the same way `kit.boardFrame` already throws
>    on that condition (reuse, not reinvent, the guard)" — which is what shipped, and is
>    the better behaviour, but V1 does *not* throw that way: its 2D subtraction empties the
>    frame and `assertValidCSG` reports `parts:BoardFrame: invalid CSG: Empty mesh: no
>    polygons`. Both fail; only one says why. Recorded in the spec so the divergence is
>    deliberate rather than assumed identical.
>
> Two smaller deviations, both stated in the code: `Hat` was **registered, not re-ported**
> (`core-017` had already shipped the standalone expansion as `recipes/raspberrypi.hat.js`,
> exactly as this file's Goal anticipated), and the shared kit grew a **post-turn translate**
> — V1's `Board(...).rotateZ(b).translate([dx,dy,0])` cannot fold its translate into the
> pre-rotation offset, because the emitted records apply the translate *before* the rotate
> and the two do not commute off the rotation axis. `mirroredY()` needed no mirror op: a
> rounded rectangle reflected about `y = 0` is the same rectangle turned by the negated
> angle, which is exact rather than an approximation and is held to that by the fixture.

## Goal

Four composite recipes reproducing `jscad-raspberrypi@62a8e3b`'s `activeCoolingFan()`,
`Hat(pi, options)`, `HatStandoff(options)`, and `Spacer(options, mb)`. `Hat` and
`Spacer` both take an optional external board parameter per
`docs/decisions/composite-recipe-geometry.md`'s Family B table — **drop it and expand
standalone**, the attachment becoming the user's own `group.align`/`group.snap`
(`ui-026`), same requirement `core-016`/`017` implement. `activeCoolingFan` and
`HatStandoff` take no board parameter at all and need no such change.

`Hat` is a dependency of `core-017`'s `PiTFT22`/`PiTFT24` (both call `Hat(piMotherBoard,
options)` internally) — land this task's standalone `Hat` expansion first if sequencing
allows, or coordinate with whichever of the two tasks runs second per that task's own
note.

## Interaction model

n/a — no Library row exists for any composite op yet.

## Documentation

n/a — no control exists yet.

## Affected files

- `src/core/kernel/recipes/raspberrypi.activeCoolingFan.js`, `raspberrypi.hat.js`,
  `raspberrypi.hatStandoff.js`, `raspberrypi.spacer.js` (new)
- matching `.spec.js` files (new)
- `src/core/kernel/registry.js` (register all four, `composite(0, ...)`)

Real V1 source, `~/src/jscad/jscad-raspberrypi/src/` at `62a8e3b`:
`active-cooling-fan.js:9-33`, `hat.js:24-71`, `hat-standoff.js:13-18`, `spacer.js:51-112`.

## Proposed fix

**`activeCoolingFan` is the simplest recipe in the whole M4 catalogue**: one `board`
solid built from three `Cube` subtracts/unions with no external reference at all
(`active-cooling-fan.js:12-29`) — a direct `boolean.subtract`/`boolean.union` chain
over `primitive.cuboid` records, no probe-and-bake needed since every offset is a
literal constant in the source, not measured against a sibling part.

**`HatStandoff` is one `boolean.union`** (`Mountingpad(...).union(MountingHole(...))`,
`hat-standoff.js:17`) over two parts from `core-014`'s `tables/rpi-parts.js` — confirm
that table exports `Mountingpad`/`MountingHole` as reusable data (per `core-014`'s own
Proposed fix, they're ported there specifically so this task and `core-017`/`spacer`
below don't re-derive them).

**`Hat`**: drop the `pi` parameter (`hat.js:24,64-69` — the `if (pi)` block is exactly
the attachment step being removed). What remains is fully self-referential: `mb`
(`Parts.Board(65.02, 56.39, 3.56, 1.62)` — `kit.board.js`'s pattern again), four
mounting holes via `core-014`'s ported `MountingHole` factory (probe-and-bake against
`mb`, mirroring `bplus-mounting.js`'s already-ported `holes` shape from `core-014`
almost exactly, different constants), and one `Gpio(mb)` call (`core-014`'s
`tables/rpi-parts.js`, ported once and reused here).

**`Spacer` — the recipe with genuinely new geometry, read this one first.** `mb =
mb || BPlus().parts.mb` (`spacer.js:52`) is `docs/decisions/composite-recipe-
geometry.md`'s own strongest cited evidence for the origin-probe pattern: when handed
no board, V1 itself builds a throwaway `BPlus()` to measure against. Once the `mb`
parameter is dropped from this recipe's own signature, this line's job is exactly
`core-012`'s `kit.anchor` pattern — build a real `raspberrypi.bplus`-shaped probe
`mb` internally (not by invoking `core-014`'s composite expansion — recipe nesting is
deferred, per the decision doc — but by building the one part actually needed, the
motherboard PCB solid, using the same `Parts.Board` dimensions `core-014`'s recipe
uses), measure against it, discard it, bake the result. `BPlusMounting.pads` (the four
mounting-pad positions, `bplus-mounting.js:43-63`) already exists as `core-014`'s
`tables/rpi-parts.js` data, ported once and reused here — do **not** re-derive the pad
positions from scratch.

**`Spacer`'s gusset cross-brace is the one piece of real trigonometry in this task**:
`triUtils.solve(p1, p2)` (`spacer.js:78-79`, `~/src/jscad/jscad-utils/src/triangle.js`
— read that module before porting, it is not vendored in this project) computes the
angle between two diagonal mounting-pad centroids, which then rotates a `Parts.Board`
(`kit.board.js`'s pattern once more) to lie along that diagonal and mirrors it for the
opposite corner (`.mirroredY()`). This is exact, closed-form trigonometry (`triUtils.
toRadians`, `Math.sin`/`Math.cos` on the solved angle) — port the formula directly
rather than approximating it with a probe, and unit-test the angle against the known
right-triangle geometry of the four pad positions (which are themselves fixed
constants from `bplus-mounting.js`), not against a measured rendering.

**`Spacer`'s `BoardFrame` gusset** (`Parts.BoardFrame(outerX, outerY, innerX, innerY,
3, thickness)`, `spacer.js:92-99`) is literally `core-012`'s already-shipped
`kit.boardFrame` op — reuse it as a record (`op: 'kit.boardFrame'`), not a re-port.

**`Spacer`'s final assembly is a straight `boolean.union`/`boolean.subtract` chain**
(`spacers.union(gusset...).subtractIf(gpio.enlarge(...), options.gpio)`, `:105-111`) —
`subtractIf` is V1 sugar for "subtract only if a flag is set," which at record-
expansion time is just "emit the subtract record, or don't," resolved by `params.gpio`
at expansion time (a composite recipe is plain JS choosing which records to return —
no conditional-record type is needed in the registry itself).

**`Spacer`'s `postOnly`/`hollow` options are early-return/skip branches** (`:74,76`) —
port as branches in the recipe function that change which records get emitted, the
same shape `hardware.washer`'s `fit`-present-or-absent branch already established
(`core-011`'s retirement note: "one-or-two-record expansion... only when `params.fit`
is given").

## Effort

M — three of the four recipes (`activeCoolingFan`, `HatStandoff`, `Hat`) are small and
mechanical once `core-014`'s `tables/rpi-parts.js` exists; `Spacer`'s trigonometry and
its reuse of `kit.boardFrame` are the real content, but the formula is exact and
already proven in V1, not something to design from scratch.

## Testing

Vitest, one `.spec.js` per recipe, plain Node. No V1 execution fixture.
`activeCoolingFan`: bounding box and volume match the source's subtract/union chain
(computable by hand from the three cube constants). `HatStandoff`: bounding box is the
union of the two source parts' own boxes. `Hat`: mounting-hole centres match
`hat.js:32-50`'s stated `(3.56,3.56)`/`(61.47,3.56)`/`(3.56,52.46)`/`(61.47,52.46)`
pairs. `Spacer`: the gusset rotation angle is asserted against the exact analytic
right-triangle angle between the diagonal pad centroids (not a measured rendering,
since this is closed-form trig), plus one test per `postOnly`/`hollow`/`gpio` flag
combination confirming the right record subset is emitted. Degenerate cases: `Spacer`
with `gussetInside` ≥ `gussetOutside` should throw the same way `kit.boardFrame`
already throws on that condition (reuse, not reinvent, the guard).

No `*.e2e.js` — no UI surface exists yet.

Acceptance scenarios: none directly pass/fail on this task alone. `Spacer`'s reuse of
`kit.boardFrame` extends a subsystem `core-012` built and no finding was ever filed
against, so no closed-finding re-run applies.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
