// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `raspberrypi.hyperPixel4Rectangular` composite recipe — Pimoroni's HyperPixel 4
 * rectangular display, expanded **standalone**.
 *
 * Reproduces `jscad-raspberrypi@62a8e3b`'s `HyperPixel4Rectangular(rpi)`
 * (`src/hyper-pixel-4-rectangular.js:17-64`). The `rpi` parameter is dropped per
 * `docs/decisions/composite-recipe-geometry.md`'s Family B requirement: V1 uses it
 * only for `:57-59`'s closing `align('pad1', rpi.parts.hole1, 'xy')` /
 * `snap('pad1', rpi.parts.mb, 'z', 'outside-')`, which is the user's own `ui-026`
 * Snap/Align step between two independently placed bodies. Calling V1 with no argument
 * skips exactly that block.
 *
 * ## The turn is *not* part of the dropped attachment
 *
 * `:55`'s `group.rotate('mb', 'z', 180)` sits **before** the `if (rpi)` guard and
 * applies whether or not a board was passed, so it is ordinary internal geometry and
 * is ported as such — one `transform.rotate` record per part, about the board's own
 * bounding-box centre. (`transform.rotate`'s `center` defaults to the world origin,
 * which here happens to coincide in x and y because the board is centred; it is passed
 * explicitly anyway, per `core-015`'s retirement note, so the record says what it
 * means rather than relying on that coincidence.)
 *
 * The turn is why every pad's offset from `pad1` comes out negated relative to the
 * clone offsets V1 writes at `:46-51`: the clones are made first and the whole group
 * is turned afterwards.
 *
 * `Group.rotate` is documented as mutating (`jscad-utils/src/group.js:246-272`) — the
 * trap `core-016` had to reckon with — but nothing here clones after it, so the
 * mutation has no observable consequence and no `clone()`-ordering question arises.
 *
 * ## The board is a real subtraction
 *
 * `:27`'s `board.subtract(notch)` takes a rounded-rectangle bite out of one long edge.
 * The notch is snapped to the board's `inside-` and then `inside+` on **x** in
 * consecutive calls (`:23-24`); the second wins, so the first is dead code in V1 and
 * is not reproduced. Both calls are on the same axis, which is what makes that safe to
 * say rather than guess.
 *
 * **Opaque colours ported (TODO/core-033)**: `lcd` is V1's `:29` `.color('black')`.
 * `pad1`-`pad4` are `rpi-parts.js`'s `Mountingpad`, which is `.color('yellow')`.
 *
 * @module core/kernel/recipes/raspberrypi.hyperPixel4Rectangular
 */

import { v1ColorToRecord } from '../colors.js'
import {
  booleanPart,
  centeredCuboidPart,
  centreOf,
  chain,
  clonePart,
  createBuilder,
  cylinderPart,
  roundedCubePart,
  turnAboutZ,
} from './rpi-recipe-kit.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */
/** @typedef {import('./rpi-recipe-kit.js').Part} Part */
/** @typedef {[number, number, number]} Vec3Mm */

/** Every dimension `hyper-pixel-4-rectangular.js` states, in its own order. */
export const HYPERPIXEL4_MM = Object.freeze({
  /** `:21` — `Parts.Cube({x: 97.85, y: 58.14, z: 1.65}).Center()`. */
  xMm: 97.85,
  yMm: 58.14,
  thicknessMm: 1.65,

  /** `:22` — `Parts.RoundedCube(10.1, 58.14 - 4.57 * 2, 1.65, 1.5)`. */
  notchXMm: 10.1,
  notchYMm: 58.14 - 4.57 * 2,
  notchCornerRadiusMm: 1.5,
  /** `:26` — the notch is pushed 2mm back in from the edge it was snapped to. */
  notchInsetMm: 2,
  /**
   * Where the notch ends up in x once `:55`'s 180-degree turn has been applied — the
   * only observable consequence of that turn on the board, since the outline itself is
   * symmetric. Derived: snapped to the board's +x face, pushed 2mm further out, then
   * mirrored about the board's centre.
   *
   * @type {readonly [number, number]}
   */
  notchXSpanAfterTurnMm: Object.freeze(
    /** @type {[number, number]} */ ([
      -(97.85 / 2 + 2),
      -(97.85 / 2 + 2 - 10.1),
    ])
  ),

  /** `:30` — `Parts.Cube({x: 97.1, y: 58.44, z: 6.84 - 1.65})`. */
  lcdXMm: 97.1,
  lcdYMm: 58.44,
  lcdZMm: 6.84 - 1.65,
  /** `:36` — lifted half a millimetre clear of the board after the snap. */
  lcdLiftMm: 0.5,

  /** `:41` — `Mountingpad(5.5, 22.78 - 5.8)`: V1 names the first argument `radius`
   * and uses it as a diameter (`rpi-parts.js:36`), so it is spelled as one here. */
  padDiameterMm: 5.5,
  padHeightMm: 22.78 - 5.8,
  /** `:44` — the pad's offset in from the corner it was snapped to. */
  padOffsetMm: Object.freeze(
    /** @type {[number, number, number]} */ ([-15.35 + (5.5 - 2), -4.57 + (5.5 - 2), 0])
  ),
})

/**
 * `:46-51` — each pad's clone offset from pad 1, *before* the group is turned. The
 * spec asserts the negated values, which is what the turn produces.
 *
 * @type {readonly Vec3Mm[]}
 */
export const PAD_OFFSETS_MM = Object.freeze([
  /** @type {Vec3Mm} */ ([0, 0, 0]),
  /** @type {Vec3Mm} */ ([-58, 0, 0]),
  /** @type {Vec3Mm} */ ([0, -49, 0]),
  /** @type {Vec3Mm} */ ([-58, -49, 0]),
])

/** `:55` — the whole group turns half a revolution about the board. */
const TURN_DEG = 180

/**
 * Expand a `raspberrypi.hyperPixel4Rectangular` document line into op records.
 *
 * Takes no parameters: V1's only argument was the `rpi` board, and dropping it is this
 * recipe's whole point.
 *
 * @param {Record<string, any>} [params] Ignored; this screen has no variants.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
export function hyperPixel4Rectangular(params = {}) {
  void params
  const builder = createBuilder()

  const slab = centeredCuboidPart('mb.slab', [
    HYPERPIXEL4_MM.xMm,
    HYPERPIXEL4_MM.yMm,
    HYPERPIXEL4_MM.thicknessMm,
  ])

  const notch = roundedCubePart(
    'mb.notch',
    HYPERPIXEL4_MM.notchXMm,
    HYPERPIXEL4_MM.notchYMm,
    HYPERPIXEL4_MM.thicknessMm,
    HYPERPIXEL4_MM.notchCornerRadiusMm
  )
  // `:23-25`. The `inside-` snap on x at `:24` is immediately overwritten by the
  // `inside+` on the same axis at `:25`, so only the second is ported.
  chain(notch)
    .align(slab, 'y')
    .snap(slab, 'x', 'inside+')
    .translate([HYPERPIXEL4_MM.notchInsetMm, 0, 0])

  const board = booleanPart(builder, 'mb', 'subtract', [slab, notch])

  const lcd = centeredCuboidPart('lcd', [
    HYPERPIXEL4_MM.lcdXMm,
    HYPERPIXEL4_MM.lcdYMm,
    HYPERPIXEL4_MM.lcdZMm,
  ])
  // `:32-36` aligns the LCD on the *slab* and then applies a snap vector computed on
  // the unmoved LCD. The two act on disjoint axes, so chaining is the same move.
  chain(lcd)
    .align(slab, 'xy')
    .snap(slab, 'z', 'outside-')
    .translate([0, 0, HYPERPIXEL4_MM.lcdLiftMm])

  const pad1 = cylinderPart('pad1', HYPERPIXEL4_MM.padDiameterMm, HYPERPIXEL4_MM.padHeightMm, {
    frame: 'center',
  })
  chain(pad1)
    .snap(slab, 'z', 'outside+')
    .snap(slab, 'xy', 'inside+')
    .translate(HYPERPIXEL4_MM.padOffsetMm)

  const pads = PAD_OFFSETS_MM.map((offsetMm, index) => {
    if (index === 0) return pad1
    const pad = clonePart(`pad${index + 1}`, pad1)
    chain(pad).translate(offsetMm)
    return pad
  })

  // `:55` — the turn, about the *board's* own bounding-box centre. Applied to every
  // part, including the board itself.
  const pivotMm = centreOf(board)
  for (const part of [board, lcd, ...pads]) turnAboutZ(part, pivotMm, TURN_DEG)

  // V1 `src/hyper-pixel-4-rectangular.js:27`:
  // `group.add(board.subtract(notch).color('green', 0.75), 'mb')` (TODO/core-026).
  builder.place(board, 'mb', v1ColorToRecord('green', 0.75))
  // V1 `:29`: `Parts.Cube({...}).color('black')` (TODO/core-033).
  builder.place(lcd, 'lcd', v1ColorToRecord('black'))
  // V1 `rpi-parts.js:44`: `Mountingpad(...).color('yellow')` (TODO/core-033).
  pads.forEach((pad, index) => builder.place(pad, `pad${index + 1}`, v1ColorToRecord('yellow')))

  return builder.build()
}
