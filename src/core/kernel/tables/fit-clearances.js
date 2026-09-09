/**
 * The shared fit-clearance table, ported from `jscad-hardware@1.1.0`'s
 * `Hardware.Clearances` (`jscad-hardware.jscad:112-116`):
 *
 * ```js
 * Clearances: {
 *   tap: util.inch(-0.049),
 *   close: util.inch(0.007),
 *   loose: util.inch(0.016)
 * }
 * ```
 *
 * **This is a different shape from `bolt-specs.js`'s `fitDiameterMm`.** A bolt's
 * `fitDiameterMm` is a *per-spec absolute hole diameter* — a different number for
 * every bolt size, keyed by fit class. This table is one flat millimetre **delta**,
 * added to whatever diameter the caller already has, independent of size — V1 adds
 * `Hardware.Clearances[fit]` directly onto `nut[1]` for a nut and onto `washer.od`
 * for a washer, with no per-size table in between. `hardware.nut` (`TODO/core-010`)
 * reads this table once; `hardware.washer` (`TODO/core-011`) reads the identical
 * table again for its own clearance cylinder, rather than each recipe re-deriving
 * or duplicating `Hardware.Clearances`.
 *
 * @module core/kernel/tables/fit-clearances
 */

import { inchToMm } from './bolt-specs.js'

/**
 * The fit classes this table covers — same three keys `bolt-specs.js`'s
 * `FIT_CLASSES` names, kept as a separate constant here (rather than imported) so
 * this module has no dependency on `bolt-specs.js`'s own size-table shape, only on
 * its `inchToMm` conversion helper.
 *
 * @type {readonly ['tap', 'close', 'loose']}
 */
export const FIT_CLASSES = Object.freeze(/** @type {['tap', 'close', 'loose']} */ ([
  'tap',
  'close',
  'loose',
]))

/**
 * Millimetre delta added to a diameter, per fit class. Negative for `tap`: V1's own
 * value (`util.inch(-0.049)`) shrinks the diameter, which is what a tap fit —
 * material a fastener cuts its own thread into — needs, unlike `close`/`loose`
 * which both grow it for clearance.
 *
 * @type {Readonly<Record<'tap' | 'close' | 'loose', number>>}
 */
export const FIT_CLEARANCE_MM = Object.freeze({
  tap: inchToMm(-0.049),
  close: inchToMm(0.007),
  loose: inchToMm(0.016),
})
