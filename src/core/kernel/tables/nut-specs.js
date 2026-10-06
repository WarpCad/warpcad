// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Nut size table, ported from `jscad-hardware@1.1.0`'s `metric.jscad` and
 * `imperial.jscad` (confirmed by reading both files directly, not reconstructed
 * from docs — same standard `core-001` set for `boltSpecs`).
 *
 * Both tables were plain `[F, C, H, D]` tuples in V1 — width across flats, width
 * across corners, height, basic thread diameter — so this is a rename to named
 * millimetre fields, not a re-derivation, mirroring `bolt-specs.js`'s own
 * convention. `Hardware.Nut(nut, fit)` only ever reads `nut[1]` (across corners)
 * and `nut[2]` (height); `acrossFlatsMm`/`threadDiameterMm` are carried through
 * for completeness and future recipes (a nut's flats matter for a wrench-clearance
 * check no recipe needs yet), unused by `hardware.nut` itself, same as V1 kept
 * them in the tuple without reading them either.
 *
 * **Provenance (TODO/core-052).** `jscad-hardware@5.0.0` has exactly one metric nut
 * (`MetricNuts.m4`) but a full `ImperialNuts` table (`#0`..`1"`, from boltdepot.com), so:
 *
 * - `m4` and `1/4 hex` are the rows first ported from `1.1.0`, kept byte-for-byte.
 * - The other imperial rows are **generated** from V1 5.0.0 (`scripts/generate-hardware-tables.mjs`,
 *   `hardware-tables.generated.js`) with V1's own derivation (corners = flats / cos 30°).
 * - The other metric rows have **no V1 source**. They are transcribed from ISO 4032
 *   (hex nut, style 1: `s` across flats, `e` min across corners, `m` max height), so
 *   every metric bolt size has a matching nut — the same approach `washer-specs.js`
 *   takes for ISO 7089 washers.
 *
 * A bolt's nut key is its size: `m2.5 socket` → `m2.5`; `#4 socket` → `#4 hex`.
 *
 * @module core/kernel/tables/nut-specs
 */

import { generatedImperialNutSpecs } from './hardware-tables.generated.js'

/**
 * One nut size.
 *
 * @typedef {object} NutSpec
 * @property {number} acrossFlatsMm V1 `F` — width across flats. Unused by
 *   {@link module:core/kernel/recipes/hardware.nut}; carried for completeness.
 * @property {number} acrossCornersMm V1 `C`/`G` — width across corners, the hex's
 *   drawn diameter before a fit clearance delta is added.
 * @property {number} heightMm V1 `H`.
 * @property {number} threadDiameterMm V1 `D` — basic thread diameter. Unused by
 *   the recipe; carried for completeness.
 */

/**
 * Metric rows with no V1 source — ISO 4032 style 1. `m4` is pinned from V1 instead
 * (its across-corners is V1's 8.1, not ISO's 7.66).
 *
 * @param {number} threadDiameterMm
 * @param {number} acrossFlatsMm
 * @param {number} acrossCornersMm
 * @param {number} heightMm
 * @returns {Readonly<NutSpec>}
 */
function iso4032(threadDiameterMm, acrossFlatsMm, acrossCornersMm, heightMm) {
  return Object.freeze({ acrossFlatsMm, acrossCornersMm, heightMm, threadDiameterMm })
}

/**
 * Pinned from `jscad-hardware@1.1.0` / `5.0.0` — see module doc.
 *
 * @type {Readonly<Record<string, NutSpec>>}
 */
const pinnedNutSpecs = Object.freeze({
  // jscad-hardware metric.js — MetricNuts['m4']: [7, 8.1, 3.2, 4]
  m4: iso4032(4, 7, 8.1, 3.2),
  // jscad-hardware imperial.jscad — ImperialNuts['1/4 hex']: [11.113, 12.8, 5.56, 6.35].
  // Already millimetres in V1 — no `util.inch()` call wraps these literals.
  '1/4 hex': iso4032(6.35, 11.113, 12.8, 5.56),
})

/** @type {Readonly<Record<string, NutSpec>>} */
const metricNutSpecs = Object.freeze({
  'm1.6': iso4032(1.6, 3.2, 3.41, 1.3),
  m2: iso4032(2, 4, 4.32, 1.6),
  'm2.5': iso4032(2.5, 5, 5.45, 2),
  m3: iso4032(3, 5.5, 6.01, 2.4),
  m5: iso4032(5, 8, 8.79, 4.7),
  m6: iso4032(6, 10, 11.05, 5.2),
  m8: iso4032(8, 13, 14.38, 6.8),
  m10: iso4032(10, 16, 17.77, 8.4),
  m12: iso4032(12, 18, 20.03, 10.8),
  m14: iso4032(14, 21, 23.36, 12.8),
  m16: iso4032(16, 24, 26.75, 14.8),
  m20: iso4032(20, 30, 32.95, 18),
})

/**
 * Every nut size this project ships: metric first by thread diameter, then imperial
 * by thread diameter.
 *
 * @type {Readonly<Record<string, NutSpec>>}
 */
export const nutSpecs = Object.freeze(
  Object.fromEntries(
    Object.entries({
      ...metricNutSpecs,
      ...Object.fromEntries(
        Object.entries(generatedImperialNutSpecs).map(([key, nut]) => [key, Object.freeze({ ...nut })])
      ),
      ...pinnedNutSpecs,
    }).sort(([ka, a], [kb, b]) => {
      const sa = ka.startsWith('m') ? 0 : 1
      const sb = kb.startsWith('m') ? 0 : 1
      return sa - sb || a.threadDiameterMm - b.threadDiameterMm
    })
  )
)
