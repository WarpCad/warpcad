// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `raspberrypi.touchDisplay7inch` composite recipe — the official Raspberry Pi
 * 7-inch touch display, expanded **standalone**.
 *
 * ## What it reproduces, and the one thing it deliberately does not
 *
 * `jscad-raspberrypi@62a8e3b`'s `TouchDisplay_7inch(rpi)`
 * (`src/touch-display-7inch.js:16-156`).
 *
 * `docs/decisions/composite-recipe-geometry.md`'s Family B table lists this factory as
 * taking a **required** external board parameter, and this recipe is where that
 * decision's requirement actually bites: **the `rpi` parameter is dropped.** Every
 * remaining reference to it inside V1's body is `debug()` output, except the last two
 * lines — `:152-154`'s `align('piMountingPad1', rpi.parts.hole1, 'xy')` and
 * `snap('piMountingPad1', rpi.parts.mb, 'z', 'outside+')`. Those are not geometry; they
 * are an *assembly step* between two independently placed bodies, and this project
 * already ships that step as a user-facing control: `ui-026`'s Snap/Align operation,
 * sub-part addressed as `{ id, pieces: 'piMountingPad1' }` exactly as `core-013`'s
 * `{ id, pieces }` shape supports.
 *
 * So this recipe emits the screen and stops. A caller who wants V1's assembled result
 * appends two records of their own once both bodies exist:
 *
 * ```js
 * { op: 'group.align', operands: [{ id: screenId, pieces: 'piMountingPad1' },
 *                                 { id: rpiId, pieces: 'hole1' }], params: { axes: 'xy' } }
 * { op: 'group.snap',  operands: [{ id: screenId, pieces: 'piMountingPad1' },
 *                                 { id: rpiId, pieces: 'mb' }],
 *   params: { axes: 'z', orientation: 'outside+' } }
 * ```
 *
 * That is checked, not asserted: `raspberrypi.touchDisplay7inch.spec.js` applies both
 * transforms to this recipe's own output and compares against real V1 bounds.
 *
 * ## The frame
 *
 * V1's `lens` is a bare `Parts.RoundedCube`, which sits with its minimum corner on the
 * origin, and nothing moves it before the dropped attachment step. This port keeps that
 * frame, so every number in the V1 source reads across unchanged. The attachment step
 * is a pure rigid translation, which is what makes "drop the board parameter" a change
 * of frame and nothing else — and what lets the spec compare lens-relative offsets
 * against a fixture captured in V1's board-attached frame.
 *
 * ## `Group.rotate` mutates, which the TODO's own Proposed fix missed
 *
 * `TODO/core-016` says only `screenMountingPad1` is turned. It is not:
 * `JsCadUtilsGroup.prototype.rotate` is documented "This mutates the group"
 * (`jscad-utils/src/group.js:246-272`), and `touch-display-7inch.js:69` turns the
 * shared `screenMountingPad` **before** `:75`, `:81` and `:87` clone it — so all four
 * clones inherit the turn, and an 8 x 12 pad measures 12 x 8 on every one. The
 * companion recipe `raspberrypi.touchScreen2` calls `clone()` *first* and therefore
 * turns only two of its four; same method, opposite outcome, which is why both are
 * measured against a real V1 execution fixture rather than read off the sources.
 *
 * The turn is about the *hole's* centroid, which `align(pad, 'xy')` has already put at
 * the pad's own centre. Two consequences worth stating because they change what can be
 * tested: the hole does not move at all (it is the pivot), and its bounding box does
 * not change either (a 32-segment cylinder turned 90 degrees is exactly itself). The
 * TODO's suggested check — measure the hole's bounding box — therefore cannot detect
 * the rotation. The pad's swapped extents can, and that is what the spec measures.
 *
 * Because a rotation about a pivot commutes with a translation applied to both —
 * `R_{P+t}(x + t) = R_P(x) + t` — each pad is emitted independently as
 * cuboid → translate → rotate-about-its-own-pivot, rather than as V1's
 * rotate-then-clone-then-translate. Same geometry, one record chain per pad, and no
 * shared mutable state to reason about.
 *
 * ## Two deliberate narrowings from V1
 *
 * **`dimCheck` is dropped**, the same call and the same reasoning as `core-014`'s and
 * `core-015`'s: `:19,52-66,134` build a hidden `Group('DimensionCheck')` of two
 * coloured 1 mm rulers, added hidden, referenced by nothing, rendering nothing.
 * Development scaffolding, not geometry.
 *
 * **V1's duplicate pad entry is not reproduced.** `Group.add(group, name, hidden,
 * subparts)` stores the combined group under `name` *and* every leaf under
 * `subparts + key` (`jscad-utils/src/group.js:83-103`), so V1's parts dictionary holds
 * both `screenMountingPad1` and `screenMountingPad1pad` for the same solid — the hole
 * is hidden, so `combine()` returns the pad alone. This port emits one part.
 * `piMountingPad1` is the case where the combined entry is genuinely different, since
 * its group has two visible members, so that one is emitted as a `boolean.union` over
 * two hidden leaves — `hardware.bolt.js`'s `tap` shape, and `raspberrypi.bplus.js`'s,
 * now the kit's `builder.placeUnion` (`rpi-recipe-kit.js`).
 *
 * @module core/kernel/recipes/raspberrypi.touchDisplay7inch
 */

import { v1ColorToRecord } from '../colors.js'
import {
  centreOf,
  chain,
  createBuilder,
  cuboidPart,
  cylinderPart,
  move,
  roundedCubePart,
  turnAboutZ,
} from './rpi-recipe-kit.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */
/** @typedef {import('./rpi-recipe-kit.js').Part} Part */
/** @typedef {import('./rpi-recipe-kit.js').Builder} Builder */
/** @typedef {[number, number, number]} Vec3Mm */

/** `touch-display-7inch.js:21` — `Parts.RoundedCube(192.96, 110.76, 0.7, 8)`. */
const LENS_MM = Object.freeze({ xMm: 192.96, yMm: 110.76, thicknessMm: 0.7, cornerRadiusMm: 8 })

/** `:24,26` — `backPlateZ` and the plate it sizes. */
const BACK_PLATE_MM = Object.freeze(/** @type {Vec3Mm} */ ([166.2, 100.6, 5.96]))

/** `:30` — the plate's offset from the lens corner it is snapped into. */
const BACK_PLATE_OFFSET_MM = Object.freeze(/** @type {Vec3Mm} */ ([11.89, 3.53, 0]))

/** `:37,45` — the screen mounting pad and the hole through it. */
const SCREEN_PAD_MM = Object.freeze(/** @type {Vec3Mm} */ ([8, 12, 2.5]))
const PAD_HOLE_DIAMETER_MM = 3
const PAD_HOLE_HEIGHT_MM = 10

/** `:41` — where pad 1 sits, measured in from the backPlate's minimum corner. */
const SCREEN_PAD_ORIGIN_MM = Object.freeze(/** @type {Vec3Mm} */ ([20, 20, 0]))

/**
 * `:75,81,87` — each screen mounting pad's offset from pad 1. Exported because the
 * spec asserts the clone offsets against this list rather than restating them.
 *
 * @type {readonly Vec3Mm[]}
 */
export const SCREEN_MOUNTING_PAD_OFFSETS_MM = Object.freeze([
  /** @type {Vec3Mm} */ ([0, 0, 0]),
  /** @type {Vec3Mm} */ ([0, 65.65, 0]),
  /** @type {Vec3Mm} */ ([126.2, 0, 0]),
  /** @type {Vec3Mm} */ ([126.2, 65.65, 0]),
])

/** `:95,104` — the Pi mounting pad and the post standing on it. */
const PI_PAD_MM = Object.freeze(/** @type {Vec3Mm} */ ([8, 12, 2.5]))
const PI_POST_DIAMETER_MM = 6
const PI_POST_HEIGHT_MM = 13.25

/** `:99` — where Pi pad 1 sits, in from the backPlate's minimum corner. */
const PI_PAD_ORIGIN_MM = Object.freeze(/** @type {Vec3Mm} */ ([48.45, 30.8, 0]))

/**
 * `:114,121,128` — each Pi mounting pad's offset from pad 1.
 *
 * @type {readonly Vec3Mm[]}
 */
export const PI_MOUNTING_PAD_OFFSETS_MM = Object.freeze([
  /** @type {Vec3Mm} */ ([0, 0, 0]),
  /** @type {Vec3Mm} */ ([58, 0, 0]),
  /** @type {Vec3Mm} */ ([0, 49.0, 0]),
  /** @type {Vec3Mm} */ ([58, 49.0, 0]),
])

/**
 * `:139,144` — the power-jumper clearance marker. 1 mm tall, matching V1's
 * `{ x: 15, y: 10, z: 1 }` (TODO/render-005 once suspected 7 mm; it was misread). Unlike its TouchScreen2
 * namesake this one is the ordinary case: every reference is to this screen's own
 * `backPlate`, so nothing about it needs the dropped `rpi`.
 */
const NO_GO_POWER_MM = Object.freeze({
  sizeMm: /** @type {Vec3Mm} */ ([15, 10, 1]),
  offsetMm: /** @type {Vec3Mm} */ ([48.45 + 3, 30.8 + 49.0, 0]),
})

/**

/**
 * Expand a `raspberrypi.touchDisplay7inch` document line into the op records that
 * define it.
 *
 * Takes no parameters: V1's only argument was the `rpi` board, and dropping it is this
 * recipe's whole point (see the module doc). The signature keeps the `params` argument
 * every recipe has so the registry can call it uniformly.
 *
 * @param {Record<string, any>} [params] Ignored; this screen has no variants.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
export function touchDisplay7inch(params = {}) {
  void params

  const builder = createBuilder()

  const lens = roundedCubePart(
    'lens',
    LENS_MM.xMm,
    LENS_MM.yMm,
    LENS_MM.thicknessMm,
    LENS_MM.cornerRadiusMm
  )
  // V1 `:21` — `.color('black')` (TODO/core-033).
  builder.place(lens, 'lens', v1ColorToRecord('black'))

  const backPlate = cuboidPart('backPlate', BACK_PLATE_MM)
  chain(backPlate)
    .snap(lens, 'xy', 'inside-')
    .snap(lens, 'z', 'outside-')
    .translate(BACK_PLATE_OFFSET_MM)
  // V1 `:27` — `.color('gray')` (TODO/core-033).
  builder.place(backPlate, 'backPlate', v1ColorToRecord('gray'))

  SCREEN_MOUNTING_PAD_OFFSETS_MM.forEach((cloneOffsetMm, index) => {
    const n = index + 1
    const pad = cuboidPart(`screenMountingPad${n}`, SCREEN_PAD_MM)
    chain(pad)
      // V1's own `-8 / 2` and `-12 / 2` deltas (`:38-39`): the pad is snapped half its
      // own width *outside* the plate corner before being walked back in by `:41`.
      .snap(backPlate, 'x', 'inside-', -SCREEN_PAD_MM[0] / 2)
      .snap(backPlate, 'y', 'inside-', -SCREEN_PAD_MM[1] / 2)
      .snap(backPlate, 'z', 'outside-')
      .translate(SCREEN_PAD_ORIGIN_MM)

    const hole = cylinderPart(`screenMountingPad${n}hole`, PAD_HOLE_DIAMETER_MM, PAD_HOLE_HEIGHT_MM)
    chain(hole).align(pad, 'xy').snap(pad, 'z', 'outside-')

    move([pad, hole], /** @type {Vec3Mm} */ ([...cloneOffsetMm]))
    // All four, not just pad 1 — see the module doc on `Group.rotate` mutating. The
    // hole is the pivot, so it neither moves nor changes shape; only the pad does.
    turnAboutZ(pad, centreOf(hole), 90)

    // V1 `:42` — the pad is `.color('blue')`; `:46` — the hole is `.color('red')`,
    // hidden either way (TODO/core-033).
    builder.place(pad, `screenMountingPad${n}`, v1ColorToRecord('blue'))
    builder.place(hole, `screenMountingPad${n}hole`, { hidden: true, ...v1ColorToRecord('red') })
  })

  PI_MOUNTING_PAD_OFFSETS_MM.forEach((cloneOffsetMm, index) => {
    const n = index + 1
    const pad = cuboidPart(`piMountingPad${n}pad`, PI_PAD_MM)
    chain(pad)
      .snap(backPlate, 'x', 'inside-', -PI_PAD_MM[0] / 2)
      .snap(backPlate, 'y', 'inside-', -PI_PAD_MM[1] / 2)
      .snap(backPlate, 'z', 'outside-')
      .translate(PI_PAD_ORIGIN_MM)

    const post = cylinderPart(`piMountingPad${n}post`, PI_POST_DIAMETER_MM, PI_POST_HEIGHT_MM)
    chain(post).align(pad, 'xy').snap(pad, 'z', 'outside-')

    move([pad, post], /** @type {Vec3Mm} */ ([...cloneOffsetMm]))
    // `pad` (`:100`) is green, `post` (`:105`) is silver — placed on each hidden leaf
    // before the union, same as `raspberrypi.bplus.js`'s clearance volumes. They
    // differ, so the union itself (`piMountingPadN`) stays uncoloured (TODO/core-033).
    pad.color = v1ColorToRecord('green').color
    post.color = v1ColorToRecord('silver').color
    // The one assembly here whose combined solid is more than any single member, and
    // the one the dropped attachment step measures — so it is a real union, not a
    // renamed pad.
    builder.placeUnion(`piMountingPad${n}`, [pad, post])
  })

  const noGoPower = cuboidPart('noGoPower', NO_GO_POWER_MM.sizeMm)
  chain(noGoPower)
    .snap(backPlate, 'x', 'inside-')
    .snap(backPlate, 'y', 'inside-')
    .snap(backPlate, 'z', 'outside-')
    .translate(NO_GO_POWER_MM.offsetMm)
  // V1 adds this one visible (`:147`'s `false`) and `.color('red')` (`:140`). TODO/render-005
  // hides it by default instead — the same deliberate divergence TODO/render-004 made for
  // `hardware.bolt`'s `tap` and `hardware.washer`'s `clearance`: a clearance volume is for
  // a boolean subtract, not to look at. The colour is kept, so it still reads as a keep-out
  // when shown.
  builder.place(noGoPower, 'noGoPower', { ...v1ColorToRecord('red'), hidden: true })

  return builder.build()
}
