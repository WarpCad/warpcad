/**
 * `jscad-raspberrypi@62a8e3b`'s `Hat(pi, options)` (`src/hat.js:25-69`), expanded
 * **standalone** — a blank Raspberry Pi HAT: a 65.02 x 56.39 x 1.62 board, four
 * mounting holes, and the GPIO header hanging off its underside.
 *
 * ## Why this is a module and not a registered op (read before `TODO/core-018`)
 *
 * `core-018` owns `raspberrypi.hat` as a document-level composite. It has **not landed
 * yet** — `core-017` ran first — and `PiTFT22`/`PiTFT24` both need the expansion
 * *now*: `pi-tft22.js:29` and `pi-tft24.js:61` each forward their `piMotherBoard`
 * straight into `Hat(piMotherBoard, options)` rather than using it themselves, so
 * "drop the board parameter" for those two means "call a standalone Hat".
 *
 * Per `TODO/core-017`'s own instruction, the expansion is built here rather than
 * blocking on `core-018`, and **`core-018` should register this builder rather than
 * re-porting `hat.js` from scratch**:
 *
 * ```js
 * // recipes/raspberrypi.hat.js
 * export function hat(params = {}) {
 *   const builder = createBuilder()
 *   addHat(builder, params)
 *   return builder.build()
 * }
 * // registry.js
 * 'raspberrypi.hat': composite(0, hat),
 * ```
 *
 * {@link addHat} already returns every part by name, so that wrapper is the whole of
 * it. `core-018`'s `hat-standoff.js` port can reuse {@link HAT_MM}'s hole table the
 * same way `PiTFT24`'s spacers do.
 *
 * ## The one thing this cannot reproduce
 *
 * `hat.js:57` assigns `hat.holes`, which makes V1's `combine()` drill the four
 * mounting holes out of the assembled board. No `OpRecord` field reaches `group.js`'s
 * `addHole`, so — exactly as `raspberrypi.bplus` already decided (`TODO/core-014`,
 * deviation 2) — the holes are emitted as hidden named parts and the board renders
 * undrilled. A consumer that wants them drilled emits its own `boolean.subtract`
 * against `hole1`-`hole4`. `PiTFT24` needs them addressable anyway: its spacers are
 * positioned by aligning onto each hole in turn.
 *
 * @module core/kernel/recipes/raspberrypi.hat
 */

import { chain, cuboidPart, cylinderPart, roundedCubePart } from './rpi-recipe-kit.js'

/** @typedef {import('./rpi-recipe-kit.js').Builder} Builder */
/** @typedef {import('./rpi-recipe-kit.js').Part} Part */

/**
 * Every dimension `hat.js` states, in its own order. `Parts.Board(width, height,
 * cornerRadius, thickness)` takes its last two arguments the opposite way round from
 * `Parts.RoundedCube`, which is why they are named here rather than positional.
 */
export const HAT_MM = Object.freeze({
  /** `:28` — `Parts.Board(65.02, 56.39, 3.56, 1.62)`. */
  xMm: 65.02,
  yMm: 56.39,
  cornerRadiusMm: 3.56,
  thicknessMm: 1.62,

  /** `rpi-parts.js`'s `MountingHole(diameter = 2.8, height = 4)`, centred on z. */
  holeDiameterMm: 2.8,
  holeHeightMm: 4,

  /**
   * `:31-52` — each hole's midline, in the board's own frame. Note these are *not*
   * the B+ board's `MOUNTING_HOLES_MM.positions`: a HAT's holes sit at 3.56 rather
   * than 3.5, and its board is 65.02 x 56.39 rather than 85 x 56.
   *
   * @type {readonly (readonly [number, number])[]}
   */
  holePositionsMm: Object.freeze([
    Object.freeze(/** @type {[number, number]} */ ([3.56, 3.56])),
    Object.freeze(/** @type {[number, number]} */ ([61.47, 3.56])),
    Object.freeze(/** @type {[number, number]} */ ([3.56, 52.46])),
    Object.freeze(/** @type {[number, number]} */ ([61.47, 52.46])),
  ]),

  /** `rpi-parts.js`'s `Gpio(mb)` — the 40-pin header and where it sits on the board. */
  gpioSizeMm: Object.freeze(/** @type {[number, number, number]} */ ([50.64, 5, 8.72])),
  gpioMidlineMm: Object.freeze(/** @type {[number, number]} */ ([32.5, 52.5])),

  /**
   * `:26` — `hatHeight` is the standoff gap between a Pi and the HAT above it. It only
   * ever fed the dropped attachment translate in `Hat` itself, but `PiTFT24` reuses
   * the same option as its spacer length (`pi-tft24.js:236`), so it stays here.
   */
  defaultHatHeightMm: 11.01,
})

/**
 * @typedef {object} HatParts
 * @property {Part} mb
 * @property {Part} gpio
 * @property {Part[]} holes Four, in V1's `hole1`-`hole4` order.
 */

/**
 * Build a standalone HAT into `builder` and hand its parts back unplaced, so a caller
 * can name them however its own factory does — `PiTFT22` exposes `mb`/`gpio` and hides
 * the holes, `PiTFT24` additionally prefixes them `hat…`.
 *
 * @param {Builder} _builder Unused today; taken so the signature stays stable when
 *   `core-018` gives the Hat derived parts of its own.
 * @returns {HatParts}
 */
export function addHat(_builder) {
  const mb = roundedCubePart('hat.mb', HAT_MM.xMm, HAT_MM.yMm, HAT_MM.thicknessMm, HAT_MM.cornerRadiusMm)

  // `:30` snaps one hole into the board's minimum corner and then walks a copy to each
  // midline. `midlineTo` is a *relative* translate of `to - size/2` (see the kit's
  // `chain`), and that snap is exactly the precondition which makes it read as an
  // absolute position here — so each hole is built from its own fresh copy at the
  // corner, never from the previous one.
  const holes = HAT_MM.holePositionsMm.map(([xMm, yMm], index) => {
    const hole = cylinderPart(`hat.hole${index + 1}`, HAT_MM.holeDiameterMm, HAT_MM.holeHeightMm, {
      frame: 'center',
    })
    chain(hole).snap(mb, 'xy', 'inside-').midlineTo('x', xMm).midlineTo('y', yMm)
    return hole
  })

  // `rpi-parts.js`'s `Gpio(mb)` snaps the header onto the board's *top* face and walks
  // it to its midlines; `hat.js:53` then snaps the whole thing to the underside. Both
  // steps are kept, in that order, because the intermediate `outside-` snap is what
  // the two `midlineTo` calls measure against.
  const gpio = cuboidPart('hat.gpio', HAT_MM.gpioSizeMm)
  chain(gpio)
    .snap(mb, 'xy', 'inside-')
    .snap(mb, 'z', 'outside-')
    .midlineTo('x', HAT_MM.gpioMidlineMm[0])
    .midlineTo('y', HAT_MM.gpioMidlineMm[1])
    .snap(mb, 'z', 'outside+')

  return { mb, gpio, holes }
}
