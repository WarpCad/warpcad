/**
 * The `raspberrypi.piTFT22` composite recipe — Adafruit's PiTFT 2.2" display HAT,
 * expanded **standalone**.
 *
 * Reproduces `jscad-raspberrypi@62a8e3b`'s `PiTFT22(options, piMotherBoard)`
 * (`src/pi-tft22.js:28-77`).
 *
 * ## What "drop the board parameter" means for this one
 *
 * `PiTFT22` never touches `piMotherBoard` itself. It **forwards** it, at `:29`, into
 * `Hat(piMotherBoard, options)`, and `Hat` uses it for exactly one thing: the
 * attachment translate at `hat.js:60-66`. So dropping the parameter here is not a
 * matter of stripping a call — it is a matter of calling a *standalone* Hat, which is
 * precisely what V1 itself does when the argument is omitted. The screen then sits in
 * the HAT's own frame, minimum corner on the origin, and attaching it to a Pi is the
 * user's own `ui-026` Snap/Align step between two placed bodies, per
 * `docs/decisions/composite-recipe-geometry.md`'s Family B requirement.
 *
 * That standalone Hat lives in `./raspberrypi.hat.js`, shared with
 * `raspberrypi.piTFT24`. `TODO/core-018` owns `raspberrypi.hat` as a registered op and
 * has not landed yet; see that module's header for how it should adopt this expansion
 * instead of re-porting `hat.js`.
 *
 * ## Two things V1 does that this port states rather than reproduces
 *
 * **`group.holes`.** `:35` assigns the Hat's four mounting holes as the group's holes,
 * which makes V1's `combine()` drill them out of the assembled board. No `OpRecord`
 * field reaches `group.js`'s `addHole`, so — the same call `raspberrypi.bplus` made
 * (`TODO/core-014`, deviation 2) — they are emitted as hidden `hole1`-`hole4` parts
 * and the board renders undrilled. A consumer that wants them drilled emits its own
 * `boolean.subtract`. Note these are *additions* to V1's own part dictionary, which
 * keeps them only in `holes`; emitting nothing would have lost them entirely.
 *
 * **Opaque colours ported (TODO/core-033)**: `lcd` (`:40`, black), `lcdbevel` (`:50`,
 * white). `button1`-`4` are left uncoloured: each is a union of a gray `buttonBase`
 * (`:54`) and a black cap (`:58`) — differently coloured V1 solids, same rule as
 * `raspberrypi.bplus.js`'s `avjack`.
 *
 * @module core/kernel/recipes/raspberrypi.piTFT22
 */

import { v1ColorToRecord } from '../colors.js'
import { addHat, HAT_BOARD_COLOR } from './raspberrypi.hat.js'
import { booleanPart, chain, createBuilder, cuboidPart, cylinderPart } from './rpi-recipe-kit.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */

/** `:39` and `:47` — the black LCD module and the white bezel over it. */
const LCD_MM = Object.freeze(/** @type {[number, number, number]} */ ([45.97, 34.8, 4]))
const LCD_MIDLINE_MM = Object.freeze(/** @type {[number, number]} */ ([33.4, 27.18]))
const BEVEL_MM = Object.freeze(/** @type {[number, number, number]} */ ([55, 40, 3.5]))
const BEVEL_OFFSET_MM = Object.freeze(/** @type {[number, number, number]} */ ([8, 6, 0]))

/** `:56-64` — one button: a grey base block with a black round cap on top. */
const BUTTON_BASE_MM = Object.freeze(/** @type {[number, number, number]} */ ([7, 6, 2.5]))
const BUTTON_CAP_DIAMETER_MM = 3.1
const BUTTON_CAP_HEIGHT_MM = 1.2

/**
 * `:67-72` — each button's x midline. V1 spells them as `13.97` plus multiples of
 * `12.7` (half an inch), which is kept rather than collapsed to a start-and-pitch pair
 * so the source line stays readable here.
 *
 * @type {readonly number[]}
 */
export const PITFT22_BUTTON_MIDLINES_MM = Object.freeze([
  13.97,
  13.97 + 12.7,
  13.97 + 12.7 + 12.7,
  13.97 + 12.7 + 12.7 + 12.7,
])

/**
 * Expand a `raspberrypi.piTFT22` document line into the op records that define it.
 *
 * Takes no parameters: V1's only option was `hatHeight`, which fed the dropped
 * attachment translate and nothing else.
 *
 * @param {Record<string, any>} [params] Ignored; this hat has no variants.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
export function piTFT22(params = {}) {
  void params
  const builder = createBuilder()

  const { mb, gpio, holes } = addHat(builder)
  builder.place(mb, 'mb', HAT_BOARD_COLOR)
  // V1 `rpi-parts.js:153` — `Gpio()` is `.color('gray')` (TODO/core-033).
  builder.place(gpio, 'gpio', v1ColorToRecord('gray'))
  // V1 `hat.js:30` → `rpi-parts.js:28` — `MountingHole()` is `.color('orange')`
  // (TODO/core-033). Hidden either way.
  holes.forEach((hole, index) =>
    builder.place(hole, `hole${index + 1}`, { hidden: true, ...v1ColorToRecord('orange') })
  )

  const lcd = cuboidPart('lcd', LCD_MM)
  chain(lcd)
    .snap(mb, 'z', 'outside-')
    .midlineTo('x', LCD_MIDLINE_MM[0])
    .midlineTo('y', LCD_MIDLINE_MM[1])
  // V1 `pi-tft22.js:40` — `.color('black')` (TODO/core-033).
  builder.place(lcd, 'lcd', v1ColorToRecord('black'))

  const bevel = cuboidPart('lcdbevel', BEVEL_MM)
  chain(bevel).snap(mb, 'z', 'outside-').translate(BEVEL_OFFSET_MM)
  // V1 `pi-tft22.js:50` — `.color('white')` (TODO/core-033).
  builder.place(bevel, 'lcdbevel', v1ColorToRecord('white'))

  // `:56-64` builds one button and `:67-72` walks four copies to their midlines. The
  // `midlineTo` is a relative translate (see the kit's `chain`), and V1 applies each
  // one to the *unmoved* original — so every button is cloned from the same prototype
  // rather than from its predecessor.
  PITFT22_BUTTON_MIDLINES_MM.forEach((midlineXMm, index) => {
    const n = index + 1
    const base = cuboidPart(`button${n}.base`, BUTTON_BASE_MM)
    const cap = cylinderPart(`button${n}.cap`, BUTTON_CAP_DIAMETER_MM, BUTTON_CAP_HEIGHT_MM)
    chain(cap).snap(base, 'z', 'outside-').align(base, 'xy')
    // `base` (`:54`) is gray, `cap` (`:58`) is black — differently coloured V1 solids
    // feeding one union, so `buttonN` stays uncoloured (TODO/core-033).
    const button = booleanPart(builder, `button${n}`, 'union', [base, cap])
    chain(button).snap(mb, 'z', 'outside-').midlineTo('x', midlineXMm)
    builder.place(button, `button${n}`)
  })

  return builder.build()
}
