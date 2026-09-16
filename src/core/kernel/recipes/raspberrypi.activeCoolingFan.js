/**
 * The `raspberrypi.activeCoolingFan` composite recipe — the official Raspberry Pi
 * Active Cooling Fan, reproducing `jscad-raspberrypi@62a8e3b`'s `activeCoolingFan()`
 * (`src/active-cooling-fan.js:9-33`).
 *
 * ## The simplest recipe in the M4 catalogue, and why
 *
 * Every other `raspberrypi.*` recipe resolves V1's `.snap()`/`.align()`/`.midlineTo()`
 * chains by building probe geometry, measuring it and baking the result into a
 * translate. This one has nothing to measure: all four of its offsets are literal
 * constants in the source, written as the arithmetic that produced them
 * (`64 - 58`, `42.5 - 31.3`, `64 - 28`, `64 - 58 + 19`). So it expands to a plain
 * `boolean.subtract`/`boolean.union` chain over `primitive.cuboid` records, with no
 * probe-and-bake step at all.
 *
 * The arithmetic is kept in the constants below rather than collapsed to its results,
 * so each line still diffs against V1's.
 *
 * ## One part, not four
 *
 * `:30` adds a single `board` to the group. The plate, its two notches and the two
 * blocks are stages of one CSG expression, not named parts, and V1 exposes no way to
 * reach them — so this port names only the finished solid. Colours (`'orange'`,
 * `'blue'`, `'silver'`, `'black'`) are dropped as everywhere else in this catalogue.
 *
 * @module core/kernel/recipes/raspberrypi.activeCoolingFan
 */

import { booleanPart, chain, createBuilder, cuboidPart } from './rpi-recipe-kit.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */

/**
 * Every dimension `active-cooling-fan.js` states, in its own order and spelled with
 * its own arithmetic.
 */
export const FAN_MM = Object.freeze({
  /** `:12` — the fan's base plate. */
  plateMm: Object.freeze(/** @type {[number, number, number]} */ ([64, 42.5, 1])),

  /** `:14-16` — the tall notch up the left-hand edge. */
  notch1Mm: Object.freeze(/** @type {[number, number, number]} */ ([64 - 58, 31.3, 1])),
  notch1OffsetMm: Object.freeze(/** @type {[number, number, number]} */ ([0, 42.5 - 31.3, 0])),

  /** `:18-20` — the wide notch across the bottom right. */
  notch2Mm: Object.freeze(/** @type {[number, number, number]} */ ([28, 42.5 - 31.3, 1])),
  notch2OffsetMm: Object.freeze(/** @type {[number, number, number]} */ ([64 - 28, 0, 0])),

  /** `:23` — the heatsink fin stack. */
  finsMm: Object.freeze(/** @type {[number, number, number]} */ ([19, 40, 9])),
  finsOffsetMm: Object.freeze(/** @type {[number, number, number]} */ ([64 - 58, 2.5, 0])),

  /** `:26-28` — the fan housing. */
  housingMm: Object.freeze(/** @type {[number, number, number]} */ ([30, 30, 9])),
  housingOffsetMm: Object.freeze(
    /** @type {[number, number, number]} */ ([64 - 58 + 19, 42.5 - 31.3, 0])
  ),
})

/**
 * Expand a `raspberrypi.activeCoolingFan` document line into the op records that
 * define it.
 *
 * Takes no parameters: V1's factory has neither an options object nor a board
 * argument, so there is nothing to drop and nothing to vary.
 *
 * @param {Record<string, any>} [params] Ignored; this fan has no variants.
 * @returns {OpRecord[]} Op records in the same schema the document stores.
 */
export function activeCoolingFan(params = {}) {
  void params
  const builder = createBuilder()

  const plate = cuboidPart('fan.plate', FAN_MM.plateMm)

  // `:13-21` subtracts the *union* of both notches in one call. Emitting two separate
  // subtracts would give the same solid here — they do not overlap — but the union is
  // what the source says, and `booleanPart` keeps the record shape honest about it.
  const notch1 = cuboidPart('fan.notch1', FAN_MM.notch1Mm)
  chain(notch1).translate(FAN_MM.notch1OffsetMm)
  const notch2 = cuboidPart('fan.notch2', FAN_MM.notch2Mm)
  chain(notch2).translate(FAN_MM.notch2OffsetMm)
  const notches = booleanPart(builder, 'fan.notches', 'union', [notch1, notch2])

  const notched = booleanPart(builder, 'fan.notched', 'subtract', [plate, notches])

  const fins = cuboidPart('fan.fins', FAN_MM.finsMm)
  chain(fins).translate(FAN_MM.finsOffsetMm)
  const withFins = booleanPart(builder, 'fan.withFins', 'union', [notched, fins])

  const housing = cuboidPart('fan.housing', FAN_MM.housingMm)
  chain(housing).translate(FAN_MM.housingOffsetMm)
  const board = booleanPart(builder, 'fan.board', 'union', [withFins, housing])

  builder.place(board, 'board')
  return builder.build()
}
