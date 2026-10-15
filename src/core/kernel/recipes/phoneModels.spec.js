// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PHONE_CASE,
  DEFAULT_PHONE_MODEL,
  PHONE_CASES,
  PHONE_MODELS,
  phoneModelById,
} from './phoneModels.js'

const STATUSES = ['verified', 'estimate']
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Apple's published outer sizes, copied by hand from TODO/core-057 (retrieved 2026-10-15
 * from apple.com/iphone/compare). The oracle is this table, not the module under test.
 * `[height Y, width X, depth Z]`.
 */
const APPLE_ORACLE = {
  'iphone-17-pro': [150.0, 71.9, 8.75],
  'iphone-17-pro-max': [163.4, 78.0, 8.75],
  'iphone-17': [149.6, 71.5, 7.95],
  'iphone-air': [156.2, 74.7, 5.64],
  'iphone-16-pro': [149.6, 71.5, 8.25],
  'iphone-16-pro-max': [163.0, 77.6, 8.25],
  'iphone-16': [147.6, 71.6, 7.8],
  'iphone-16-plus': [160.9, 77.8, 7.8],
  'iphone-16e': [146.7, 71.5, 7.8],
  'iphone-se-3': [138.4, 67.3, 7.3],
}

describe('the handset table is honest about where every number came from', () => {
  it('gives every row a source, a retrieval date and a verified|estimate status', () => {
    expect(PHONE_MODELS.length).toBeGreaterThanOrEqual(10)
    for (const row of PHONE_MODELS) {
      expect(row.source, row.id).toMatch(/\S/)
      expect(row.retrieved, row.id).toMatch(ISO_DATE)
      expect(STATUSES, row.id).toContain(row.status)
    }
  })

  it('has finite, positive sizes and a plateau record with its own provenance', () => {
    for (const row of PHONE_MODELS) {
      for (const value of [row.widthMm, row.heightMm, row.depthMm]) {
        expect(Number.isFinite(value) && value > 0, row.id).toBe(true)
      }
      expect(row.plateaus.length, row.id).toBeGreaterThanOrEqual(1)
      expect(row.plateaus[0].name, row.id).toBe('plateau')
      for (const plateau of row.plateaus) {
        expect(STATUSES, `${row.id} ${plateau.name}`).toContain(plateau.status)
        expect(plateau.source, `${row.id} ${plateau.name}`).toMatch(/\S/)
        expect(plateau.widthMm).toBeGreaterThan(0)
        expect(plateau.lengthMm).toBeGreaterThan(0)
        expect(plateau.heightMm).toBeGreaterThan(0)
        // It sits on the back: it has to fit inside the bare handset.
        expect(plateau.widthMm).toBeLessThanOrEqual(row.widthMm)
        expect(plateau.fromTopMm + plateau.lengthMm).toBeLessThanOrEqual(row.heightMm)
      }
    }
  })

  it('never calls a plateau verified: no manufacturer publishes one', () => {
    for (const row of PHONE_MODELS) {
      for (const plateau of row.plateaus) expect(plateau.status, row.id).toBe('estimate')
    }
  })

  it('matches Apple’s published outer sizes, and marks them verified', () => {
    for (const [id, [height, width, depth]] of Object.entries(APPLE_ORACLE)) {
      const row = /** @type {import('./phoneModels.js').PhoneModel} */ (phoneModelById(id))
      expect(row, id).toBeDefined()
      expect(row.heightMm, id).toBeCloseTo(height, 6)
      expect(row.widthMm, id).toBeCloseTo(width, 6)
      expect(row.depthMm, id).toBeCloseTo(depth, 6)
      expect(row.status, id).toBe('verified')
    }
  })

  it('marks every Android row an estimate and has unique ids', () => {
    const ids = PHONE_MODELS.map((row) => row.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const row of PHONE_MODELS.filter((r) => !r.id.startsWith('iphone'))) {
      expect(row.status, row.id).toBe('estimate')
    }
    expect(ids).toEqual(expect.arrayContaining(['galaxy-s25-ultra', 'pixel-10-pro', 'pixel-10-pro-xl']))
  })

  it('defaults to the iPhone 17 Pro in a Slim case', () => {
    expect(DEFAULT_PHONE_MODEL).toBe('iphone-17-pro')
    expect(DEFAULT_PHONE_CASE).toBe('slim')
  })
})

describe('the case presets', () => {
  it('lists none, slim, protective, rugged, techweave and custom, each with provenance', () => {
    expect(Object.keys(PHONE_CASES)).toEqual(['none', 'slim', 'protective', 'rugged', 'techweave', 'custom'])
    for (const [id, preset] of Object.entries(PHONE_CASES)) {
      expect(preset.label, id).toMatch(/\S/)
      expect(preset.source, id).toMatch(/\S/)
      expect(STATUSES, id).toContain(preset.status)
      expect(preset.addWidthMm, id).toBeGreaterThanOrEqual(0)
    }
  })

  it('adds nothing for none and custom', () => {
    for (const id of ['none', 'custom']) {
      expect([PHONE_CASES[id].addWidthMm, PHONE_CASES[id].addLengthMm, PHONE_CASES[id].addDepthMm]).toEqual([0, 0, 0])
    }
  })

  it('keeps TechWeave as the original 77 x 157 x 9 estimate over an iPhone 17 Pro', () => {
    const phone = /** @type {import('./phoneModels.js').PhoneModel} */ (phoneModelById('iphone-17-pro'))
    const c = PHONE_CASES.techweave
    expect(phone.widthMm + c.addWidthMm).toBeCloseTo(77, 6)
    expect(phone.heightMm + c.addLengthMm).toBeCloseTo(157, 6)
    expect(phone.depthMm + c.addDepthMm).toBeCloseTo(9, 6)
    expect(c.status).toBe('estimate')
  })

  it('cites the one manufacturer-published case size for Rugged', () => {
    // OtterBox Defender Pro: 161.75 x 84.65 x 16.73 over 150.0 x 71.9 x 8.75.
    const phone = /** @type {import('./phoneModels.js').PhoneModel} */ (phoneModelById('iphone-17-pro'))
    const c = PHONE_CASES.rugged
    expect(c.source).toMatch(/OtterBox/)
    expect(phone.widthMm + c.addWidthMm).toBeCloseTo(84.65, 0)
    expect(phone.heightMm + c.addLengthMm).toBeCloseTo(161.75, 0)
    expect(phone.depthMm + c.addDepthMm).toBeCloseTo(16.73, 0)
  })
})
