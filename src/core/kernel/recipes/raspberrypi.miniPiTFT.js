// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `raspberrypi.miniPiTFT` composite recipe — Adafruit's 135x240 Mini PiTFT,
 * expanded **standalone**.
 *
 * Reproduces `jscad-raspberrypi@62a8e3b`'s `miniPiTFT(options, piMotherBoard)`
 * (`src/miniPiTFT.js:81-187`, plus its local `boardButton` and `buttonCap` helpers).
 * The `piMotherBoard` parameter is dropped per
 * `docs/decisions/composite-recipe-geometry.md`'s Family B requirement: V1 uses it for
 * one thing, the `:95-101` attachment translate, and that is the user's own `ui-026`
 * Snap/Align step between two independently placed bodies. Calling V1 with the
 * argument omitted skips exactly that block, which is why this port's output is
 * comparable to real V1 output absolutely rather than relative to some datum.
 *
 * ## The board: two chained bisects, and why they are subtractions here
 *
 * `:90-93` is
 *
 * ```js
 * Parts.RoundedCube(inch(2), inch(1), 2, 2)
 *   .bisect('x',  inch(1.5)).parts.negative
 *   .bisect('y', -inch(0.96)).parts.positive
 * ```
 *
 * **`TODO/core-017` asked first whether a composite can address one of its own nested
 * records' sub-parts. It can not, and the reason is not the one the task expected.**
 * Probed against `kernel/index.js` directly:
 *
 *  - A record inside a composite's expansion *can* reference a sibling record by bare
 *    id. `core-020`'s isolation fix walls the expansion off from the **caller's**
 *    `initial` state, not from itself; the nested `evaluate` still threads one shared
 *    `byId` through its own records exactly like the document fold.
 *  - `{ id, pieces }` addressing also resolves inside that nested fold — but only for
 *    `group.snap`/`group.align`. `index.js:147-159` rejects a `pieces` operand on any
 *    entry that is not `rawOperands`, and `modify.bisect` is a plain `native(1, …)`.
 *    The restriction belongs to the **op**, identically at document level and inside a
 *    composite; it is not a nesting limitation and no fold change would lift it.
 *  - Referencing the bisect group by **bare id** instead is worse than the error:
 *    `toGeom3` combines `negative` and `positive` back together, so the second cut
 *    would silently receive the whole uncut slab. The fold's explicit throw is what
 *    stops that, and it is right to throw.
 *
 * So this recipe takes the fallback `TODO/core-017` itself sanctions — and the
 * fallback is exact, not an approximation. `group.js`'s `bisect` (`:808-851`) does not
 * cut against a plane: it builds one axis-aligned box covering the half-space past the
 * cut and `intersect`s or `subtract`s with it. Keeping the `negative` half *is* that
 * subtraction. So the two chained bisects port as two `boolean.subtract`s against the
 * same two half-space boxes `bisect` would have built (`halfSpaceCutter` in the kit),
 * giving bit-identical geometry with no new addressing and no fold change.
 *
 * Because no fold change was needed, `core-020`'s closed finding is not on this task's
 * regression surface after all — see the retirement note.
 *
 * The shape this produces is worth stating plainly, because the task file describes it
 * as an "L-shaped notch" and it is not one: both cuts are straight and each removes a
 * whole slab, so the result is a plain 38.1 x 24.384 rectangle whose two *left* corners
 * are still rounded (the lower one truncated by the y cut) and whose two right corners
 * are square. The L is in how the cuts are *specified*, not in the board.
 *
 * ## `stretch` and `chamfer`, the two ops this recipe cannot call directly
 *
 * **`.stretch('z', 5)` needs no op, confirmed rather than assumed.** `:125`'s
 * `display-clearance` applies `jscad-utils`' `stretch` (`util.js:1314-1324`, wrapping
 * `@jscad/csg`'s `stretchAtPlane`: cut the solid at a plane, insert `distance` of
 * material, translate one side) to `g.parts.display` — a plain, feature-less cuboid
 * this same recipe built nine lines earlier, with nothing inside it for the inserted
 * material to interact with. On such a box, inserting 5mm at a cut plane is
 * bit-for-bit the same solid as building the box 5mm taller in the first place, so the
 * stretched size is computed analytically and one correctly-sized `primitive.cuboid`
 * is emitted. Checked at this call site, which is the only `stretch` in this recipe;
 * the equivalence holds because the target is a just-built plain box and should be
 * re-checked, not assumed, at any future call site.
 *
 * **`.chamfer(-5, 'z+')` is a different matter, and `TODO/core-017` missed it.** The
 * task's Proposed fix reads `:123-127` as a bare stretch and asks for "one correctly-
 * sized `primitive.cuboid`". That would be 10mm too small in x and in y. V1's
 * `util.chamfer` builds its far slice as `enlarge(slice, [-radius * 2, -radius * 2])`
 * (`jscad-utils/src/util.js:1608-1624`), and `util.enlarge` adds an absolute delta to
 * each dimension — so a **negative** radius flares the face outward instead of
 * bevelling it inward, and the clearance volume is a frustum 10mm wider at the top
 * than the display it protects. For a clearance volume that is a functional error, not
 * a cosmetic one, so `modify.chamferRim` was taught V1's negative-radius semantics
 * (see `fillet.js`) rather than the geometry being approximated away.
 *
 * `buttonCap`'s `Parts.Cylinder(4, 3).fillet(1, 'z+')` (`:44`) needed no such work:
 * that is `modify.filletRim`'s own signature, unchanged.
 *
 * ## Two narrowings from V1, both stated rather than silent
 *
 * **V1's duplicate leaf entries are collapsed.** `Group.add(group, name, hidden,
 * subparts)` stores the combined group under `name` *and* every leaf under
 * `subparts + key`. A `buttonCap` group has exactly one visible member, so V1's
 * `buttonCap1` and `buttonCap1-cap` are the same solid; this port emits one part,
 * under the shorter name. `button1` is the opposite case — the union is genuinely more
 * than either leaf — so `button1`, `button1-base` and `button1-push` are all emitted,
 * as V1 has them. Same call `core-016` made.
 *
 * **Opaque colours ported (TODO/core-033)**. This file is the TODO's own canonical
 * example of the "differently coloured V1 solids feeding one part" case: `:59-60`
 * colours `clearanceFlange`'s cut half `.color('green')` and `clearanceBody`
 * `.color('yellow')` *before* unioning them with no recolour after, so each
 * `buttonCapN-clearance` stays uncoloured here, same as `buttonN` (`base` is silver,
 * `push` is black, `:16-29`).
 *
 * @module core/kernel/recipes/raspberrypi.miniPiTFT
 */

import { v1ColorToRecord } from '../colors.js'
import {
  booleanPart,
  chain,
  createBuilder,
  cuboidPart,
  cylinderPart,
  halfSpaceCutter,
  inchToMm,
  modifyPart,
  roundedCubePart,
  tubePart,
} from './rpi-recipe-kit.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */
/** @typedef {import('./rpi-recipe-kit.js').Builder} Builder */
/** @typedef {import('./rpi-recipe-kit.js').Part} Part */

/** `:90-93` — the rounded slab and the two straight cuts taken out of it. */
export const MINI_BOARD_MM = Object.freeze({
  xMm: inchToMm(2),
  yMm: inchToMm(1),
  thicknessMm: 2,
  cornerRadiusMm: 2,
  /** `bisect('x', inch(1.5))`, keeping the negative half: everything below this x. */
  xCutMm: inchToMm(1.5),
  /** `bisect('y', -inch(0.96))`, keeping the positive half. A negative offset
   * measures back from the *maximum* face, so the cut lands at `yMm - yCutBackMm`. */
  yCutBackMm: inchToMm(0.96),
})

/** `:105-110` and `:114-119` — the white screen carrier and the black active area. */
const SCREEN_MM = Object.freeze(/** @type {[number, number, number]} */ ([31, 18, 2]))
const DISPLAY_MM = Object.freeze(
  /** @type {[number, number, number]} */ ([inchToMm(0.98), inchToMm(0.58), 2.01])
)
const DISPLAY_INSET_X_MM = inchToMm(0.34)
const DISPLAY_INSET_Y_MM = -inchToMm(0.32)

/** `:123-127` — how far the clearance volume rises above the display, and flares out. */
const CLEARANCE_RISE_MM = 5
const CLEARANCE_CHAMFER_MM = -5

/** `:16-30` — one tactile button: a base block with a round push on top. */
const BUTTON_BASE_MM = Object.freeze(/** @type {[number, number, number]} */ ([6.5, 6.5, 2]))
const BUTTON_PUSH_DIAMETER_MM = 3
const BUTTON_PUSH_HEIGHT_MM = 1

/** `:132-146` — each button's y midline. */
export const BUTTON_MIDLINES_MM = Object.freeze([inchToMm(0.53), inchToMm(0.18)])

/** `:41-66` — the printable cap over each button, and its clearance volume. */
const CAP_MM = Object.freeze({
  bodyDiameterMm: 4,
  bodyHeightMm: 3,
  filletRadiusMm: 1,
  flangeDiameterMm: 6,
  flangeHeightMm: 0.5,
  /** `bisect('x', -0.5).parts.negative` — a flat cut 0.5mm in from the +x face. */
  flangeCutBackMm: -0.5,
  clearanceFlangeDiameterMm: 7,
  clearanceFlangeHeightMm: 0.75,
  clearanceBodyDiameterMm: 4.5,
  clearanceBodyHeightMm: 2,
})

/** `:159-166` and `:170-173` — the sprue joining the two caps, plus its clearance. */
const CONNECTOR_MM = Object.freeze(/** @type {[number, number, number]} */ ([1, 5, 0.5]))
const CONNECTOR_GAP_MM = 1
const CONNECTOR_CLEARANCE_MM = Object.freeze(
  /** @type {[number, number, number]} */ ([0.5, 0.5, 0.5])
)

/** `:177-184` — `Parts.Tube(7, 3, 8.5)`: outside diameter, inside diameter, height. */
const STANDOFF_MM = Object.freeze({ outerDiameterMm: 7, innerDiameterMm: 3, heightMm: 8.5 })

/**
 * `:16-30`'s `boardButton`, as three parts: the base, the push, and their union.
 *
 * @param {Builder} builder
 * @param {string} name V1's group name, e.g. `'button1'`.
 * @param {Part} board
 * @param {number} midlineYMm
 * @returns {Part} The union V1 stores under `name`.
 */
function addBoardButton(builder, name, board, midlineYMm) {
  const base = cuboidPart(`${name}-base`, BUTTON_BASE_MM)
  chain(base).snap(board, 'xy', 'inside-').snap(board, 'z', 'outside-').midlineTo('y', midlineYMm)

  const push = cylinderPart(`${name}-push`, BUTTON_PUSH_DIAMETER_MM, BUTTON_PUSH_HEIGHT_MM)
  chain(push).align(base, 'xy').snap(base, 'z', 'outside-')

  // V1 adds the group under `name` *and* both leaves under the `name-` prefix. The
  // union is genuinely more than either leaf, so all three are real parts here.
  // `base` (`:17`) is silver, `push` (`:25`) is black — differ, so the union `name`
  // stays uncoloured, but each leaf carries its own V1 colour (TODO/core-033).
  const button = booleanPart(builder, name, 'union', [base, push])
  builder.place(base, `${name}-base`, { hidden: true, ...v1ColorToRecord('silver') })
  builder.place(push, `${name}-push`, { hidden: true, ...v1ColorToRecord('black') })
  builder.place(button, name)
  return button
}

/**
 * `:41-66`'s `buttonCap`: the cap itself and the hidden clearance volume around it.
 *
 * @param {Builder} builder
 * @param {string} name V1's group name, e.g. `'buttonCap1'`.
 * @param {Part} button The board button this cap sits on.
 * @returns {Part} The cap V1 stores under `name`.
 */
function addButtonCap(builder, name, button) {
  // `Parts.Cylinder(4, 3).fillet(1, 'z+')` — `modify.filletRim`'s own signature.
  const body = cylinderPart(`${name}.body`, CAP_MM.bodyDiameterMm, CAP_MM.bodyHeightMm)
  const rounded = modifyPart(builder, `${name}.rounded`, 'modify.filletRim', {
    radius: CAP_MM.filletRadiusMm,
    orientation: 'z+',
  }, body)

  const flange = cylinderPart(`${name}.flange`, CAP_MM.flangeDiameterMm, CAP_MM.flangeHeightMm)
  const flangeCut = halfSpaceCutter(
    `${name}.flangeCut`,
    flange,
    'x',
    CAP_MM.flangeCutBackMm,
    'negative'
  )
  const flat = booleanPart(builder, `${name}.flat`, 'subtract', [flange, flangeCut])

  // V1 `:43-52` calls `.color('blue')` on the *whole* `rounded.union(flat)` result,
  // after the union — uniform, unlike the clearance below (TODO/core-033).
  const cap = booleanPart(builder, name, 'union', [rounded, flat])
  chain(cap).align(button, 'xy').snap(button, 'z', 'outside-')

  const clearanceFlange = cylinderPart(
    `${name}.clearanceFlange`,
    CAP_MM.clearanceFlangeDiameterMm,
    CAP_MM.clearanceFlangeHeightMm
  )
  const clearanceCut = halfSpaceCutter(
    `${name}.clearanceCut`,
    clearanceFlange,
    'x',
    CAP_MM.flangeCutBackMm,
    'negative'
  )
  const clearanceFlat = booleanPart(builder, `${name}.clearanceFlat`, 'subtract', [
    clearanceFlange,
    clearanceCut,
  ])
  const clearanceBody = cylinderPart(
    `${name}.clearanceBody`,
    CAP_MM.clearanceBodyDiameterMm,
    CAP_MM.clearanceBodyHeightMm
  )
  const clearance = booleanPart(builder, `${name}-clearance`, 'union', [
    clearanceFlat,
    clearanceBody,
  ])
  chain(clearance).align(cap, 'xy').snap(cap, 'z', 'inside-')

  // V1's `buttonCap1` and `buttonCap1-cap` are the same solid — the clearance is
  // hidden, so `combine()` returns the cap alone. One part, under the shorter name.
  builder.place(cap, name, { hidden: true, ...v1ColorToRecord('blue') })
  // `clearanceFlat` (from `clearanceFlange`, green) unioned with `clearanceBody`
  // (yellow) with no recolour after — the module doc's canonical differently-coloured
  // example — so `${name}-clearance` stays uncoloured (TODO/core-033).
  builder.place(clearance, `${name}-clearance`, { hidden: true })
  return cap
}

/**
 * Expand a `raspberrypi.miniPiTFT` document line into the op records that define it.
 *
 * Takes no parameters. V1's `options.hatHeight` fed the dropped attachment translate
 * and nothing else, so it has no meaning standalone and is not carried.
 *
 * @param {Record<string, any>} [params] Ignored; this screen has no variants.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
export function miniPiTFT(params = {}) {
  void params
  const builder = createBuilder()

  // The rounded slab, then the two straight cuts — see the module doc for why these
  // are subtractions rather than chained `modify.bisect` records.
  const slab = roundedCubePart(
    'board.slab',
    MINI_BOARD_MM.xMm,
    MINI_BOARD_MM.yMm,
    MINI_BOARD_MM.thicknessMm,
    MINI_BOARD_MM.cornerRadiusMm
  )
  // `.bisect('x', inch(1.5)).parts.negative` — keep everything below the plane.
  const xCut = halfSpaceCutter('board.xCut', slab, 'x', MINI_BOARD_MM.xCutMm, 'negative')
  const trimmed = booleanPart(builder, 'board.trimmed', 'subtract', [slab, xCut])
  // `.bisect('y', -inch(0.96)).parts.positive` — a negative offset measures back from
  // the maximum face, and this time the *positive* half is kept, so the box removed
  // is the strip below the plane.
  const yCut = halfSpaceCutter(
    'board.yCut',
    trimmed,
    'y',
    -MINI_BOARD_MM.yCutBackMm,
    'positive'
  )
  const board = booleanPart(builder, 'board', 'subtract', [trimmed, yCut])
  // V1 `:93` — `.color('darkgreen')`, opaque (no alpha argument, unlike the
  // `raspberrypi.hat`/`bplus` boards' `darkgreen`/`green` at 0.75) — TODO/core-033.
  builder.place(board, 'board', v1ColorToRecord('darkgreen'))

  const screen = cuboidPart('screen', SCREEN_MM)
  chain(screen)
    .snap(board, 'x', 'inside+')
    .snap(board, 'y', 'inside-')
    .snap(board, 'z', 'outside-')
  // V1 `:107` — `.color('white')` (TODO/core-033).
  builder.place(screen, 'screen', v1ColorToRecord('white'))

  const display = cuboidPart('display', DISPLAY_MM)
  chain(display)
    .snap(board, 'x', 'inside-', DISPLAY_INSET_X_MM)
    .snap(board, 'y', 'inside+', DISPLAY_INSET_Y_MM)
    .snap(board, 'z', 'outside-')
  // V1 `:116` — `.color('black')` (TODO/core-033).
  builder.place(display, 'display', v1ColorToRecord('black'))

  // `display.stretch('z', 5)` baked as the already-stretched box, then V1's *outward*
  // chamfer. `.align(display, 'xy')` follows in V1; it is a no-op because both the
  // stretch and the chamfer are symmetric in plan, and it is applied here anyway so
  // the chain matches the source.
  const stretched = cuboidPart('display-clearance.box', [
    DISPLAY_MM[0],
    DISPLAY_MM[1],
    DISPLAY_MM[2] + CLEARANCE_RISE_MM,
  ])
  chain(stretched).align(display, 'xy').snap(display, 'z', 'inside-')
  const clearance = modifyPart(builder, 'display-clearance', 'modify.chamferRim', {
    radius: CLEARANCE_CHAMFER_MM,
    orientation: 'z+',
  }, stretched)
  chain(clearance).align(display, 'xy')
  // V1 `:128` — `.color('red')` (TODO/core-033).
  builder.place(clearance, 'display-clearance', { hidden: true, ...v1ColorToRecord('red') })

  const buttons = BUTTON_MIDLINES_MM.map((midlineYMm, index) =>
    addBoardButton(builder, `button${index + 1}`, board, midlineYMm)
  )
  const caps = buttons.map((button, index) =>
    addButtonCap(builder, `buttonCap${index + 1}`, button)
  )

  const cap1 = caps[0]
  const connector = cuboidPart('button-connector', CONNECTOR_MM)
  chain(connector)
    .align(cap1, 'x')
    .snap(cap1, 'y', 'outside+', CONNECTOR_GAP_MM)
    .snap(cap1, 'z', 'inside-')
  const connectorClearance = modifyPart(
    builder,
    'button-connector-clearance',
    'modify.enlarge',
    { deltaMm: [...CONNECTOR_CLEARANCE_MM] },
    connector
  )
  // V1 `:162` — `.color('blue')` on `button-connector` (TODO/core-033).
  builder.place(connector, 'button-connector', { hidden: true, ...v1ColorToRecord('blue') })
  // V1 `:171` — `.enlarge(...).color('red')`: the recolour runs *after* the enlarge,
  // uniformly, so the clearance is red regardless of the connector's own blue
  // (TODO/core-033).
  builder.place(connectorClearance, 'button-connector-clearance', {
    hidden: true,
    ...v1ColorToRecord('red'),
  })

  const standoff = tubePart(
    'standoff',
    STANDOFF_MM.outerDiameterMm,
    STANDOFF_MM.innerDiameterMm,
    STANDOFF_MM.heightMm
  )
  chain(standoff)
    .snap(board, 'x', 'inside-')
    .snap(board, 'y', 'inside+')
    .snap(board, 'z', 'outside+')
  // V1 `:181` — `.color('yellow')` (TODO/core-033).
  builder.place(standoff, 'standoff', { hidden: true, ...v1ColorToRecord('yellow') })

  return builder.build()
}
