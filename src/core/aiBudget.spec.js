// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { AI_STEP_LIMIT, aiStepLimitRangeText, checkAiStepLimit, formatSteps, isAiStepLimit, normalizeAiStepLimit } from './aiBudget.js'

describe('AI_STEP_LIMIT — the default and the range (TODO/ai-033)', () => {
  it('is 1,000 by default, 50 to 5,000, frozen', () => {
    expect(AI_STEP_LIMIT).toEqual({ default: 1000, min: 50, max: 5000 })
    expect(Object.isFrozen(AI_STEP_LIMIT)).toBe(true)
    expect(AI_STEP_LIMIT.min).toBeLessThanOrEqual(AI_STEP_LIMIT.default)
    expect(AI_STEP_LIMIT.default).toBeLessThanOrEqual(AI_STEP_LIMIT.max)
  })

  it('names the range in the words the sheet shows', () => {
    expect(aiStepLimitRangeText()).toBe('Enter a whole number of steps from 50 to 5,000.')
  })

  it('formats a count with thousands separators, whatever the locale', () => {
    expect(formatSteps(1000)).toBe('1,000')
    expect(formatSteps(50)).toBe('50')
    expect(formatSteps(5000)).toBe('5,000')
  })
})

describe('checkAiStepLimit — whole numbers in range only', () => {
  it.each([50, 51, 200, 1000, 4999, 5000])('accepts %s', (value) => {
    expect(checkAiStepLimit(value)).toEqual({ ok: true, value })
    expect(isAiStepLimit(value)).toBe(true)
    expect(normalizeAiStepLimit(value)).toBe(value)
  })

  it.each([
    ['zero', 0],
    ['a negative number', -100],
    ['a fraction', 1.5],
    ['one below the minimum', 49],
    ['one past the maximum', 5001],
    ['a fraction just inside the range', 50.000001],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['a numeric string', '1000'],
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined],
    ['a boolean', true],
    ['an array holding a number', [1000]],
    ['an object', { value: 1000 }],
    ['a huge safe integer', Number.MAX_SAFE_INTEGER],
    ['negative zero', -0],
  ])('refuses %s, naming the range', (label, value) => {
    const verdict = checkAiStepLimit(value)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.reason).toBe(aiStepLimitRangeText())
    expect(isAiStepLimit(value)).toBe(false)
    expect(() => normalizeAiStepLimit(value)).toThrow('Enter a whole number of steps from 50 to 5,000.')
  })
})
