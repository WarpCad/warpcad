// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { boltSpecs, FIT_CLASSES } from './bolt-specs.js'
import { nutSpecs } from './nut-specs.js'
import { washerSpecs } from './washer-specs.js'
import { generatedFallbackRows } from './hardware-tables.generated.js'
import { bolt } from '../recipes/hardware.bolt.js'

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
