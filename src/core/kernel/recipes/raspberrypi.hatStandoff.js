// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `raspberrypi.hatStandoff` composite recipe — the pad-and-peg standoff that holds
 * a HAT off a Raspberry Pi, reproducing `jscad-raspberrypi@62a8e3b`'s
 * `HatStandoff(options)` (`src/hat-standoff.js:13-18`).
 *
 * ## Two cylinders and a union
 *
 * ```js
 * var standoff = Mountingpad(null, options.height);
 * var peg = MountingHole(null, options.height + 3);
 * return standoff.union(peg);
 * ```
 *
 * Both factories live in `tables/rpi-parts.js`, ported once by `TODO/core-014` so
 * this recipe imports *data* rather than geometry from a sibling recipe.
 *
 * ## What the table supplies, and what it does not
 *
 * `TODO/core-018` reads this as "one `boolean.union` over two parts from `core-014`'s
 * `tables/rpi-parts.js`". That is right about the **diameters** and wrong about the
 * **heights**, which matters more than it sounds: `rpiParts.mountingPad` records V1's
 * default height of 1.5 and `rpiParts.mountingHole` records 4, but neither default is
 * ever reached from here. `HatStandoff` passes `options.height` and
 * `options.height + 3` explicitly, so the real solid is 10mm and 13mm tall. Taking
 * the table's params wholesale would build a standoff 1.5mm tall — geometry that
 * still looks like a standoff in a screenshot and is useless in a print.
 *
 * So the diameters come from the table and the heights come from the option, and
 * `raspberrypi.hatStandoff.spec.js` asserts both halves of that split rather than
 * only the result.
 *
 * ## One part, because V1 returns one solid
 *
 * `HatStandoff` hands back a bare CSG, not a `Group` — there is no part dictionary to
 * reproduce. The union is named `standoff`.
 *
 * ## Colour: left uncoloured, on purpose (TODO/core-033)
 *
 * `rpi-parts.js`'s `Mountingpad` factory (the `pad`) is `.color('yellow')`
 * (`:44`) and its `MountingHole` factory (the `peg`) is `.color('orange')`
 * (`:28`). The two differently-coloured V1 solids feed one union here, so — the
 * same rule `raspberrypi.bplus.js` applies to `avjack`/`powerswitch` — `standoff`
 * stays uncoloured rather than picking one of the two arbitrarily.
 *
 * @module core/kernel/recipes/raspberrypi.hatStandoff
 */

import { rpiParts } from '../tables/rpi-parts.js'
import { booleanPart, createBuilder, cylinderPart } from './rpi-recipe-kit.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'raspberrypi.hatStandoff'

/**
 * The dimensions this recipe pins, and where each one comes from.
 */
export const HAT_STANDOFF_MM = Object.freeze({
  /** `:14` — `Object.assign({ height: 10 }, options)`. */
  defaultHeightMm: 10,

  /** `:16` — the peg is always three millimetres prouder than the pad. */
  pegProudMm: 3,

  /** From `rpiParts.mountingPad`; V1's `Mountingpad(radius = 6.2, …)`. */
  padDiameterMm: rpiParts.mountingPad.params.diameter,

  /** From `rpiParts.mountingHole`; V1's `MountingHole(diameter = 2.8, …)`. */
  pegDiameterMm: rpiParts.mountingHole.params.diameter,
})

/**
 * Expand a `raspberrypi.hatStandoff` document line into the op records that define it.
 *
 * @param {object} [params]
 * @param {number} [params.height] Pad height in millimetres; the peg is this plus
 *   {@link HAT_STANDOFF_MM.pegProudMm}. Defaults to 10, V1's own default.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
export function hatStandoff(params = {}) {
  const { height = HAT_STANDOFF_MM.defaultHeightMm } = params
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error(`${OP}: height must be a positive number of millimetres, got ${height}`)
  }

  const builder = createBuilder()

  // Both factories build `Parts.CSG_cylinder({ start: [0,0,-h/2], end: [0,0,h/2] })`
  // — the table's `frame: 'center'` — so the standoff straddles z = 0 and the pad
  // sits concentric inside the taller peg rather than on top of it.
  const pad = cylinderPart('standoff.pad', HAT_STANDOFF_MM.padDiameterMm, height, {
    frame: 'center',
  })
  const peg = cylinderPart(
    'standoff.peg',
    HAT_STANDOFF_MM.pegDiameterMm,
    height + HAT_STANDOFF_MM.pegProudMm,
    { frame: 'center' }
  )

  builder.place(booleanPart(builder, 'standoff', 'union', [pad, peg]), 'standoff')
  return builder.build()
}
