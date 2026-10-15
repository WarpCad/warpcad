// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { isDuplicateName, MAX_NAME_LENGTH, normalizeBodyName } from './naming.js'

describe('normalizeBodyName (TODO/core-038)', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeBodyName('  Pi camera bolt  ')).toEqual({ ok: true, name: 'Pi camera bolt' })
  })

  it('treats null, empty and whitespace-only as "clear the override"', () => {
    expect(normalizeBodyName(null)).toEqual({ ok: true, name: null })
    expect(normalizeBodyName('')).toEqual({ ok: true, name: null })
    expect(normalizeBodyName('     ')).toEqual({ ok: true, name: null })
  })

  it('accepts exactly 60 characters and refuses 61', () => {
    expect(MAX_NAME_LENGTH).toBe(60)
    expect(normalizeBodyName('x'.repeat(60))).toEqual({ ok: true, name: 'x'.repeat(60) })
    const refused = /** @type {any} */ (normalizeBodyName('x'.repeat(61)))
    expect(refused.ok).toBe(false)
    expect(refused.reason).toMatch(/60/)
  })

  it('refuses control characters, including newline and tab inside the name', () => {
    for (const bad of ['a\nb', 'a\tb', 'a\u0000b', 'a\u007fb', 'a\u001bb']) {
      expect(normalizeBodyName(bad).ok).toBe(false)
    }
  })

  it('refuses a non-string, non-null value', () => {
    expect(normalizeBodyName(/** @type {any} */ (5)).ok).toBe(false)
    expect(normalizeBodyName(/** @type {any} */ (undefined)).ok).toBe(false)
  })
})

describe('isDuplicateName', () => {
  const bodies = [
    { id: 'a', name: 'Screw' },
    { id: 'b', name: 'Cube 1' },
  ]
  it('is true when another body already has the name (trimmed)', () => {
    expect(isDuplicateName(' Screw ', bodies)).toBe(true)
  })
  it('is false for a new name, a blank, and the body being renamed itself', () => {
    expect(isDuplicateName('Washer', bodies)).toBe(false)
    expect(isDuplicateName('', bodies)).toBe(false)
    expect(isDuplicateName('Screw', bodies, 'a')).toBe(false)
  })
})
