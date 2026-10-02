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
 * **Real table gap** — do not invent additional sizes:
 *
 * - `MetricNuts` has exactly **one** entry: `'m4'`. `metric.jscad`'s own
 *   `/* exported *\/` header lists `MetricNuts` alongside `MetricBolts` and
 *   `MetricScrews`, but the object itself holds only this one key.
 * - `ImperialNuts` has exactly **one** entry: `'1/4 hex'`.
 *
 * If more sizes are needed later, that's a table-only follow-up (`TODO/core-010`),
 * not a reason this recipe should have blocked on it.
 *
 * @module core/kernel/tables/nut-specs
 */

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
 * Every nut size `jscad-hardware` v1 actually shipped.
 *
 * @type {Readonly<Record<string, NutSpec>>}
 */
export const nutSpecs = Object.freeze({
  // jscad-hardware metric.jscad — MetricNuts['m4']: [7, 8.1, 3.2, 4]
  m4: Object.freeze({
    acrossFlatsMm: 7,
    acrossCornersMm: 8.1,
    heightMm: 3.2,
    threadDiameterMm: 4,
  }),
  // jscad-hardware imperial.jscad — ImperialNuts['1/4 hex']: [11.113, 12.8, 5.56, 6.35].
  // Already millimetres in V1 — no `util.inch()` call wraps these literals, unlike
  // ImperialBolts' fields — so this is a straight port, not a conversion.
  '1/4 hex': Object.freeze({
    acrossFlatsMm: 11.113,
    acrossCornersMm: 12.8,
    heightMm: 5.56,
    threadDiameterMm: 6.35,
  }),
})
