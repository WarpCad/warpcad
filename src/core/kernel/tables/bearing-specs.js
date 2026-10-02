// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Deep-groove ball bearing size table — no V1 source, transcribed from a published
 * standard, cross-checked against two independent sources (`TODO/core-023` Goal).
 *
 * ## No V1 source exists, at any version
 *
 * `TODO/core-003`'s own spike confirmed this directly against the vendored
 * `jscad-hardware@1.1.0` source: there is no `Bearing` factory anywhere in the
 * package — its only factories are `Bolt`, `Washer` and `Nut`
 * (`jscad-hardware.jscad:20,56,81`) — and a case-insensitive search for "bearing"
 * across the package returns nothing but a jQuery false positive in its docs bundle
 * (`docs/decisions/geometry-kernel.md`, Finding 2). So unlike `nut`/`washer`, this
 * table has no V1 fixture to diff against at all, not even a partial one — the same
 * situation `MetricWashers` (`washer-specs.js`) was already in, resolved there the same
 * way this table resolves it: transcribe a published standard and cross-check two
 * independent sources rather than invent numbers.
 *
 * ## The table — DIN 625 / ISO 15, deep-groove ball bearings
 *
 * Three standard series, 5 sizes each:
 *
 * - **60xx** — light-narrow series. Includes `608` (ID 8 / OD 22 / thickness 7), the
 *   exact size `core-003`'s own hand-typed spike case used (bore/OD/width named
 *   `boreMm`/`odMm`/`widthMm` here to match, not `id`/`od`/`thickness` the way V1's
 *   washer/nut tables are keyed — `bore` avoids colliding with the record `id` field
 *   every op record already carries).
 * - **62xx** — light series (wider and higher-capacity than 60xx at the same bore).
 * - **63xx** — medium series (wider and higher-capacity again).
 *
 * Cross-checked against two independently-sourced tables, which agreed exactly on
 * every value: igus's DIN 625 ball-bearing dimensions table (608, 6000-6004) and
 * ISK's/Be-cu's 6200/6300-series bearing size charts (6200-6204, 6300-6304).
 *
 * | Bearing | Bore (mm) | OD (mm) | Width (mm) |
 * |---|---|---|---|
 * | 608  | 8  | 22 | 7  |
 * | 6000 | 10 | 26 | 8  |
 * | 6001 | 12 | 28 | 8  |
 * | 6002 | 15 | 32 | 9  |
 * | 6003 | 17 | 35 | 10 |
 * | 6004 | 20 | 42 | 12 |
 * | 6200 | 10 | 30 | 9  |
 * | 6201 | 12 | 32 | 10 |
 * | 6202 | 15 | 35 | 11 |
 * | 6203 | 17 | 40 | 12 |
 * | 6204 | 20 | 47 | 14 |
 * | 6300 | 10 | 35 | 11 |
 * | 6301 | 12 | 37 | 12 |
 * | 6302 | 15 | 42 | 13 |
 * | 6303 | 17 | 47 | 14 |
 * | 6304 | 20 | 52 | 15 |
 *
 * @module core/kernel/tables/bearing-specs
 */

/**
 * One bearing size, in millimetres — the fields `hardware.bearing.js` reads to build a
 * `primitive.tube`.
 *
 * @typedef {object} BearingSpec
 * @property {number} boreMm Inner (bore) diameter — the shaft it fits over.
 * @property {number} odMm Outer diameter.
 * @property {number} widthMm Axial width (V1-adjacent recipes call this "height"/
 *   "thickness"; `width` is this series' own catalogue term).
 */

/**
 * Every deep-groove ball bearing size this project ships, all three series flat in one
 * table — the same shape `washerSpecs`/`nutSpecs` present to their recipes.
 *
 * @type {Readonly<Record<string, BearingSpec>>}
 */
export const bearingSpecs = Object.freeze({
  '608': Object.freeze({ boreMm: 8, odMm: 22, widthMm: 7 }),
  '6000': Object.freeze({ boreMm: 10, odMm: 26, widthMm: 8 }),
  '6001': Object.freeze({ boreMm: 12, odMm: 28, widthMm: 8 }),
  '6002': Object.freeze({ boreMm: 15, odMm: 32, widthMm: 9 }),
  '6003': Object.freeze({ boreMm: 17, odMm: 35, widthMm: 10 }),
  '6004': Object.freeze({ boreMm: 20, odMm: 42, widthMm: 12 }),
  '6200': Object.freeze({ boreMm: 10, odMm: 30, widthMm: 9 }),
  '6201': Object.freeze({ boreMm: 12, odMm: 32, widthMm: 10 }),
  '6202': Object.freeze({ boreMm: 15, odMm: 35, widthMm: 11 }),
  '6203': Object.freeze({ boreMm: 17, odMm: 40, widthMm: 12 }),
  '6204': Object.freeze({ boreMm: 20, odMm: 47, widthMm: 14 }),
  '6300': Object.freeze({ boreMm: 10, odMm: 35, widthMm: 11 }),
  '6301': Object.freeze({ boreMm: 12, odMm: 37, widthMm: 12 }),
  '6302': Object.freeze({ boreMm: 15, odMm: 42, widthMm: 13 }),
  '6303': Object.freeze({ boreMm: 17, odMm: 47, widthMm: 14 }),
  '6304': Object.freeze({ boreMm: 20, odMm: 52, widthMm: 15 }),
})
