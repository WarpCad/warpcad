// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { AI_STEP_LIMIT } from '../core/aiBudget.js'
import { APPROVAL_STORAGE_KEY, createStepLimitApproval, effectiveStepLimit } from './stepLimitApproval.js'

/** @returns {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void, data: Map<string, string> }} */
function memoryStorage() {
  const data = new Map()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

const throwing = {
  getItem() {
    throw new Error('SecurityError')
  },
  setItem() {
    throw new Error('QuotaExceededError')
  },
}

describe('effectiveStepLimit — min(stored, max(default, approved)) (TODO/ai-033)', () => {
  it('rule 1: a value at or below the default always applies — lowering is always safe', () => {
    expect(effectiveStepLimit(50, AI_STEP_LIMIT.default)).toBe(50)
    expect(effectiveStepLimit(600, AI_STEP_LIMIT.default)).toBe(600)
    expect(effectiveStepLimit(AI_STEP_LIMIT.default, AI_STEP_LIMIT.default)).toBe(AI_STEP_LIMIT.default)
    // Even with nothing approved past the default, and with a higher approval.
    expect(effectiveStepLimit(200, 4000)).toBe(200)
  })

  it('rule 3: a file value above the default applies only up to what this browser approved', () => {
    expect(effectiveStepLimit(3000, AI_STEP_LIMIT.default)).toBe(AI_STEP_LIMIT.default)
    expect(effectiveStepLimit(3000, 2000)).toBe(2000)
    expect(effectiveStepLimit(3000, 3000)).toBe(3000)
    expect(effectiveStepLimit(3000, 5000)).toBe(3000)
  })

  it('an approval below the default never lowers a default-or-lower value', () => {
    expect(effectiveStepLimit(AI_STEP_LIMIT.default, 50)).toBe(AI_STEP_LIMIT.default)
  })
})

describe('createStepLimitApproval — the approved-up-to number in this browser', () => {
  it('starts at the default when nothing is stored', () => {
    const approval = createStepLimitApproval({ storage: memoryStorage() })
    expect(approval.approved()).toBe(AI_STEP_LIMIT.default)
  })

  it('rule 2: approving a higher value stores it under its key; a lower one changes nothing', () => {
    const storage = memoryStorage()
    const approval = createStepLimitApproval({ storage })
    approval.approve(3000)
    expect(approval.approved()).toBe(3000)
    expect(storage.data.get(APPROVAL_STORAGE_KEY)).toBe('3000')
    approval.approve(2000)
    expect(approval.approved()).toBe(3000)
    expect(storage.data.get(APPROVAL_STORAGE_KEY)).toBe('3000')
  })

  it('is shared by a second instance over the same storage (another tab, a reload)', () => {
    const storage = memoryStorage()
    createStepLimitApproval({ storage }).approve(2500)
    expect(createStepLimitApproval({ storage }).approved()).toBe(2500)
  })

  it('reads a stored value that is not a valid limit as the default', () => {
    for (const bad of ['abc', '1.5', '999999', '-3', '', '{"a":1}']) {
      const storage = memoryStorage()
      storage.data.set(APPROVAL_STORAGE_KEY, bad)
      expect(createStepLimitApproval({ storage }).approved()).toBe(AI_STEP_LIMIT.default)
    }
  })

  it('refuses to approve a value outside the range', () => {
    const approval = createStepLimitApproval({ storage: memoryStorage() })
    for (const bad of [5001, 1.5, Number.NaN, Number.POSITIVE_INFINITY, /** @type {any} */ ('3000')]) {
      approval.approve(/** @type {number} */ (bad))
      expect(approval.approved()).toBe(AI_STEP_LIMIT.default)
    }
  })

  it('blocked storage degrades to this session only, never to an exception', () => {
    const approval = createStepLimitApproval({ storage: throwing })
    expect(approval.approved()).toBe(AI_STEP_LIMIT.default)
    expect(() => approval.approve(3000)).not.toThrow()
    expect(approval.approved()).toBe(3000)
    // A fresh instance over the same blocked storage has nothing: it was this session only.
    expect(createStepLimitApproval({ storage: throwing }).approved()).toBe(AI_STEP_LIMIT.default)
  })

  it('works with no storage at all', () => {
    const approval = createStepLimitApproval({ storage: null })
    approval.approve(1200)
    expect(approval.approved()).toBe(1200)
  })
})
