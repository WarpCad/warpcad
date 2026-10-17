// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Screw size table, ported from `jscad-hardware@1.1.0`'s `metric.jscad`
 * (`MetricScrews`) and `imperial.jscad` (`ImperialWoodScrews`), read directly from
 * both files — same standard `bolt-specs.js` and `nut-specs.js` set.
 *
 * Both were plain `[headDiameter, headLength, diameter, tap, countersink]` tuples in
 * V1, and every entry stops after the third slot, so `tap` and `countersink` are
 * `undefined` for every real size. `Hardware.Screw.PanHead`/`.FlatHead` destructure
 * both and never read either, so they are **not** carried here; inventing values for
 * them would be a guess dressed up as a port. This is a rename to named millimetre
 * fields, not a re-derivation.
 *
 * **Real table gap — do not invent additional sizes:** `MetricScrews` holds exactly
 * one entry (`'m4'`); the imperial table holds five wood-screw gauges, `#4`–`#12`,
 * written with `util.inch()` — that conversion is {@link inchToMm} below, named at its
 * boundary. More sizes are a table-only follow-up.
 *
 * `screwSpecs` itself is **frozen at that 1.1.0 set**: it is what `hardware.screw` (now
 * replay-only, TODO/core-060) validates against, so a saved screw neither gains nor loses
 * a size. The one-fastener op's wider tables — `5.0.0`'s flat-head machine screws and
 * its full `#2`..`#16` wood-screw set — are separate exports below; the shared `#4`..`#12`
 * rows are asserted equal in `hardware-tables.spec.js`.
 *
 * @module core/kernel/tables/screw-specs
 */

import { inchToMm } from './bolt-specs.js'
import {
  generatedImperialWoodScrewSpecsIn,
  generatedMetricFitDiametersMm,
  generatedMetricFlatHeadScrewSpecs,
} from './hardware-tables.generated.js'

/**
 * One screw size.
 *
 * @typedef {object} ScrewSpec
 * @property {number} headDiameterMm V1 tuple slot 0 — diameter of the head at its widest.
 * @property {number} headHeightMm V1 slot 1 — head length.
 * @property {number} bodyDiameterMm V1 slot 2 — shank diameter.
 */

/**
 * @param {number} headDiameterMm
 * @param {number} headHeightMm
 * @param {number} bodyDiameterMm
 * @returns {Readonly<ScrewSpec>}
 */
function spec(headDiameterMm, headHeightMm, bodyDiameterMm) {
  return Object.freeze({ headDiameterMm, headHeightMm, bodyDiameterMm })
}

/**
 * Every screw size `jscad-hardware` v1 shipped.
 *
 * @type {Readonly<Record<string, ScrewSpec>>}
 */
export const screwSpecs = Object.freeze({
  // metric.jscad — MetricScrews['m4']: [8, 3.1, 4]
  m4: spec(8, 3.1, 4),
  // imperial.jscad — ImperialWoodScrews, `util.inch(...)` on every field.
  '#4': spec(inchToMm(0.225), inchToMm(0.067), inchToMm(0.112)),
  '#6': spec(inchToMm(0.279), inchToMm(0.083), inchToMm(0.138)),
  '#8': spec(inchToMm(0.332), inchToMm(0.1), inchToMm(0.164)),
  '#10': spec(inchToMm(0.385), inchToMm(0.116), inchToMm(0.19)),
  '#12': spec(inchToMm(0.438), inchToMm(0.132), inchToMm(0.216)),
})

/**
 * Imperial wood screws `#2`..`#16`, `jscad-hardware@5.0.0` `ImperialWoodScrews` with
 * `WoodScrewDiameter` (TODO/core-060), converted from the generated inches here with
 * {@link inchToMm} — the same conversion, on the same numbers, as `screwSpecs`' rows.
 *
 * @type {Readonly<Record<string, ScrewSpec>>}
 */
export const woodScrewSpecs = Object.freeze(
  Object.fromEntries(
    Object.entries(generatedImperialWoodScrewSpecsIn).map(([gauge, row]) => [
      gauge,
      spec(inchToMm(row.headDiameterIn), inchToMm(row.headHeightIn), inchToMm(row.bodyDiameterIn)),
    ])
  )
)

/**
 * Metric flat-head (countersunk) machine screws `m2`..`m10`, `5.0.0`
 * `MetricFlatHeadScrews` (head height K, head diameter D2), millimetres (TODO/core-060).
 *
 * @type {Readonly<Record<string, ScrewSpec>>}
 */
export const metricFlatHeadScrewSpecs = Object.freeze(
  Object.fromEntries(
    Object.entries(generatedMetricFlatHeadScrewSpecs).map(([size, row]) => [
      size,
      spec(row.headDiameterMm, row.headHeightMm, row.bodyDiameterMm),
    ])
  )
)

/**
 * The metric tap/close/loose hole diameters for a size, from `5.0.0`'s `ScrewTapSizes` —
 * the table every metric bolt's `fitDiameterMm` already comes from. `undefined` for a
 * size the table has no row for: a fit is then hidden, never guessed.
 *
 * @param {string} size e.g. `'m3'`.
 * @returns {Readonly<Record<'tap' | 'close' | 'loose', number>> | undefined}
 */
export function metricFitDiameterMm(size) {
  return Object.hasOwn(generatedMetricFitDiametersMm, size) ? generatedMetricFitDiametersMm[size] : undefined
}
