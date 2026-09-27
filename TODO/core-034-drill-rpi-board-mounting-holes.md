---
title: Drill the mounting holes through raspberrypi.* board solids instead of rendering them undrilled
category: core
kind: finding
priority: medium
model: sonnet
milestone: M7
depends: [core-033]
status: open
---

## Problem

Reported by the user 2026-09-27: *"I've added a raspberry pi object from the library,
however the holes are not shown."* Dropping any **Raspberry Pi** board from the Library
panel renders a solid, undrilled PCB. The four M2.5 mounting holes (and on a Pi 5, the
two fan-mount holes) are missing, and those are the features a user needs most when
designing a case or bracket around the board.

This is a documented, deliberate narrowing from V1 (`TODO/core-014`, deviation 2) and
not a render bug. `src/core/kernel/recipes/raspberrypi.bplus.js:64-72`:

> **Mounting holes are parts, not holes.** V1 also assigns `group.holes`, which makes
> `combine()` subtract the four cylinders from the *whole* assembly. This fold's record
> schema has no "add this as a hole" flag [...] so the holes here are hidden named
> parts only [...] The visible difference is that this board renders undrilled. A
> consumer that wants them drilled emits its own `boolean.subtract` against
> `hole1`-`hole4`.

That reasoning holds at the schema level, but its premise that "a consumer" will do
the drilling fails in practice. The consumer is a human dragging a row out of the
Library panel, and they have no reason to know the holes exist as hidden sub-parts.
Even if they did, `ui-047`'s **Show hidden parts** plus a manual Subtract per hole is
four or six boolean steps just to get a board that looks like a Pi. It also adds four
or six timeline entries the user never asked for.

The same "renders undrilled" decision is copied, with the same wording, into:

| Recipe | Hidden hole parts | Board part to drill |
|---|---|---|
| `raspberrypi.bplus.js:657-670` | `hole1`-`hole4`, plus `fan1hole`/`fan2hole` on model 5 (`:573-603`) | `mb` |
| `raspberrypi.hat.js:23-27, 163-167` | `hole1`-`hole4` | `mb` |
| `raspberrypi.piTFT22.js:26-32, 92-93` | `hole1`-`hole4` | the Hat `mb` |
| `raspberrypi.piTFT24.js:52-56` | `hathole1`-`hathole4` | the Hat `mb` |
| `raspberrypi.cameraModule.js:62-65` | `hole0`-`hole3` | the camera board |

The other `raspberrypi.*` recipes (`hyperPixel4Rectangular`, `miniPiTFT`,
`touchScreen2`, `touchDisplay7inch`, `hatStandoff`, `spacer`) also mention holes. Check
each one to see whether it has a board that V1's `combine()` drilled, rather than
assuming the table above is complete.

## Affected files

- `src/core/kernel/recipes/raspberrypi.bplus.js` (the module doc's "Mounting holes are
  parts, not holes" section, `bplus()` at `:640-673`, `addFanHoles` at `:573-604`)
- `src/core/kernel/recipes/raspberrypi.hat.js`
- `src/core/kernel/recipes/raspberrypi.piTFT22.js`
- `src/core/kernel/recipes/raspberrypi.piTFT24.js`
- `src/core/kernel/recipes/raspberrypi.cameraModule.js`
- any of the remaining `raspberrypi.*.js` recipes the audit above finds
- each recipe's `.spec.js`, plus `raspberrypi.piTFT22.spec.js`, which asserts
  "undrilled" today
- `src/core/kernel/recipes/rpi-recipe-kit.js` only if a small helper removes
  duplication (see Proposed fix)

## Proposed fix

Subtract the hole cylinders from **the board part only**, not from the whole assembly
the way V1's `combine()` did. This needs no schema change: `rpi-recipe-kit`'s
`builder.placeBoolean` already emits a named, coloured `boolean.subtract` record, and
`raspberrypi.cameraModule.js:422-431` (`bottom-nogo`) is the working precedent for a
named part defined as "unnamed base minus unnamed cutters."

For `bplus`:

1. Place the undrilled plate as an unnamed intermediate (`builder.place(plate, null)`)
   rather than as `'mb'`. Keep running every `chain(...).snap(mb, ...)` measurement
   against it. Subtraction doesn't change the board's bounding box, so none of the
   existing datums move.
2. Keep placing `hole1`-`hole4` (and `fan1hole`/`fan2hole`) as they are today: hidden,
   named, orange. **They must stay addressable.** `ACCEPTANCE.md` scenario 3 snaps a
   Camera Module onto the Pi's mounting holes, `piTFT24` aligns its spacers onto
   `hathole*`, and `ui-047` lists them as Subtract operands.
3. Emit a `placeBoolean({ id: 'mb', op: 'boolean.subtract', target: <plate id>,
   operands: [<hole ids>], name: 'mb', ...v1ColorToRecord('green', 0.75) })` so the
   visible, named `mb` sub-part is the drilled board and keeps its translucent green.

Decisions the implementer must make and state, not assume:

- **Fan holes on Pi 5.** Check whether V1's `bplus.js:769-805` put `fan1hole`/`fan2hole`
  into `group.holes` or only added them as parts. Drill them only if V1 did. Either
  way, record the answer in the module doc.
- **Only the board, never the whole assembly.** V1's whole-assembly subtraction also
  carved the micro-USB shell, which overlaps `hole1` (the existing module doc already
  says so). Keep that divergence and say so in the rewritten doc section.
- **Record ids.** If any existing record uses `mb`'s old final record id as a `target`
  or operand, re-point it. Diff the full expansion before and after (`core-025`'s
  byte-identical-expansion sweep) and confirm the *only* changes are the new plate
  intermediate and the `mb` record turning into a `boolean.subtract`.
- **Helper or not.** If the same three steps repeat verbatim in five or more recipes,
  a small `drilledBoard(builder, plate, holes, name, colour)` in `rpi-recipe-kit.js` is
  justified. If each recipe's shape differs, keep it inline and don't force a helper.

Rewrite each recipe's "Mounting holes are parts, not holes" doc section to describe
the new behaviour ("holes are drilled through the board and also kept as hidden named
parts for snapping and booleans"). Don't delete the V1 rationale.

## Interaction model

No new control. This changes what an existing Library drop renders.

- **Precondition** — n/a (unchanged: nothing needs to be selected to drag a Library row).
- **Trigger** — unchanged: drag a Raspberry Pi row from the Library panel into the viewport.
- **Feedback** — the dropped board now shows through-holes at its mounting positions,
  visible from above and below, and you can see through them to the grid.
- **Placement** — unchanged (drag-to-place).
- **Selection response** — unchanged. Selecting the board's `mb` sub-part still shows
  it in the Inspector. `hole1`-`hole4` still appear under **Hidden parts** (`ui-047`).
- **Selection count** — n/a.
- **Small-screen behavior** — same as desktop.

## Documentation

- **Page** — update the Raspberry Pi / Library section of the existing docs. Check
  `docs/primitive-placement.md` and `docs/snap-align.md` for where Library parts are
  described today. If neither covers the Pi boards, add a short "Raspberry Pi boards"
  subsection to `docs/primitive-placement.md`.
- **Example** — "Drag **Raspberry Pi 5** from the Library panel into the viewport. The
  board shows its four 2.75 mm mounting holes (plus two fan-mount holes on a Pi 5).
  To use a hole as a snap target, drag a Camera Module toward it. To cut matching
  holes into your own case, select the Pi, open **Hidden parts** in the Inspector,
  and tap `hole1` to use it as a Subtract operand." Check the diameter against
  `MOUNTING_HOLES_MM.diameterMm` in `src/core/kernel/tables/rpi-parts.js` before
  publishing it.

## Effort

M: mechanical once the `bplus` pattern is settled, but spread across five or more
recipes, each with its own spec and V1-diff fixtures to update.

## Testing

- **Unit (per recipe `.spec.js`)**: the named board record is a `boolean.subtract` whose
  operands are the hole parts. The evaluated board's volume equals the undrilled
  plate's volume minus `n × π·r²·t`, where `t` is the board thickness (1.32 mm for
  `bplus`), asserted with `toBeCloseTo` at a tolerance matched to the cylinder's
  segment count. A point at each hole centre is outside the board; a point just
  outside each hole radius is inside it. The hole parts are still present, hidden, and
  named exactly as before. Replace `raspberrypi.piTFT22.spec.js`'s "undrilled"
  assertion; don't delete it silently.
- **Degenerate case**: a hole that overlaps the board edge (none should, but assert the
  board stays one connected, manifold solid after subtraction for every model variant
  `2 | 3 | 4 | 5`).
- **`core-025` byte-identical-expansion sweep**, re-run across every `raspberrypi.*`
  variant. The expected diff is limited to the board records described in Proposed
  fix, and any other change is a regression.
- **E2E**: extend the existing app-level spec that drops a Raspberry Pi from the
  Library (find it under `e2e/` by searching for `raspberrypi`), or add
  `e2e/rpi-mounting-holes.e2e.js`. Navigate to `/`, drop a Raspberry Pi 5, and assert
  that a raycast straight down through a hole centre (via the app's existing picking
  test hook) does **not** hit the board, while one 3 mm away does. Capture a snapshot.
  **Engines: all three** (Chromium/Firefox/WebKit), because this changes kernel output
  and rendered geometry. Viewports: laptop plus phone is enough, since small-screen
  behaviour is unchanged.
- **Acceptance scenarios to re-drive**: **3** (snap-placement of a kit assembly). This
  is the critical one, because the camera module must still snap to the Pi's holes
  after `mb` becomes a boolean. Also re-drive **5** (hidden-part boolean: the holes
  must still be listed and usable as Subtract operands), **13** (recolour the `mb`
  sub-part and Reset back to translucent green), and **1** (two independent bodies).
- **Closed findings to re-run**: `core-020` (composite absorbs earlier bodies) against a
  drilled `raspberrypi.bplus`, since this adds a boolean inside a composite expansion.
  Also `core-024` (boolean sub-part operand addressing), because `mb` is now itself a
  boolean result that a user may pick as an operand. Re-run `core-033`'s colour checks
  on `mb` too.
