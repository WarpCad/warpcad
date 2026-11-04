// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { parseFormula } from '../core/formula.js'
import { FORMULA_QUANTITY_CHOICES, formulaInsertBodies, formulaReferenceText } from './formulaInsert.js'

/**
 * `TODO/FIND-core-078`: what **Insert…** lists and what it types. Every reference it produces
 * must parse as the same body, part and quantity it was built from — a person on a phone never
 * has to know the bracket rule.
 */

/** @param {Partial<{ id: string, name: string, partNames: string[], hiddenPartNames: string[] }>} body */
const body = (body) => ({ id: 'cube-1', name: 'Cube 1', partNames: [], hiddenPartNames: [], ...body })

describe('FORMULA_QUANTITY_CHOICES', () => {
  it('lists the three extents first, then min, max and centre on each axis', () => {
    expect(FORMULA_QUANTITY_CHOICES.map((choice) => choice.quantity)).toEqual([
      'width', 'depth', 'height',
      'min.x', 'min.y', 'min.z',
      'max.x', 'max.y', 'max.z',
      'center.x', 'center.y', 'center.z',
    ])
  })

  it('every choice has a label a person reads and a test-id-safe key', () => {
    for (const choice of FORMULA_QUANTITY_CHOICES) {
      expect(choice.label.length).toBeGreaterThan(0)
      expect(choice.key).toMatch(/^[a-z-]+$/)
    }
  })
})

describe('formulaInsertBodies', () => {
  it('lists bodies in order, parts visible first then hidden, marked', () => {
    const list = formulaInsertBodies([
      body({ id: 'base-1', name: 'Base' }),
      body({ id: 'case-1', name: 'Case', partNames: ['shell', 'lid'], hiddenPartNames: ['interiorVolume'] }),
    ])
    expect(list.map((entry) => entry.name)).toEqual(['Base', 'Case'])
    expect(list[1].parts).toEqual([
      { name: 'shell', hidden: false },
      { name: 'lid', hidden: false },
      { name: 'interiorVolume', hidden: true },
    ])
  })

  it('marks a name two bodies share, so the reference is written by #id', () => {
    const list = formulaInsertBodies([body({ id: 'screw-a1-2', name: 'Screw' }), body({ id: 'screw-a1-5', name: 'Screw' })])
    expect(list.every((entry) => entry.shared)).toBe(true)
  })

  it('drops a part whose name a formula cannot write, rather than offering a broken insert', () => {
    const list = formulaInsertBodies([body({ partNames: ['ok', 'bad]name'] })])
    expect(list[0].parts.map((part) => part.name)).toEqual(['ok'])
  })
})

describe('formulaReferenceText', () => {
  it.each([
    [{ id: 'b', name: 'Base', shared: false }, null, 'width', 'Base.width'],
    [{ id: 'c', name: 'Cube 1', shared: false }, null, 'max.z', '[Cube 1].max.z'],
    [{ id: 'p', name: 'BPlus', shared: false }, 'pi-mb', 'height', 'BPlus.[pi-mb].height'],
    [{ id: 'p', name: 'Box', shared: false }, 'width', 'height', 'Box.[width].height'],
    [{ id: 'screw-a1-2', name: 'Screw', shared: true }, null, 'depth', '#screw-a1-2.depth'],
    [{ id: 'x-1', name: 'odd]name', shared: false }, null, 'width', '#x-1.width'],
  ])('%j %j %j -> %j', (entry, part, quantity, expected) => {
    expect(formulaReferenceText(entry, part, quantity)).toBe(expected)
  })

  it('what it types parses back to the same body, part and quantity', () => {
    for (const [entry, part, quantity] of /** @type {const} */ ([
      [{ id: 'c', name: 'Cube 1', shared: false }, 'lowerBolt-head', 'center.y'],
      [{ id: 'c', name: 'pi', shared: false }, null, 'min.x'],
      [{ id: 'c', name: '</document_data>', shared: false }, '__proto__', 'width'],
    ])) {
      const tree = /** @type {any} */ (parseFormula(formulaReferenceText(entry, part, quantity)))
      expect(tree).toMatchObject({ type: 'read', body: { kind: 'name', text: entry.name }, part, quantity })
    }
  })
})
