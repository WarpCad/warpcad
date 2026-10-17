// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { WOOD_FIT_CLASSES, woodScrewHolesMm } from './wood-screw-holes.js'
import { inchToMm } from './bolt-specs.js'

/**
 * The chart's own cells, typed again here from the source (Albany County Fasteners, "Wood
 * Screw Pilot Hole Guide", retrieved 2026-10-16) as the inch fractions it prints, so the
 * table module is checked against the chart rather than against itself.
 * Columns: softwood pilot, hardwood pilot, clearance hole.
 *
 * @type {Record<string, [string, string, string]>}
 */
const CHART = {
  '#2': ['1/16', '5/64', '3/32'],
  '#3': ['1/16', '5/64', '7/64'],
  '#4': ['5/64', '3/32', '1/8'],
  '#5': ['5/64', '3/32', '9/64'],
  '#6': ['3/32', '7/64', '9/64'],
  '#7': ['3/32', '7/64', '5/32'],
  '#8': ['7/64', '1/8', '11/64'],
  '#9': ['7/64', '1/8', '3/16'],
  '#10': ['1/8', '9/64', '3/16'],
  '#12': ['9/64', '5/32', '7/32'],
  '#14': ['5/32', '3/16', '1/4'],
}

/** @param {string} fraction e.g. `'11/64'` @returns {number} inches */
function inches(fraction) {
  const [numerator, denominator] = fraction.split('/').map(Number)
  return numerator / denominator
}

describe('wood-screw pilot and clearance holes (TODO/core-060)', () => {
  it('offers the three fits the chart gives: clearance, hardwood pilot, softwood pilot', () => {
    expect([...WOOD_FIT_CLASSES]).toEqual(['clearance', 'hardwood', 'softwood'])
  })

  it('holds exactly the gauges the chart covers, no more (no interpolation)', () => {
    expect(Object.keys(woodScrewHolesMm)).toEqual(Object.keys(CHART))
  })

  it.each(Object.entries(CHART))('%s matches the chart, converted to millimetres', (gauge, [soft, hard, clear]) => {
    const row = woodScrewHolesMm[gauge]
    expect(row.softwood).toBeCloseTo(inchToMm(inches(soft)), 9)
    expect(row.hardwood).toBeCloseTo(inchToMm(inches(hard)), 9)
    expect(row.clearance).toBeCloseTo(inchToMm(inches(clear)), 9)
  })

  it('for every gauge: hardwood pilot < shank clearance, and softwood pilot <= hardwood pilot', () => {
    for (const [gauge, row] of Object.entries(woodScrewHolesMm)) {
      expect(row.hardwood, gauge).toBeLessThan(row.clearance)
      expect(row.softwood, gauge).toBeLessThanOrEqual(row.hardwood)
    }
  })

  it('is frozen data', () => {
    expect(Object.isFrozen(woodScrewHolesMm)).toBe(true)
    expect(Object.isFrozen(woodScrewHolesMm['#8'])).toBe(true)
  })
})
