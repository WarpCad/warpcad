// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { effectiveDefaultsFor, rememberedFrom, summaryParamsFor } from './libraryDefaults.js'
import { libraryRow } from './library.js'

/**
 * `TODO/ui-068`: the pure half of the Library's "remember the last part params" memory.
 * Everything here runs against the real registry's schemas (the Bolt / screw row's dependent
 * Type / Size / Fit lists are the point), with a fake schema for the cases a real one cannot
 * produce.
 */

const bolt = libraryRow('hardware.bolt')

describe('effectiveDefaultsFor (TODO/ui-068)', () => {
  it('merges a remembered socket m2.5 / 8 mm over the Bolt / screw defaults', () => {
    expect(effectiveDefaultsFor(bolt, { type: 'socket', spec: 'm2.5', length: 8 })).toEqual({
      type: 'socket',
      spec: 'm2.5',
      length: 8,
      fit: 'loose',
    })
  })

  it('returns the registry defaults when nothing is remembered', () => {
    expect(effectiveDefaultsFor(bolt, undefined)).toEqual(bolt.defaults)
    expect(effectiveDefaultsFor(bolt, {})).toEqual(bolt.defaults)
  })

  it('falls back to the Type default size when the remembered size is not one of its sizes', () => {
    const merged = effectiveDefaultsFor(bolt, { type: 'pan', spec: 'm10', length: 8 })
    expect(merged.type).toBe('pan')
    expect(merged.spec).not.toBe('m10')
    expect(merged.length).toBe(8)
  })

  it('falls back when the remembered fit is not an option for that Type and size', () => {
    const merged = effectiveDefaultsFor(bolt, { type: 'socket', spec: 'm2.5', length: 8, fit: 'no-such-fit' })
    expect(merged.fit).toBe('loose')
    expect(merged.spec).toBe('m2.5')
  })

  it('drops an unknown key', () => {
    const merged = effectiveDefaultsFor(bolt, { type: 'socket', spec: 'm2.5', length: 8, clearLength: 5, bogus: 1 })
    expect(merged).not.toHaveProperty('clearLength')
    expect(merged).not.toHaveProperty('bogus')
  })

  it('discards the whole set when the result still does not validate', () => {
    // A fake schema where the default fit is invalid for the remembered spec.
    const row = { op: 'fake.part', defaults: { spec: 'a', fit: 'x' }, remembersParams: true }
    /** @type {(op: string, params: Record<string, any>) => Record<string, any>} */
    const schemaFn = (_op, params) => ({
      spec: { kind: 'enum', label: 'Spec', options: [{ value: 'a', label: 'a' }, { value: 'b', label: 'b' }] },
      fit: { kind: 'enum', label: 'Fit', options: params.spec === 'b' ? [{ value: 'y', label: 'y' }] : [{ value: 'x', label: 'x' }] },
    })
    expect(effectiveDefaultsFor(row, { spec: 'b', fit: 'z' }, { schemaFn: /** @type {any} */ (schemaFn), reconcileFn: (_o, p) => p })).toEqual(row.defaults)
  })

  it('never remembers a Primitives or Text row', () => {
    for (const op of ['primitive.cuboid', 'text.label']) {
      const row = libraryRow(op)
      expect(row.remembersParams).toBe(false)
      expect(effectiveDefaultsFor(row, { size: [99, 99, 99], text: 'zzz' })).toEqual(row.defaults)
    }
    expect(libraryRow('hardware.bolt').remembersParams).toBe(true)
    expect(libraryRow('raspberrypi.bplus').remembersParams).toBe(true)
  })

  it('treats a user part whose definition is gone as having no row', () => {
    expect(() => libraryRow('user.gone-part')).toThrow()
  })
})

describe('rememberedFrom (TODO/ui-068)', () => {
  it('keeps only the schema keys: a bolt clearLength is not stored', () => {
    const kept = rememberedFrom('hardware.bolt', { type: 'socket', spec: 'm3', length: 10, fit: 'loose', clearLength: 4, center: [0, 0, 0] })
    expect(kept).toEqual({ type: 'socket', spec: 'm3', length: 10, fit: 'loose' })
  })

  it('stores a { $var } binding as the value it resolved to', () => {
    const variables = new Map([['len', { name: 'len', kind: 'number', value: 12 }]])
    const kept = rememberedFrom('hardware.bolt', { type: 'socket', spec: 'm3', length: { $var: 'len' } }, { variables })
    expect(kept?.length).toBe(12)
  })

  it('drops a binding it cannot resolve rather than storing the object', () => {
    const kept = rememberedFrom('hardware.bolt', { type: 'socket', spec: 'm3', length: { $var: 'missing' } }, { variables: new Map() })
    expect(kept).not.toHaveProperty('length')
  })

  it('reads a legacy { spec: "m10 hex" } bolt in the current shape', () => {
    expect(rememberedFrom('hardware.bolt', { spec: 'm10 hex', length: 14, fit: 'loose' })).toMatchObject({ type: 'hex', spec: 'm10', length: 14 })
  })

  it('returns null for an op with no editable params', () => {
    expect(rememberedFrom('primitive.cuboid', { size: [1, 1, 1] }, { schemaFn: () => ({}) })).toBeNull()
  })
})

describe('summaryParamsFor (TODO/ui-068)', () => {
  it('leaves out the params the row\'s own dropdowns already show', () => {
    expect(summaryParamsFor(bolt, { type: 'socket', spec: 'm2.5', length: 8, fit: 'loose' })).toEqual({ length: 8, fit: 'loose' })
    expect(summaryParamsFor(libraryRow('raspberrypi.bplus'), { model: 5 })).toEqual({})
  })
})
