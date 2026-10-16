// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `raspberrypi.screen` composite recipe — one Library row for the six Raspberry Pi
 * screens, with a `model` param naming which one (`TODO/core-058`).
 *
 * ## A dispatcher, not a merged factory
 *
 * `raspberrypi.bplus` and `raspberrypi.cameraModule` are each one factory branching on
 * `model` over a shared dimension table, because their variants are revisions of one
 * part. These six are **six unrelated products** — no shared table, no shared connector,
 * no shared part names — so this recipe merges nothing. It calls the screen's own,
 * unmodified recipe and returns its records unchanged; every part keeps the name that
 * recipe has always given it.
 *
 * The six per-screen ops (`raspberrypi.touchScreen2` and the rest) stay registered, with
 * no `ui` metadata: a project saved before this row existed names them directly, with no
 * `model`, and replays exactly as it did.
 *
 * No part aliases between models (unlike `BPLUS_PART_ALIASES`): switching from one
 * screen to another legitimately orphans a Snap/Align that named the old screen's part,
 * and `ui-052`'s repair dialog handles that with no suggestion, because none would be
 * honest.
 *
 * @module core/kernel/recipes/raspberrypi.screen
 */

import { hyperPixel4Rectangular } from './raspberrypi.hyperPixel4Rectangular.js'
import { miniPiTFT } from './raspberrypi.miniPiTFT.js'
import { piTFT22 } from './raspberrypi.piTFT22.js'
import { piTFT24 } from './raspberrypi.piTFT24.js'
import { touchDisplay7inch } from './raspberrypi.touchDisplay7inch.js'
import { touchScreen2 } from './raspberrypi.touchScreen2.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'raspberrypi.screen'

/**
 * The six screens, keyed by their own op's suffix, in the order the Library has always
 * listed them: the two touch displays, then the four small ones.
 *
 * @type {readonly ('touchDisplay7inch' | 'touchScreen2' | 'hyperPixel4Rectangular' | 'miniPiTFT' | 'piTFT22' | 'piTFT24')[]}
 */
export const SCREEN_MODELS = Object.freeze(
  /** @type {const} */ ([
    'touchDisplay7inch',
    'touchScreen2',
    'hyperPixel4Rectangular',
    'miniPiTFT',
    'piTFT22',
    'piTFT24',
  ])
)

/** @typedef {(typeof SCREEN_MODELS)[number]} ScreenModel */

/** What a record with no `model` builds — also the Library row's default. */
export const DEFAULT_SCREEN_MODEL = 'touchDisplay7inch'

/** @type {Readonly<Record<ScreenModel, (params?: Record<string, any>) => OpRecord[]>>} */
const RECIPES = Object.freeze({
  touchDisplay7inch,
  touchScreen2,
  hyperPixel4Rectangular,
  miniPiTFT,
  piTFT22,
  piTFT24,
})

/**
 * Expand a `raspberrypi.screen` document line into the chosen screen's own op records.
 *
 * @param {Record<string, any>} [params] Plain JSON off the document line. `model` is a
 *   {@link ScreenModel}, defaulting to {@link DEFAULT_SCREEN_MODEL}; an unrecognised
 *   value is rejected rather than coerced. Anything else is passed through to that
 *   screen's own recipe.
 * @returns {OpRecord[]} Exactly what that screen's own recipe returns.
 */
export function screen(params = {}) {
  const { model = DEFAULT_SCREEN_MODEL, ...rest } = params ?? {}
  if (!SCREEN_MODELS.includes(/** @type {ScreenModel} */ (model))) {
    throw new Error(
      `${OP}: unknown model ${JSON.stringify(model)}, expected one of ` + SCREEN_MODELS.join(' | ')
    )
  }
  return RECIPES[/** @type {ScreenModel} */ (model)](rest)
}
