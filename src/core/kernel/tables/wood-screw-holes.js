// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Wood-screw hole sizes per gauge — the **Fit** a `woodPan`/`woodFlat` fastener offers
 * (TODO/core-060).
 *
 * ## Source
 *
 * Albany County Fasteners, *Wood Screw Pilot Hole Guide* (PDF, "Pilot Hole Size Chart",
 * © 2025), <https://www.albanycountyfasteners.com/media/51/31/8c/1764682594/wood-screw-pilot-hole-guide.pdf>,
 * retrieved 2026-10-16. A fastener supplier's own published chart. **Units: inches**,
 * printed as drill-bit fractions (the softwood and hardwood pilot columns also print a
 * rounded millimetre size in parentheses; the fraction is what is ported, because the
 * millimetre figures are rounded to 0.1 mm and the fraction is the drill a user buys).
 *
 * Only the dimensional facts are ported, as data — no prose from the source.
 *
 * Columns used, per gauge:
 *
 * - **Softwood Pilot Hole** → `softwood`: the pilot for a soft piece the thread bites into.
 * - **Hardwood Pilot Hole** → `hardwood`: the pilot for a hard piece the thread bites into.
 * - **Clearance Hole** → `clearance`: the hole the shank passes through freely, for the
 *   piece being fastened down.
 *
 * Not used: the chart's **Countersink Diameter** column. It repeats the Clearance Hole
 * column cell for cell (3/32" for a #2, whose head is 0.172" across), so it cannot be a
 * countersink diameter. A `woodFlat`'s countersink is instead its own head cone grown by
 * the clearance, which is how every other fastener's `tap` is built.
 *
 * ## Why this chart, and its limits
 *
 * The user ruled out `jscad-hardware`'s `WoodScrewDiameter` columns (unlabelled, 2026-10-15).
 * Of the published charts found, this is the one from a fastener company that gives all
 * three holes per gauge; Bolt Depot's and Fair Wind Fasteners' give pilots but no clearance
 * hole. Its clearance column agrees with The Engineering ToolBox's "US Wood Screws — Pilot
 * Holes" on nine of its eleven gauges (#4 and #5 are 1/64" larger here).
 *
 * - **Gauges covered: #2–#10, #12, #14.** The chart has no #11, #13, #15 or #16 row; a gauge
 *   it does not cover has **no wood Fit** (no field, no `tap` part). Nothing is
 *   interpolated or invented.
 * - **#10's clearance (3/16" = 0.1875") is 0.0025" under the nominal #10 shank (0.190").**
 *   Ported as published, not corrected. So a #10 wood `tap`'s head grows by a slightly
 *   negative clearance (−0.0635 mm), the same way a bolt's `tap` fit already shrinks it.
 *
 * @module core/kernel/tables/wood-screw-holes
 */

import { inchToMm } from './bolt-specs.js'

/**
 * The wood Fit classes, in the order the Inspector lists them.
 *
 * @type {readonly ['clearance', 'hardwood', 'softwood']}
 */
export const WOOD_FIT_CLASSES = Object.freeze(/** @type {['clearance', 'hardwood', 'softwood']} */ ([
  'clearance',
  'hardwood',
  'softwood',
]))

/**
 * The chart, in its own units: `[softwood pilot, hardwood pilot, clearance]`, inches,
 * written as the fractions it prints.
 *
 * @type {Readonly<Record<string, readonly [number, number, number]>>}
 */
const CHART_INCHES = Object.freeze({
  '#2': [1 / 16, 5 / 64, 3 / 32],
  '#3': [1 / 16, 5 / 64, 7 / 64],
  '#4': [5 / 64, 3 / 32, 1 / 8],
  '#5': [5 / 64, 3 / 32, 9 / 64],
  '#6': [3 / 32, 7 / 64, 9 / 64],
  '#7': [3 / 32, 7 / 64, 5 / 32],
  '#8': [7 / 64, 1 / 8, 11 / 64],
  '#9': [7 / 64, 1 / 8, 3 / 16],
  '#10': [1 / 8, 9 / 64, 3 / 16],
  '#12': [9 / 64, 5 / 32, 7 / 32],
  '#14': [5 / 32, 3 / 16, 1 / 4],
})

/**
 * Hole diameter per wood Fit class, in millimetres, per gauge the chart covers. Shaped
 * like a bolt row's `fitDiameterMm`, so the recipe reads either the same way.
 *
 * @type {Readonly<Record<string, Readonly<Record<'clearance' | 'hardwood' | 'softwood', number>>>>}
 */
export const woodScrewHolesMm = Object.freeze(
  Object.fromEntries(
    Object.entries(CHART_INCHES).map(([gauge, [softwood, hardwood, clearance]]) => [
      gauge,
      Object.freeze({
        clearance: inchToMm(clearance),
        hardwood: inchToMm(hardwood),
        softwood: inchToMm(softwood),
      }),
    ])
  )
)
