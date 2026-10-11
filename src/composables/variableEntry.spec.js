// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { parseOptionList, seedDefinition, suggestVariableName } from './variableEntry.js'

describe('suggestVariableName', () => {
  it.each([
    ['Model', [], 'model'],
    ['Pi model', [], 'piModel'],
    ['Size X', [], 'sizeX'],
    ['  wall   thickness! ', [], 'wallThickness'],
    ['3D thing', [], 'v3DThing'],
    ['', [], 'v'],
  ])('%j -> %j', (label, taken, expected) => {
    expect(suggestVariableName(label, taken)).toBe(expected)
  })

  it('suffixes a number against names already taken', () => {
    expect(suggestVariableName('Model', ['model', 'model2'])).toBe('model3')
  })

  it('never exceeds the 40-character name limit, even after a suffix', () => {
    expect(suggestVariableName('a'.repeat(80), ['a'.repeat(36)]).length).toBeLessThanOrEqual(40)
  })
})

describe('parseOptionList', () => {
  it('reads numbers as numbers and the rest as text, trimming and dropping empties', () => {
    expect(parseOptionList(' 3, 4 ,,tap, 5.5 ')).toEqual([
      { value: 3, label: '3' },
      { value: 4, label: '4' },
      { value: 'tap', label: 'tap' },
      { value: 5.5, label: '5.5' },
    ])
  })

  it('an empty string is an empty list — core refuses it by name', () => {
    expect(parseOptionList('')).toEqual([])
  })
})

describe('seedDefinition', () => {
  const names = { name: 'piModel', unit: '' }

  it('a choice keeps its own value and options, so binding changes nothing on screen', () => {
    const slot = /** @type {any} */ ({ path: 'model', key: 'model', kind: 'enum', options: [{ value: 4, label: 'Pi 4' }, { value: 5, label: 'Pi 5' }] })
    expect(seedDefinition(slot, 4, names)).toEqual({
      name: 'piModel',
      kind: 'enum',
      value: 4,
      options: [{ value: 4, label: 'Pi 4' }, { value: 5, label: 'Pi 5' }],
    })
  })

  it('a number takes the field unit and the slot range', () => {
    const slot = /** @type {any} */ ({ path: 'length', key: 'length', kind: 'number', unit: 'mm', min: 1, max: 80 })
    expect(seedDefinition(slot, 10, { name: 'len', unit: 'mm' })).toEqual({
      name: 'len',
      kind: 'number',
      value: 10,
      unit: 'mm',
      min: 1,
      max: 80,
    })
  })

  it('a unitless number carries no unit, and a yes/no carries neither range nor options', () => {
    const number = /** @type {any} */ ({ path: 'n', key: 'n', kind: 'number' })
    expect('unit' in seedDefinition(number, 3, { name: 'n', unit: '' })).toBe(false)
    const flag = /** @type {any} */ ({ path: 'f', key: 'f', kind: 'boolean' })
    expect(seedDefinition(flag, true, { name: 'f', unit: '' })).toEqual({ name: 'f', kind: 'boolean', value: true })
  })
})
