import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { combine, isGroup } from './group.js'
import { evaluate, evaluateOp, expand, registry } from './index.js'

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

  it('honours options.registry end to end, including operand-count enforcement', () => {
    // Regression: assertOperandCount used to check the real hardcoded registry
    // regardless of options.registry, so a fully custom registry's own ops were
    // rejected as "unknown" the moment they had operands to count.
    // `build` returns plain marker values, not real Geom3 — hence `any`.
    /** @type {any} */
    const fakeRegistry = Object.freeze({
      'fake.create': { kind: 'native', operandCount: 0, build: () => 'FAKE_GEOM' },
      'fake.pair': {
        kind: 'native',
        operandCount: '2+',
        build: (/** @type {any} */ { inputs }) => ({ fake: 'combined', inputs }),
      },
    })
    const { group } = evaluate(
      [
        { id: 'a', op: 'fake.create', params: {} },
        { id: 'b', op: 'fake.create', params: {} },
        { id: 'c', op: 'fake.pair', operands: ['a', 'b'], name: 'c' },
      ],
      { registry: fakeRegistry }
    )
    expect(group.parts.c).toEqual({ fake: 'combined', inputs: ['FAKE_GEOM', 'FAKE_GEOM'] })

    expect(() =>
      evaluate([{ id: 'a', op: 'fake.pair', operands: [] }], { registry: fakeRegistry })
    ).toThrow(/fake\.pair/)
  })

  it('continues a prior fold via options.initial rather than starting over', () => {
    const first = evaluate([
      { id: 'a', op: 'primitive.cuboid', params: { size: [2, 2, 2] }, name: 'a' },
    ])
    const second = evaluate(
      [{ id: 'b', op: 'transform.translate', params: { vector: [0, 0, 5] }, target: 'a', name: 'b' }],
      { initial: { byId: first.byId, group: first.group } }
    )
    expect(second.group.names).toEqual(['a', 'b'])
    expect(boundsOf(second.group.parts.b)[0][2]).toBeCloseTo(4, 9)
    // the seed is copied, not mutated — the first fold's own result is untouched
    expect(first.group.names).toEqual(['a'])
    expect(first.byId.size).toBe(1)
  })
})

describe('operand resolution — bare ids, sub-part addresses, and who sees a raw Group (TODO/core-013)', () => {
  const BOLT = { spec: 'm10 hex', length: 20, fit: 'loose' }

  /** Records every fold below starts from: one composite, one bare solid. */
  const seed = [
    { id: 'bolt1', op: 'hardware.bolt', params: BOLT },
    { id: 'plate', op: 'primitive.cuboid', params: { size: [40, 40, 4] } },
  ]

  /**
   * The real catalogue plus two probes that report what the fold handed them —
   * one declaring `rawOperands`, one not. Spreading the real registry keeps the
   * seed records above buildable.
   *
   * @type {any}
   */
  const probes = Object.freeze({
    ...registry,
    'probe.raw': {
      kind: 'native',
      operandCount: '2+',
      rawOperands: true,
      build: (/** @type {any} */ { inputs }) => ({ seen: inputs }),
    },
    'probe.flat': {
      kind: 'native',
      operandCount: '2+',
      build: (/** @type {any} */ { inputs }) => ({ seen: inputs }),
    },
  })

  it('treats { id } with no pieces exactly like the bare id it wraps', () => {
    const bare = evaluate([
      { id: 'a', op: 'primitive.cuboid', params: { size: [10, 10, 10] } },
      { id: 'b', op: 'primitive.cuboid', params: { size: [10, 10, 6], center: [0, 0, 5] } },
      { id: 'c', op: 'boolean.subtract', target: 'a', operands: ['b'], name: 'r' },
    ])
    const wrapped = evaluate([
      { id: 'a', op: 'primitive.cuboid', params: { size: [10, 10, 10] } },
      { id: 'b', op: 'primitive.cuboid', params: { size: [10, 10, 6], center: [0, 0, 5] } },
      { id: 'c', op: 'boolean.subtract', target: { id: 'a' }, operands: [{ id: 'b' }], name: 'r' },
    ])
    expect(boundsOf(wrapped.group.parts.r)).toEqual(boundsOf(bare.group.parts.r))
  })

  it('hands a rawOperands op the un-combined value and the piece name beside it', () => {
    // This is the whole point of TODO/core-013: `byId` has always held the bolt's
    // head/thread/tap breakdown, it was just never routed anywhere an op could see it.
    const { byId } = evaluate(
      [
        ...seed,
        {
          id: 'probe',
          op: 'probe.raw',
          target: { id: 'bolt1', pieces: 'head' },
          operands: ['plate'],
        },
      ],
      { registry: probes }
    )
    const { seen } = /** @type {any} */ (byId.get('probe'))
    expect(isGroup(seen[0].value)).toBe(true)
    expect(seen[0].value.names).toEqual(['head', 'thread', 'tap'])
    expect(seen[0].pieces).toBe('head')
    // target first, then operands — the same ordering every other op relies on
    expect(isGroup(seen[1].value)).toBe(false)
    expect(seen[1].pieces).toBeUndefined()
  })

  it('still flattens every other op’s operands to bare geometry, unchanged', () => {
    // The regression this task most has to avoid: `evaluate` is shared by every op,
    // and only the two that opt in may see anything but a solid.
    const { byId } = evaluate(
      [...seed, { id: 'probe', op: 'probe.flat', target: 'bolt1', operands: ['plate'] }],
      { registry: probes }
    )
    const { seen } = /** @type {any} */ (byId.get('probe'))
    expect(isGroup(seen[0])).toBe(false)
    expect(seen[0].polygons.length).toBeGreaterThan(0)
    expect(seen).toHaveLength(2)
  })

  it('refuses a sub-part address on an op that cannot use one, rather than ignoring it', () => {
    // Silently dropping `pieces` would subtract the whole bolt while the record says
    // otherwise — wrong geometry, no error, exactly the class of bug this project
    // has already shipped twice.
    expect(() =>
      evaluate([
        ...seed,
        { id: 'cut', op: 'boolean.subtract', target: 'plate', operands: [{ id: 'bolt1', pieces: 'tap' }] },
      ])
    ).toThrow(/names pieces \("tap"\)/)
  })

  it('names the id in the not-yet-evaluated error whichever form the reference took', () => {
    expect(() =>
      evaluate([{ id: 'a', op: 'boolean.union', operands: [{ id: 'nope' }, 'alsoNope'] }])
    ).toThrow(/nope/)
  })

  it('rejects a malformed operand reference by shape, not as a missing id', () => {
    // `{ pieces: 'head' }` with no id used to stringify to "[object Object]" and be
    // reported as an unevaluated id, which sends a reader looking for the wrong bug.
    // Both references below are deliberately not `OperandRef`s — the cast is what
    // lets a type-checked spec assert on a document that got the shape wrong.
    expect(() =>
      evaluate(
        /** @type {any[]} */ ([
          ...seed,
          { id: 'x', op: 'boolean.union', operands: ['plate', { pieces: 'head' }] },
        ])
      )
    ).toThrow(/must be an id or \{ id, pieces \}/)
    expect(() =>
      evaluate(
        /** @type {any[]} */ ([...seed, { id: 'x', op: 'boolean.union', operands: ['plate', 42] }])
      )
    ).toThrow(/must be an id or \{ id, pieces \}/)
  })

  it('counts an object reference as one operand, like the bare id', () => {
    expect(() =>
      evaluate([...seed, { id: 'x', op: 'boolean.union', operands: [{ id: 'plate' }] }])
    ).toThrow(/expected 2 or more operand/)
    // and two of them satisfy it, so the count is really reading the array
    expect(() =>
      evaluate([
        ...seed,
        { id: 'x', op: 'boolean.union', operands: [{ id: 'plate' }, { id: 'bolt1' }] },
      ])
    ).not.toThrow()
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
