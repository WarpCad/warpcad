// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import {
  formulaChangeSummaries,
  formulaPreviewLine,
  formulaValueText,
  insertAtCaret,
  shownFormulaText,
  parseOptionList,
  seedDefinition,
  seedFormulaText,
  suggestVariableName,
} from './variableEntry.js'

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

describe('formulaValueText (TODO/FIND-core-078)', () => {
  it.each([
    [40, 'mm', '40 mm'],
    [12.5, 'mm', '12.5 mm'],
    [100 / 3, 'mm', '33.33 mm'],
    [30, 'deg', '30 deg'],
    [7, '', '7'],
    [-0, 'mm', '0 mm'],
  ])('%j %j -> %j', (value, unit, expected) => {
    expect(formulaValueText(value, unit)).toBe(expected)
  })

  it('a formula with no value reads as a dash, never "undefined" or NaN', () => {
    expect(formulaValueText(undefined, 'mm')).toBe('—')
    expect(formulaValueText(Number.NaN, 'mm')).toBe('—')
  })
})

describe('formulaPreviewLine (TODO/FIND-core-078)', () => {
  it('a value reads "= 40 mm"', () => {
    expect(formulaPreviewLine({ value: 40 }, 'mm')).toEqual({ ok: true, text: '= 40 mm' })
  })

  it('an error is shown as core wrote it, position and all', () => {
    const error = 'expected “)” but found the end at character 28'
    expect(formulaPreviewLine({ error }, 'mm')).toEqual({ ok: false, text: error })
  })

  it('empty text is not an error to shout about, but is not creatable either', () => {
    expect(formulaPreviewLine(null, 'mm')).toEqual({ ok: false, text: '' })
  })
})

describe('insertAtCaret (TODO/FIND-core-078)', () => {
  it('inserts into an empty box', () => {
    expect(insertAtCaret('', 0, 0, 'Base.width')).toEqual({ text: 'Base.width', caret: 10 })
  })

  it('inserts after an operator and its space without adding another', () => {
    expect(insertAtCaret('Base.width - ', 13, 13, 'Lid.width')).toEqual({ text: 'Base.width - Lid.width', caret: 22 })
  })

  it('inserts straight after an opening bracket', () => {
    expect(insertAtCaret('(', 1, 1, 'Lid.width')).toEqual({ text: '(Lid.width', caret: 10 })
  })

  it('separates a reference from a value it would otherwise run into', () => {
    expect(insertAtCaret('2', 1, 1, 'Lid.width')).toEqual({ text: '2 Lid.width', caret: 11 })
  })

  it('replaces a selection', () => {
    expect(insertAtCaret('Base.width - 20', 13, 15, 'Lid.width')).toEqual({ text: 'Base.width - Lid.width', caret: 22 })
  })

  it('clamps a caret outside the text', () => {
    expect(insertAtCaret('1 + ', 99, 99, 'a.width')).toEqual({ text: '1 + a.width', caret: 11 })
  })
})

describe('seedFormulaText (TODO/FIND-core-078)', () => {
  it('a field value becomes the formula text, so creating it changes nothing on screen', () => {
    expect(seedFormulaText(40)).toBe('40')
    expect(seedFormulaText(12.5)).toBe('12.5')
  })

  it('a negative or non-number seed still parses', () => {
    expect(seedFormulaText(-3)).toBe('-3')
    expect(seedFormulaText(/** @type {any} */ ('x'))).toBe('0')
  })
})

describe('formulaChangeSummaries (TODO/FIND-core-078)', () => {
  /** @param {string} name @param {number | undefined} value @param {number} parameters @param {number} parts */
  const row = (name, value, parameters = 1, parts = 1, formula = 'a.width') =>
    /** @type {any} */ ({ variable: { id: `var-${name}`, name, kind: 'number', unit: 'mm', formula, value }, parameters, parts })

  it('reads "overhang 40 mm → 60 mm — 1 parameter on 1 part changed"', () => {
    const before = new Map([['var-overhang', 40]])
    expect(formulaChangeSummaries(before, [row('overhang', 60)])).toEqual(['overhang 40 mm → 60 mm — 1 parameter on 1 part changed'])
  })

  it('stays quiet for an unchanged value, a new formula, a value variable, and a formula with no value', () => {
    const before = new Map([['var-a', 10], ['var-c', 5], ['var-d', 3]])
    const rows = [row('a', 10), row('b', 7), { ...row('c', 9), variable: { id: 'var-c', name: 'c', kind: 'number', value: 9 } }, row('d', undefined)]
    expect(formulaChangeSummaries(before, rows)).toEqual([])
  })

  it('ignores a difference below floating-point noise', () => {
    expect(formulaChangeSummaries(new Map([['var-a', 0.1 + 0.2]]), [row('a', 0.3)])).toEqual([])
  })

  it('pluralises, and says when nothing reads it yet', () => {
    const before = new Map([['var-a', 1], ['var-b', 1]])
    expect(formulaChangeSummaries(before, [row('a', 2, 3, 2), row('b', 2, 0, 0)])).toEqual([
      'a 1 mm → 2 mm — 3 parameters on 2 parts changed',
      'b 1 mm → 2 mm — nothing reads it yet',
    ])
  })
})

describe('shownFormulaText (TODO/FIND-core-078)', () => {
  it('leaves a normal formula alone', () => {
    expect(shownFormulaText('Base.width - [Cube 1].height / 2')).toBe('Base.width - [Cube 1].height / 2')
  })

  it('shows a direction override or control character as a visible marker, so it cannot reorder the row', () => {
    expect(shownFormulaText('[\u202Eevil].width')).toBe('[\uFFFDevil].width')
    expect(shownFormulaText('a\u0000b\u2066c\u200Fd\u0085e')).toBe('a\uFFFDb\uFFFDc\uFFFDd\uFFFDe')
  })

  it('a line break in stored text becomes a space', () => {
    expect(shownFormulaText('1 +\n2')).toBe('1 + 2')
  })
})
