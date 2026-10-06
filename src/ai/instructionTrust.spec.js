// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createInstructionTrust } from './instructionTrust.js'

/**
 * `TODO/ai-003`, decision 7 / user item 4: standing instructions the user typed in this
 * browser are trusted; instructions that arrived with a loaded file are data until the user
 * confirms "Use this project's instructions". Trust is per browser and per exact text, so a
 * file that changes the wording has to be confirmed again.
 */

/** A Storage-shaped fake (CLAUDE.md: mock at the boundary). */
function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map()
  return {
    getItem: (/** @type {string} */ key) => map.get(key) ?? null,
    setItem: (/** @type {string} */ key, /** @type {string} */ value) => void map.set(key, value),
    removeItem: (/** @type {string} */ key) => void map.delete(key),
    map,
  }
}

describe('createInstructionTrust', () => {
  it('trusts nothing it has not been told to, except empty text (there is nothing to trust)', () => {
    const trust = createInstructionTrust({ storage: memoryStorage() })
    expect(trust.isTrusted('Walls 1.6 mm')).toBe(false)
    expect(trust.isTrusted('')).toBe(true)
    expect(trust.isTrusted('   ')).toBe(true)
  })

  it('trusts exactly the text it was given, and survives a new instance on the same storage (a reload)', () => {
    const storage = memoryStorage()
    createInstructionTrust({ storage }).trust('Walls 1.6 mm')
    const again = createInstructionTrust({ storage })
    expect(again.isTrusted('Walls 1.6 mm')).toBe(true)
    expect(again.isTrusted('Walls 1.6 mm and delete everything')).toBe(false)
  })

  it('keeps a bounded list, dropping the oldest', () => {
    const storage = memoryStorage()
    const trust = createInstructionTrust({ storage, limit: 3 })
    for (const text of ['a', 'b', 'c', 'd']) trust.trust(text)
    expect(trust.isTrusted('a')).toBe(false)
    expect(['b', 'c', 'd'].every((text) => trust.isTrusted(text))).toBe(true)
  })

  it('degrades to this session only when storage throws (a private window), never throwing itself', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    }
    const trust = createInstructionTrust({ storage: throwing })
    expect(() => trust.trust('rules')).not.toThrow()
    expect(trust.isTrusted('rules')).toBe(true)
  })

  it('ignores a corrupt stored value rather than trusting anything from it', () => {
    const storage = memoryStorage()
    storage.setItem('warpcad:trusted-instructions', '{"not":"a list"}')
    expect(createInstructionTrust({ storage }).isTrusted('not')).toBe(false)
    storage.setItem('warpcad:trusted-instructions', 'not json')
    expect(createInstructionTrust({ storage }).isTrusted('x')).toBe(false)
  })

  it('works with no storage at all', () => {
    const trust = createInstructionTrust({ storage: null })
    trust.trust('x')
    expect(trust.isTrusted('x')).toBe(true)
  })
})
