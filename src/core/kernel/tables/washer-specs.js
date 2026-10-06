// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Washer size table — two different provenances, both stated here rather than left
 * implicit (`TODO/core-011` Goal).
 *
 * ## `ImperialWashers` — ported from `jscad-hardware@1.1.0`
 *
 * Confirmed by reading `imperial.jscad:54-70` directly:
 *
 * ```js
 * var ImperialWashers = {
 *   '1/4': { od: util.inch(0.734), id: util.inch(0.312), thickness: util.inch(0.08) },
 *   '1/4 fender': { od: util.inch(1.25), id: util.inch(0.28125), thickness: util.inch(0.08) },
 *   '5/16': { od: util.inch(1.25), id: util.inch(0.34375), thickness: util.inch(0.08) }
 * };
 * ```
 *
 * A straight unit conversion (`inchToMm`, `bolt-specs.js`'s boundary function), not a
 * re-derivation — same convention `bolt-specs.js`/`nut-specs.js` already use.
 *
 * ## `MetricWashers` — ISO 7089 for `m3`..`m12`, V1 5.0.0 for the rest

`jscad-hardware@1.1.0` has no metric washer table, so the first port (`core-011`)
transcribed `m3`..`m12` from ISO 7089 (plain washer, cross-checked against two
independent published tables; an initial aggregated search result gave slightly
different M6/M8/M10 outer diameters that turned out to be ISO 7093/DIN 9021 "large
washer" bleed-in, not ISO 7089 itself). **`jscad-hardware@5.0.0` does have one**
(`MetricWashers`, `M1`..`M20`, from armstrongmetalcrafts.com), and `TODO/core-052` found
that its `m3`..`m12` rows agree with the ISO values below, so those stay as first ported.
The sizes a shipped bolt needs and ISO 7089 rows lacked — `m1.6`, `m2`, `m2.5`, `m14`,
`m16`, `m20` — are taken from V1 5.0.0 (via `hardware-tables.generated.js`).

| Size | id (mm) | od (mm) | thickness (mm) |
|---|---|---|---|
| m3  | 3.2  | 7  | 0.5 |
| m4  | 4.3  | 9  | 0.8 |
| m5  | 5.3  | 10 | 1.0 |
| m6  | 6.4  | 12 | 1.6 |
| m8  | 8.4  | 16 | 1.6 |
| m10 | 10.5 | 20 | 2.0 |
| m12 | 13   | 24 | 2.5 |

This is why `hardware.washer.spec.js` verifies the metric entries against this table
 * directly (a spec-conformance check) rather than diffing them against a V1 fixture —
 * there is no V1 function call that could generate one.
 *
 * @module core/kernel/tables/washer-specs
 */

import { inchToMm } from './bolt-specs.js'
import { generatedMetricWasherSpecs } from './hardware-tables.generated.js'

/**
 * One washer size, in millimetres — the fields `hardware.washer.js` reads to build a
 * `primitive.tube`.
 *
 * @typedef {object} WasherSpec
 * @property {number} odMm Outer diameter (V1 `od`).
 * @property {number} idMm Bore diameter (V1 `id`).
 * @property {number} thicknessMm (V1 `thickness`).
 */

/**
 * `ImperialWashers`, ported to millimetre-named fields. See module doc.
 *
 * @type {Readonly<Record<string, WasherSpec>>}
 */
export const ImperialWashers = Object.freeze({
  '1/4': Object.freeze({
    odMm: inchToMm(0.734),
    idMm: inchToMm(0.312),
    thicknessMm: inchToMm(0.08),
  }),
  '1/4 fender': Object.freeze({
    odMm: inchToMm(1.25),
    idMm: inchToMm(0.28125),
    thicknessMm: inchToMm(0.08),
  }),
  '5/16': Object.freeze({
    odMm: inchToMm(1.25),
    idMm: inchToMm(0.34375),
    thicknessMm: inchToMm(0.08),
  }),
})

/**
 * `MetricWashers`: the ISO 7089 rows first ported, plus the V1 5.0.0 rows for the
 * remaining shipped bolt sizes. See module doc.
 *
 * @type {Readonly<Record<string, WasherSpec>>}
 */
export const MetricWashers = Object.freeze({
  ...Object.fromEntries(
    ['m1.6', 'm2', 'm2.5'].map((size) => [size, Object.freeze({ ...generatedMetricWasherSpecs[size] })])
  ),
  m3: Object.freeze({ idMm: 3.2, odMm: 7, thicknessMm: 0.5 }),
  m4: Object.freeze({ idMm: 4.3, odMm: 9, thicknessMm: 0.8 }),
  m5: Object.freeze({ idMm: 5.3, odMm: 10, thicknessMm: 1.0 }),
  m6: Object.freeze({ idMm: 6.4, odMm: 12, thicknessMm: 1.6 }),
  m8: Object.freeze({ idMm: 8.4, odMm: 16, thicknessMm: 1.6 }),
  m10: Object.freeze({ idMm: 10.5, odMm: 20, thicknessMm: 2.0 }),
  m12: Object.freeze({ idMm: 13, odMm: 24, thicknessMm: 2.5 }),
  ...Object.fromEntries(
    ['m14', 'm16', 'm20'].map((size) => [size, Object.freeze({ ...generatedMetricWasherSpecs[size] })])
  ),
})

/**
 * Every washer size this project ships, imperial and metric merged into one table —
 * the same flat shape `boltSpecs`/`nutSpecs` present to their recipes, so
 * `hardware.washer.js` reads one table without caring which provenance an entry came
 * from.
 *
 * @type {Readonly<Record<string, WasherSpec>>}
 */
export const washerSpecs = Object.freeze({ ...ImperialWashers, ...MetricWashers })
