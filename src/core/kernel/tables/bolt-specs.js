/**
 * Bolt size tables, ported from `jscad-hardware@1.1.0`'s `metric.jscad` and
 * `imperial.jscad`.
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
 * Every bolt size `jscad-hardware` v1 actually shipped that this kernel supports.
 *
 * Note that `"m2.5 socket"` — the running example in `Initial design.md` §3/§4 — is
 * **not** here, because it was never in `jscad-hardware`'s tables: its `MetricBolts`
 * only ever held `'m10 hex'` and `'m12 hex'`, and the sole `socket` entry in the
 * whole library is imperial `'1/4 socket'`. The design doc's example spec name is
 * fictional; the two head types it stands for are both covered below.
 *
 * @type {Readonly<Record<string, BoltSpec>>}
 */
export const boltSpecs = Object.freeze({
  // jscad-hardware metric.jscad — http://www.atlrod.com/metric-hex-bolt-dimensions/
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
  // jscad-hardware imperial.jscad — http://www.americanfastener.com/cap-screws/
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
 * The fit classes every {@link BoltSpec} carries.
 *
 * @type {readonly ['tap', 'close', 'loose']}
 */
export const FIT_CLASSES = Object.freeze(/** @type {['tap', 'close', 'loose']} */ ([
  'tap',
  'close',
  'loose',
]))
