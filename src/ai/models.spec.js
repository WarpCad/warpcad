// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { DEFAULT_MODEL, MODELS, PRICES_AS_OF, estimateCost, isKnownModel, modelLabel } from './models.js'

/** `TODO/ai-004`: the model id is data — one list, one default, never repeated across files. */
describe('the model list', () => {
  it('defaults to Opus 5.5 and offers Sonnet 5.5, nothing else (decision 9: Haiku needs a second request shape)', () => {
    expect(DEFAULT_MODEL).toBe('claude-opus-5-5')
    expect(MODELS.map((m) => m.id)).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5'])
  })

  it('labels a known id and recognises it', () => {
    expect(modelLabel('claude-opus-5-5')).toMatch(/Opus 5\.5/)
    expect(isKnownModel('claude-sonnet-5-5')).toBe(true)
    expect(isKnownModel('claude-haiku-4-5')).toBe(false)
    expect(isKnownModel(undefined)).toBe(false)
  })

  it('falls back to the raw id for a label it does not know', () => {
    expect(modelLabel('claude-future-9')).toBe('claude-future-9')
  })
})

/** `TODO/ai-013`: the price table is dated data in one place, and an estimate is never `NaN`. */
describe('estimateCost', () => {
  it('prices every kind of token on Opus 5.5 ($4 in, $0.20 cache read, $5 cache write, $20 out per MTok)', () => {
    const usage = { input: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000, output: 1_000_000 }
    expect(estimateCost('claude-opus-5-5', usage)).toBeCloseTo(4 + 0.2 + 5 + 20, 6)
  })

  it('prices Sonnet 5.5 separately ($2 in, $0.20 cache read, $2.50 cache write, $10 out)', () => {
    const usage = { input: 500_000, cacheRead: 0, cacheWrite: 0, output: 100_000 }
    expect(estimateCost('claude-sonnet-5-5', usage)).toBeCloseTo(1 + 1, 6)
  })

  it('is null — not NaN, not 0 — for a model with no price, and for unusable usage', () => {
    const usage = { input: 10, cacheRead: 0, cacheWrite: 0, output: 10 }
    expect(estimateCost('claude-future-9', usage)).toBeNull()
    expect(estimateCost('claude-opus-5-5', undefined)).toBeNull()
    expect(estimateCost('claude-opus-5-5', { input: Number.NaN, cacheRead: 0, cacheWrite: 0, output: 1 })).toBeNull()
  })

  it('has a price for every selectable model, and says when the table was read', () => {
    for (const model of MODELS) {
      expect(estimateCost(model.id, { input: 1, cacheRead: 0, cacheWrite: 0, output: 1 })).not.toBeNull()
    }
    expect(PRICES_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
