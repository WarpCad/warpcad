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
 * @module core/kernel/tables/screw-specs
 */

import { inchToMm } from './bolt-specs.js'

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
