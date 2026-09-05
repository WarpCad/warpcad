import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { combine, isGroup } from './group.js'
import { evaluate, evaluateOp, expand } from './index.js'

const { measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./group.js').Group} Group */

/** @param {Geom3} geometry */
const boundsOf = (geometry) => measurements.measureBoundingBox(geometry)

/**
 * Narrow an evaluated value to a Group, failing the test if it is bare geometry.
 *
 * @param {Geom3 | Group | undefined} value
 * @returns {Group}
 */
function asGroup(value) {
  if (!isGroup(value)) throw new Error('expected a Group, got bare geometry')
  return value
}

describe('evaluate — the fold every op class replays through', () => {
  it('builds a native op and names it into the resulting group', () => {
    const { group, byId } = evaluate([
      { id: 'a', op: 'primitive.cuboid', params: { size: [10, 10, 10] }, name: 'body' },
    ])
    expect(group.names).toEqual(['body'])
    expect(byId.get('a')).toBe(group.parts.body)
  })

  it('resolves target and operands by id, in document order', () => {
    const { group } = evaluate([
      { id: 'a', op: 'primitive.cuboid', params: { size: [10, 10, 10] } },
      { id: 'b', op: 'primitive.cuboid', params: { size: [10, 10, 6], center: [0, 0, 5] } },
      { id: 'c', op: 'boolean.subtract', target: 'a', operands: ['b'], name: 'result' },
    ])
    expect(boundsOf(group.parts.result)[1][2]).toBeCloseTo(2, 6)
  })

  it('treats a record target as the first operand for counting purposes', () => {
    const { group } = evaluate([
      { id: 'a', op: 'primitive.cuboid', params: { size: [2, 2, 2] } },
      {
        id: 'b',
        op: 'transform.translate',
        params: { vector: [0, 0, 5] },
        target: 'a',
        name: 'moved',
      },
    ])
    expect(boundsOf(group.parts.moved)[0][2]).toBeCloseTo(4, 9)
  })

  it('keeps a hidden record out of the group name list but in its parts', () => {
    const { group } = evaluate([
      { id: 'a', op: 'primitive.cuboid', params: { size: [2, 2, 2] }, name: 'a' },
      { id: 'b', op: 'primitive.cuboid', params: { size: [2, 2, 2] }, name: 'b', hidden: true },
    ])
    expect(group.names).toEqual(['a'])
    expect(Object.keys(group.parts)).toEqual(['a', 'b'])
  })

  it('folds a composite op through the same path and yields its group', () => {
    const { group } = evaluate([
      { id: 'bolt1', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 20, fit: 'loose' } },
    ])
    expect(group.names).toEqual([])
    // the composite's own group is the value bound to its id
    const { byId } = evaluate([
      { id: 'bolt1', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 20, fit: 'loose' } },
    ])
    expect(asGroup(byId.get('bolt1')).names).toEqual(['head', 'thread', 'tap'])
  })

  it('coerces a composite result to geometry when a boolean consumes it', () => {
    const { group } = evaluate([
      { id: 'plate', op: 'primitive.cuboid', params: { size: [40, 40, 4], center: [0, 0, 2] } },
      { id: 'bolt1', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 20, fit: 'loose' } },
      { id: 'cut', op: 'boolean.subtract', target: 'plate', operands: ['bolt1'], name: 'plate' },
    ])
    expect(boundsOf(group.parts.plate)).toBeDefined()
  })

  it('rejects an unknown op by name rather than skipping it silently', () => {
    expect(() => evaluate([{ id: 'a', op: 'primitive.wormhole', params: {} }])).toThrow(
      /primitive\.wormhole/
    )
  })

  it('rejects a reference to an id that has not been evaluated yet', () => {
    expect(() =>
      evaluate([{ id: 'a', op: 'boolean.union', operands: ['nope', 'alsoNope'] }])
    ).toThrow(/nope/)
  })

  it('enforces the registry operandCount — this is the creation-vs-operation gate', () => {
    expect(() =>
      evaluate([
        { id: 'a', op: 'primitive.cuboid', params: { size: [2, 2, 2] } },
        { id: 'b', op: 'boolean.union', operands: ['a'] },
      ])
    ).toThrow(/boolean\.union/)

    expect(() =>
      evaluate([
        { id: 'a', op: 'primitive.cuboid', params: { size: [2, 2, 2] } },
        { id: 'b', op: 'primitive.cuboid', params: { size: [2, 2, 2] }, target: 'a' },
      ])
    ).toThrow(/primitive\.cuboid/)
  })

  it('rejects a duplicate record id rather than letting a later row shadow an earlier one', () => {
    expect(() =>
      evaluate([
        { id: 'a', op: 'primitive.cuboid', params: { size: [2, 2, 2] } },
        { id: 'a', op: 'primitive.cuboid', params: { size: [4, 4, 4] } },
      ])
    ).toThrow(/duplicate/i)
  })

  it('returns an empty group for an empty document', () => {
    const { group, byId } = evaluate([])
    expect(group.names).toEqual([])
    expect(byId.size).toBe(0)
  })
})

describe('expand — a composite op is inspectable as plain records', () => {
  it('returns the op records a composite expands into', () => {
    const records = expand('hardware.bolt', { spec: 'm10 hex', length: 20, fit: 'loose' })
    expect(Array.isArray(records)).toBe(true)
    for (const record of records) {
      expect(typeof record.op).toBe('string')
      expect(JSON.parse(JSON.stringify(record))).toEqual(record)
    }
  })

  it('refuses to expand a native op, which has no recipe to show', () => {
    expect(() => expand('primitive.cuboid', { size: [1, 1, 1] })).toThrow(/native/)
  })
})

describe('evaluateOp — single-op convenience used by the acceptance checks', () => {
  it('builds one native op straight to geometry', () => {
    const cube = evaluateOp('primitive.cuboid', { size: [2, 2, 2] })
    expect(isGroup(cube)).toBe(false)
    expect(boundsOf(/** @type {Geom3} */ (cube))).toEqual([
      [-1, -1, -1],
      [1, 1, 1],
    ])
  })

  it('builds one composite op straight to a group', () => {
    const bolt = asGroup(evaluateOp('hardware.bolt', { spec: 'm10 hex', length: 20, fit: 'loose' }))
    expect(bolt.names).toEqual(['head', 'thread', 'tap'])
    expect(boundsOf(combine(bolt))[1][2]).toBeCloseTo(27.5, 6)
  })
})
