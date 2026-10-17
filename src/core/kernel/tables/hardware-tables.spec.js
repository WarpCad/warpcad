// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { boltSpecs, FIT_CLASSES } from './bolt-specs.js'
import { nutSpecs } from './nut-specs.js'
import { washerSpecs } from './washer-specs.js'
import { generatedFallbackRows } from './hardware-tables.generated.js'
import { bolt } from '../recipes/hardware.bolt.js'
import { DEFAULT_SIZE_BY_TYPE, FASTENER_TYPES, fastenerSpecs as realFastenerSpecs } from './fastener-specs.js'
import { screwSpecs } from './screw-specs.js'
import { woodScrewHolesMm } from './wood-screw-holes.js'

/**
 * The nut key a bolt key needs: `m2.5 socket` → `m2.5`, `#4 socket` → `#4 hex`,
 * `1/4 hex` → `1/4 hex`.
 *
 * @param {string} key
 * @returns {string}
 */
function nutKeyFor(key) {
  const [size] = key.split(' ')
  return size.startsWith('m') ? size : `${size} hex`
}

describe('bolt / nut / washer table consistency (TODO/core-052)', () => {
  const entries = Object.entries(boltSpecs)

  it('every key is "<size> <head>" with a known head word, and unique after case-folding', () => {
    const folded = new Set()
    for (const [key] of entries) {
      expect(key, key).toMatch(/^\S+ (hex|socket)$/)
      expect(folded.has(key.toLowerCase()), `duplicate ${key}`).toBe(false)
      folded.add(key.toLowerCase())
    }
  })

  it('has no fit-fallback rows: every shipped size has real tap/close/loose data', () => {
    // The generator lists rows whose fits fell back to the body diameter. Shipping any
    // would mean a tap hole exactly the bolt's size; the set is capped so none do.
    expect(generatedFallbackRows).toEqual([])
  })

  it('fits are ordered tap <= close <= loose, and a tap hole is narrower than the body', () => {
    for (const [key, spec] of entries) {
      const { tap, close, loose } = spec.fitDiameterMm
      expect(tap, key).toBeLessThanOrEqual(close)
      expect(close, key).toBeLessThanOrEqual(loose)
      expect(tap, key).toBeLessThan(spec.bodyDiameterMm)
      expect(Object.keys(spec.fitDiameterMm).sort(), key).toEqual([...FIT_CLASSES].sort())
    }
  })

  it('the head is wider than the shank', () => {
    for (const [key, spec] of entries) {
      expect(spec.headDiameterMm, key).toBeGreaterThan(spec.bodyDiameterMm)
    }
  })

  it('every bolt has a matching nut, so "bolt but no nut" cannot return', () => {
    for (const [key] of entries) expect(nutSpecs[nutKeyFor(key)], `${key} -> ${nutKeyFor(key)}`).toBeDefined()
  })

  it('every metric bolt has a matching washer', () => {
    for (const [key] of entries.filter(([k]) => k.startsWith('m'))) {
      expect(washerSpecs[nutKeyFor(key)], key).toBeDefined()
    }
  })

  it('a nut is wider than the bolt it fits', () => {
    for (const [key, spec] of entries) {
      expect(nutSpecs[nutKeyFor(key)].acrossFlatsMm, key).toBeGreaterThan(spec.bodyDiameterMm)
    }
  })

  it('evaluates to a non-empty recipe expansion for every row at length 20', () => {
    for (const [key] of entries) {
      const records = bolt({ spec: key, length: 20, fit: 'tap' }, { boltSpecs })
      expect(records.length, key).toBeGreaterThan(0)
      const head = records.find((r) => r.id === 'head.solid')
      expect(head?.params?.diameter, key).toBeCloseTo(boltSpecs[key].headDiameterMm, 6)
    }
  })
})

describe('one fastener table per Type (TODO/core-060)', () => {
  /** Indexed by plain strings in these tests. */
  const fastenerSpecs = /** @type {Record<string, Record<string, any>>} */ (realFastenerSpecs)

  it('has the six Types, in the order the dropdown lists them', () => {
    expect([...FASTENER_TYPES]).toEqual(['socket', 'hex', 'pan', 'flat', 'woodPan', 'woodFlat'])
    expect(Object.keys(fastenerSpecs)).toEqual([...FASTENER_TYPES])
  })

  it('socket and hex are exactly today\'s boltSpecs rows, split by their suffix — the same objects', () => {
    for (const [key, row] of Object.entries(boltSpecs)) {
      const [size, suffix] = key.split(' ')
      expect(fastenerSpecs[suffix][size], key).toBe(row)
    }
    const count = Object.keys(fastenerSpecs.socket).length + Object.keys(fastenerSpecs.hex).length
    expect(count).toBe(Object.keys(boltSpecs).length)
  })

  it('pan is the single m4 row jscad-hardware ships (a real table gap), with metric tap-table fits', () => {
    expect(Object.keys(fastenerSpecs.pan)).toEqual(['m4'])
    const m4 = fastenerSpecs.pan.m4
    expect([m4.headDiameterMm, m4.headHeightMm, m4.bodyDiameterMm]).toEqual([8, 3.1, 4])
    // ScrewTapSizes m4: tap 3.25, close 4.20, loose 4.40 — the same table bolt fits come from.
    expect(m4.fitDiameterMm).toEqual({ tap: 3.25, close: 4.2, loose: 4.4 })
  })

  it('flat is 5.0.0 MetricFlatHeadScrews m2..m10 (head height K, head diameter D2), with tap-table fits', () => {
    expect(Object.keys(fastenerSpecs.flat)).toEqual(['m2', 'm2.5', 'm3', 'm4', 'm5', 'm6', 'm8', 'm10'])
    const K = [1.2, 1.5, 1.65, 2.2, 2.5, 3, 4, 5]
    const D2 = [3.8, 4.7, 5.6, 7.5, 9.2, 11, 14.5, 18]
    Object.values(fastenerSpecs.flat).forEach((row, index) => {
      expect(row.headHeightMm).toBe(K[index])
      expect(row.headDiameterMm).toBe(D2[index])
    })
    expect(fastenerSpecs.flat.m3.bodyDiameterMm).toBe(3)
    expect(fastenerSpecs.flat.m3.fitDiameterMm).toEqual(boltSpecs['m3 socket'].fitDiameterMm)
    expect(fastenerSpecs.flat.m2.fitDiameterMm).toEqual({ tap: 1.55, close: 2.1, loose: 2.2 })
  })

  it('wood screws are 5.0.0 ImperialWoodScrews #2..#16, and #4..#12 equal today\'s screwSpecs exactly', () => {
    const gauges = ['#2', '#3', '#4', '#5', '#6', '#7', '#8', '#9', '#10', '#12', '#14', '#16']
    expect(Object.keys(fastenerSpecs.woodPan)).toEqual(gauges)
    expect(Object.keys(fastenerSpecs.woodFlat)).toEqual(gauges)
    for (const gauge of ['#4', '#6', '#8', '#10', '#12']) {
      const { headDiameterMm, headHeightMm, bodyDiameterMm } = fastenerSpecs.woodPan[gauge]
      expect({ headDiameterMm, headHeightMm, bodyDiameterMm }, gauge).toEqual(screwSpecs[gauge])
      expect(fastenerSpecs.woodFlat[gauge], gauge).toBe(fastenerSpecs.woodPan[gauge])
    }
  })

  it('wood fits are the pilot-hole chart\'s holes where it covers the gauge, and absent where it does not', () => {
    for (const [gauge, row] of Object.entries(fastenerSpecs.woodPan)) {
      expect(row.fitDiameterMm, gauge).toBe(woodScrewHolesMm[gauge])
    }
    expect(fastenerSpecs.woodPan['#16'].fitDiameterMm).toBeUndefined()
  })

  it('every metric pan/flat fit is ordered tap < body <= close <= loose', () => {
    for (const type of ['pan', 'flat']) {
      for (const [size, row] of Object.entries(fastenerSpecs[type])) {
        const { tap, close, loose } = row.fitDiameterMm
        expect(tap, `${type} ${size}`).toBeLessThan(row.bodyDiameterMm)
        expect(row.bodyDiameterMm, `${type} ${size}`).toBeLessThanOrEqual(close)
        expect(close, `${type} ${size}`).toBeLessThanOrEqual(loose)
      }
    }
  })

  it('every head is wider than its shank', () => {
    for (const type of FASTENER_TYPES) {
      for (const [size, row] of Object.entries(fastenerSpecs[type])) {
        expect(row.headDiameterMm, `${type} ${size}`).toBeGreaterThan(row.bodyDiameterMm)
      }
    }
  })

  it('each Type\'s default size exists in its own table', () => {
    expect(DEFAULT_SIZE_BY_TYPE).toEqual({ socket: 'm3', hex: 'm10', pan: 'm4', flat: 'm3', woodPan: '#8', woodFlat: '#8' })
    for (const type of FASTENER_TYPES) expect(fastenerSpecs[type][DEFAULT_SIZE_BY_TYPE[type]], type).toBeDefined()
  })
})
