// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Bolt size tables, ported from `jscad-hardware@5.0.0`'s `src/metric.js` and
 * `src/imperial.js` (TODO/core-052), plus three rows pinned from `1.1.0`.
 *
 * `core-009` first ported `1.1.0`, whose `metric.jscad` hand-typed only `m10 hex` and
 * `m12 hex`. `5.0.0` — the version the author's own projects ran — generates its tables
 * from published standards (ISO 4762 socket caps, hex bolts, ISO fit/tap drill tables),
 * so the bulk of this table is **generated**: `scripts/generate-hardware-tables.mjs`
 * reads that source and writes `hardware-tables.generated.js`, so the app never runs
 * V1's string parser. This file merges the generated rows with the pinned ones and
 * orders them (metric then imperial, by body diameter, socket before hex).
 *
 * Shipped set: metric `m1.6`..`m20` socket and `m10`..`m20` hex (where V1's tap table and
 * washer table both end, so every row has real fit data and a matching nut and washer),
 * imperial `#0`..`1"` socket (no `#5`: V1 has no `#5` nut) and `1/4`..`1"` hex (where V1's nut table ends). V1 5.0.0
 * has no metric hex below m10 (ISO 4017 starts there in its table), so small metric
 * sizes are socket-cap only, which is how Pi-class projects use them.
 *
 * These were already plain data in V1 — `MetricBolts['m10 hex']` is an object of
 * numbers, not a function — so this is a rename, not a re-derivation
 * (`Initial design.md` §3). What changed:
 *
 * - **Units are in the field names.** V1 used single letters from the fastener
 *   standards (`E`, `F`, `G`, `H`, `D`) plus a set of bare fit keys, and mixed
 *   millimetre literals in the metric table with `util.inch()` calls in the imperial
 *   one. Every value here is millimetres, per `CLAUDE.md`'s units convention, and the
 *   inch→mm conversion is named at its boundary below.
 * - **`G || D` is resolved.** V1's `Hardware.Bolt` read `bolt.G || bolt.D` — width
 *   across corners for a hex head, head diameter for a pan head. Both are "the
 *   diameter of the circle the head is drawn on", so they collapse to one field.
 *
 * @module core/kernel/tables/bolt-specs
 */

import { generatedBoltSpecs } from './hardware-tables.generated.js'

/**
 * Convert inches to millimetres — the document unit (`CLAUDE.md`: documents are
 * millimetres, Z-up). The only place imperial numbers cross into this module.
 *
 * @param {number} inches
 * @returns {number} Millimetres.
 */
export function inchToMm(inches) {
  return inches * 25.4
}

/**
 * One bolt size. `type` selects the head solid the recipe builds: a hexagonal prism
 * for `HexHeadScrew`, a cylinder for `PanHeadScrew` — the same branch V1's
 * `Parts.Hardware[bolt.type]` took.
 *
 * @typedef {object} BoltSpec
 * @property {'HexHeadScrew' | 'PanHeadScrew'} type
 * @property {number} bodyDiameterMm Shank diameter (V1 `E`).
 * @property {number} headDiameterMm Circle the head is drawn on (V1 `G` or `D`).
 * @property {number} headHeightMm Head height (V1 `H`).
 * @property {Readonly<Record<string, number>>} fitDiameterMm Hole diameter per fit
 *   class — see {@link FIT_CLASSES}; clearance is this minus `bodyDiameterMm`. Keyed
 *   by plain string because the key arrives from untrusted document JSON and is
 *   validated at the recipe boundary, not by the type.
 */

/**
 * Rows whose numbers differ from the `5.0.0` generation and are kept as they were
 * first ported from `1.1.0`, **byte-for-byte**, so a saved document's bolt does not
 * change size under it. The differences are small (`m10 hex` head 18 vs 18.48 across
 * corners and tap 8.5 vs 8.8; `m12 hex` tap 10.3 vs 10.5); `1/4 socket` matches.
 *
 * @type {Readonly<Record<string, BoltSpec>>}
 */
const pinnedBoltSpecs = Object.freeze({
  // jscad-hardware 1.1.0 metric.jscad — http://www.atlrod.com/metric-hex-bolt-dimensions/
  'm10 hex': Object.freeze({
    type: 'HexHeadScrew',
    bodyDiameterMm: 10,
    headDiameterMm: 18,
    headHeightMm: 6.5,
    fitDiameterMm: Object.freeze({ tap: 8.5, close: 10.5, loose: 11 }),
  }),
  'm12 hex': Object.freeze({
    type: 'HexHeadScrew',
    bodyDiameterMm: 12,
    headDiameterMm: 20,
    headHeightMm: 7.5,
    fitDiameterMm: Object.freeze({ tap: 10.3, close: 12.6, loose: 13.2 }),
  }),
  // jscad-hardware 1.1.0 imperial.jscad — http://www.americanfastener.com/cap-screws/
  '1/4 socket': Object.freeze({
    type: 'PanHeadScrew',
    bodyDiameterMm: inchToMm(0.25),
    headDiameterMm: inchToMm(0.375),
    headHeightMm: inchToMm(0.25),
    fitDiameterMm: Object.freeze({
      tap: inchToMm(0.201),
      close: inchToMm(0.257),
      loose: inchToMm(0.266),
    }),
  }),
})

/**
 * Sort key for a table key: metric before imperial, then body diameter, then socket
 * before hex. Numeric, not lexicographic — `m2` before `m10`, which is what the
 * Inspector's Spec list shows.
 *
 * @param {string} key
 * @param {{ bodyDiameterMm: number }} entry
 * @returns {[number, number, number]}
 */
function sortKey(key, entry) {
  return [key.startsWith('m') ? 0 : 1, entry.bodyDiameterMm, key.endsWith('socket') ? 0 : 1]
}

/**
 * Every bolt size this project ships — see the module doc for the set and its limits.
 *
 * @type {Readonly<Record<string, BoltSpec>>}
 */
export const boltSpecs = Object.freeze(
  Object.fromEntries(
    Object.entries({ ...deepFreezeAll(generatedBoltSpecs), ...pinnedBoltSpecs }).sort(
      ([ka, a], [kb, b]) => {
        const [sa, da, ha] = sortKey(ka, a)
        const [sb, db, hb] = sortKey(kb, b)
        return sa - sb || da - db || ha - hb
      }
    )
  )
)

/**
 * Freeze each generated row and its fit table.
 *
 * @param {Readonly<Record<string, BoltSpec>>} rows
 * @returns {Record<string, BoltSpec>}
 */
function deepFreezeAll(rows) {
  return Object.fromEntries(
    Object.entries(rows).map(([key, row]) => [
      key,
      Object.freeze({ ...row, fitDiameterMm: Object.freeze({ ...row.fitDiameterMm }) }),
    ])
  )
}

/**
 * The fit classes every {@link BoltSpec} carries.
 *
 * @type {readonly ['tap', 'close', 'loose']}
 */
export const FIT_CLASSES = Object.freeze(/** @type {['tap', 'close', 'loose']} */ ([
  'tap',
  'close',
  'loose',
]))
