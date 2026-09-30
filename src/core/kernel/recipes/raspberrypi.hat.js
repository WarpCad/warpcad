/**
 * `jscad-raspberrypi@62a8e3b`'s `Hat(pi, options)` (`src/hat.js:25-69`), expanded
 * **standalone** — a blank Raspberry Pi HAT: a 65.02 x 56.39 x 1.62 board, four
 * mounting holes, and the GPIO header hanging off its underside.
 *
 * ## Why this was a module before it was a registered op
 *
 * `core-018` owns `raspberrypi.hat` as a document-level composite, but `core-017` ran
 * first and `PiTFT22`/`PiTFT24` both needed the expansion *then*: `pi-tft22.js:29` and
 * `pi-tft24.js:61` each forward their `piMotherBoard` straight into
 * `Hat(piMotherBoard, options)` rather than using it themselves, so "drop the board
 * parameter" for those two means "call a standalone Hat".
 *
 * Per `TODO/core-017`'s own instruction the expansion was built here rather than
 * blocking on `core-018`, and `core-018` then registered {@link hat} — this module's
 * own five-line wrapper around {@link addHat} — instead of re-porting `hat.js` from
 * scratch. Nothing about the expansion changed when the op landed, so
 * `raspberrypi.hat`, `raspberrypi.piTFT22` and `raspberrypi.piTFT24` are all the same
 * geometry from the same call.
 *
 * ## Mounting holes: drilled through the board, and still parts (`TODO/core-034`)
 *
 * `hat.js:57` assigns `hat.holes`, which makes V1's `combine()` drill the four
 * mounting holes out of the assembled board. No `OpRecord` field reaches `group.js`'s
 * `addHole`, so `TODO/core-014` (deviation 2) first left the holes as hidden named
 * parts and the board rendered undrilled. That is now reversed for the board: `hat.mb`
 * is the unnamed plate, and the named `mb` is a `boolean.subtract` of it by the holes
 * (`drillBoard`). The holes are unchanged — hidden, named `hole1`-`hole4` — because
 * `PiTFT24` positions its spacers by aligning onto each one and a user can still use
 * them as Subtract operands. Only the board is drilled, not the GPIO header.
 *
 * @module core/kernel/recipes/raspberrypi.hat
 */

import { v1ColorToRecord } from '../colors.js'
import { chain, createBuilder, cuboidPart, cylinderPart, drillBoard, roundedCubePart } from './rpi-recipe-kit.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */
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

/**
 * The hat board's colour, V1's `src/hat.js:28`:
 * `Parts.Board(65.02, 56.39, 3.56, 1.62).color('darkgreen', 0.75)` (TODO/core-026).
 * Exported because `PiTFT22`/`PiTFT24` re-use that very part (`hat.parts.mb`), colour
 * and all. Every other part's opaque colour is TODO/core-033.
 */
export const HAT_BOARD_COLOR = Object.freeze(v1ColorToRecord('darkgreen', 0.75))

/**
 * Expand a `raspberrypi.hat` document line into the op records that define it.
 *
 * Takes no parameters. V1's `Hat(pi, options)` has two and this port keeps neither:
 * `pi` is the attachment `docs/decisions/composite-recipe-geometry.md` moves out to
 * the user's own `group.snap`/`group.align`, and `options.hatHeight` only ever fed
 * that attachment's final translate (`hat.js:68`). It survives as
 * {@link HAT_MM.defaultHatHeightMm} because `PiTFT24` reuses the number as a spacer
 * length, not because anything here reads it.
 *
 * The four mounting holes are emitted as **hidden** parts, matching V1's own
 * `hat.add(hole, 'holeN', true, 'holes')`; see this module's header for why the board
 * renders undrilled.
 *
 * @param {Record<string, any>} [params] Ignored; this hat has no variants.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
export function hat(params = {}) {
  void params
  const builder = createBuilder()

  const { mb, gpio, holes } = addHat(builder)
  // The undrilled plate is an unnamed intermediate; `mb` is the plate minus the holes,
  // placed once the holes exist (TODO/core-034).
  builder.place(mb, null)
  // V1 `rpi-parts.js:153` — `Gpio()` is `.color('gray')` (TODO/core-033).
  builder.place(gpio, 'gpio', v1ColorToRecord('gray'))
  // V1 `hat.js:30` → `rpi-parts.js:28` — `MountingHole()` is `.color('orange')`
  // (TODO/core-033). Hidden either way.
  holes.forEach((hole, index) =>
    builder.place(hole, `hole${index + 1}`, { hidden: true, ...v1ColorToRecord('orange') })
  )
  const drilled = drillBoard(builder, 'mb', mb, holes)
  builder.place(drilled, 'mb', HAT_BOARD_COLOR)

  return builder.build()
}
