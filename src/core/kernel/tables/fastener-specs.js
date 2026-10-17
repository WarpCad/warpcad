// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * One size table per fastener **Type** — what `hardware.bolt`'s Type and Size dropdowns,
 * and its recipe, read (TODO/core-060).
 *
 * Nothing here is new data. Each Type is an existing table, re-keyed:
 *
 * | Type | Sizes | Rows from | Fit from |
 * |---|---|---|---|
 * | `socket`, `hex` | `boltSpecs` split on its key's suffix | `bolt-specs.js` — the **same row objects**, so a saved `m10 hex` keeps its pinned 1.1.0 head | the row's own `fitDiameterMm` |
 * | `pan` | `m4` only — `5.0.0` ships no other metric pan-head machine screw (a real table gap) | `screwSpecs.m4` | metric `ScrewTapSizes` |
 * | `flat` | `m2`..`m10` | `metricFlatHeadScrewSpecs` | metric `ScrewTapSizes` |
 * | `woodPan`, `woodFlat` | `#2`..`#16` (the same rows for both) | `woodScrewSpecs` | `wood-screw-holes.js` (a published pilot-hole chart), where it covers the gauge |
 *
 * A row with no `fitDiameterMm` has no Fit and builds no `tap` part — hidden, never guessed.
 *
 * @module core/kernel/tables/fastener-specs
 */

import { boltSpecs } from './bolt-specs.js'
import { metricFitDiameterMm, metricFlatHeadScrewSpecs, screwSpecs, woodScrewSpecs } from './screw-specs.js'
import { woodScrewHolesMm } from './wood-screw-holes.js'

/**
 * One size of one Type. `fitDiameterMm` is the hole diameter per fit class; absent when
 * no published table gives one for this size.
 *
 * @typedef {object} FastenerSpec
 * @property {number} bodyDiameterMm Shank diameter.
 * @property {number} headDiameterMm Head diameter at its widest (across corners for hex).
 * @property {number} headHeightMm
 * @property {Readonly<Record<string, number>>} [fitDiameterMm]
 */

/** @typedef {'socket' | 'hex' | 'pan' | 'flat' | 'woodPan' | 'woodFlat'} FastenerType */

/**
 * The Types, in the order the Type dropdown lists them.
 *
 * @type {readonly FastenerType[]}
 */
export const FASTENER_TYPES = Object.freeze(/** @type {FastenerType[]} */ (['socket', 'hex', 'pan', 'flat', 'woodPan', 'woodFlat']))

/**
 * The size a Type falls back to when a Type change strands the current one — and the
 * row a fresh pick of that Type opens on.
 *
 * @type {Readonly<Record<FastenerType, string>>}
 */
export const DEFAULT_SIZE_BY_TYPE = Object.freeze({
  socket: 'm3',
  hex: 'm10',
  pan: 'm4',
  flat: 'm3',
  woodPan: '#8',
  woodFlat: '#8',
})

/**
 * `boltSpecs` rows whose key ends in ` <suffix>`, keyed by the bare size. Order kept.
 *
 * @param {'socket' | 'hex'} suffix
 * @returns {Readonly<Record<string, FastenerSpec>>}
 */
function boltRows(suffix) {
  const tail = ` ${suffix}`
  return Object.freeze(
    Object.fromEntries(
      Object.entries(boltSpecs)
        .filter(([key]) => key.endsWith(tail))
        .map(([key, row]) => [key.slice(0, -tail.length), row])
    )
  )
}

/**
 * Screw rows with a fit table attached where one exists for the size.
 *
 * @param {Readonly<Record<string, import('./screw-specs.js').ScrewSpec>>} rows
 * @param {(size: string) => Readonly<Record<string, number>> | undefined} fitOf
 * @returns {Readonly<Record<string, FastenerSpec>>}
 */
function screwRows(rows, fitOf) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(rows).map(([size, row]) => {
        const fit = fitOf(size)
        return [size, Object.freeze(fit === undefined ? { ...row } : { ...row, fitDiameterMm: Object.freeze({ ...fit }) })]
      })
    )
  )
}

/** @param {string} gauge */
const woodFitOf = (gauge) => (Object.hasOwn(woodScrewHolesMm, gauge) ? woodScrewHolesMm[gauge] : undefined)

const woodRows = Object.freeze(
  Object.fromEntries(
    Object.entries(woodScrewSpecs).map(([gauge, row]) => {
      const fit = woodFitOf(gauge)
      // The chart's own frozen row, by identity: one source for the numbers.
      return [gauge, Object.freeze(fit === undefined ? { ...row } : { ...row, fitDiameterMm: fit })]
    })
  )
)

/**
 * Every size per Type.
 *
 * @type {Readonly<Record<FastenerType, Readonly<Record<string, FastenerSpec>>>>}
 */
export const fastenerSpecs = Object.freeze({
  socket: boltRows('socket'),
  hex: boltRows('hex'),
  pan: screwRows({ m4: screwSpecs.m4 }, metricFitDiameterMm),
  flat: screwRows(metricFlatHeadScrewSpecs, metricFitDiameterMm),
  woodPan: woodRows,
  woodFlat: woodRows,
})
