// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { DEFAULT_MODEL, MODELS, isKnownModel, modelLabel } from './models.js'

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
