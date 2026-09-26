import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { combine, isGroup, volumeOf } from './group.js'
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
    // `tap` is hidden by default as of TODO/render-004 (2026-09-26).
    expect(asGroup(byId.get('bolt1')).names).toEqual(['head', 'thread'])
  })

  it('coerces a composite result to geometry when a boolean consumes it', () => {
    const { group } = evaluate([
      { id: 'plate', op: 'primitive.cuboid', params: { size: [40, 40, 4], center: [0, 0, 2] } },
      { id: 'bolt1', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 20, fit: 'loose' } },
      { id: 'cut', op: 'boolean.subtract', target: 'plate', operands: ['bolt1'], name: 'plate' },
    ])
    // Deliberately bounds and volume, not `toBeDefined()`: an *empty* geometry —
    // which is exactly what a bolt that had swallowed the plate would subtract the
    // plate down to (TODO/core-020) — has a defined bounding box too, so the
    // original spelling of this assertion could not tell the two apart.
    const [min, max] = boundsOf(group.parts.plate)
    expect(min).toEqual([-20, -20, 0])
    expect(max).toEqual([20, 20, 4])
    // the plate, minus one bolt-sized hole through it — not the whole plate gone
    const plateVolume = 40 * 40 * 4
    expect(measurements.measureVolume(group.parts.plate)).toBeGreaterThan(plateVolume * 0.8)
    expect(measurements.measureVolume(group.parts.plate)).toBeLessThan(plateVolume)
  })

  it('expands a composite into its own group, never into a scene handed in as `initial`', () => {
    // The incremental path (`src/core/replay.js`'s applyAction) evaluates one
    // record at a time against the scene so far, threaded in as `initial`. A
    // composite's recipe expansion must not be assembled into *that* group, or
    // every body already placed becomes one of the bolt's own parts and the bolt
    // spans the whole scene (TODO/core-020).
    const before = evaluate([
      { id: 'shell', op: 'primitive.cuboid', params: { size: [40, 40, 6], center: [0, 0, 3] }, name: 'Shell 1' },
    ])
    const { byId } = evaluate(
      [{ id: 'bolt1', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 20, fit: 'close' }, name: 'Bolt 1' }],
      { initial: { byId: before.byId, group: before.group } }
    )
    const bolt = asGroup(byId.get('bolt1'))
    // `tap` is hidden by default as of TODO/render-004 (2026-09-26).
    expect(bolt.names).toEqual(['head', 'thread'])
    // the recipe's own hidden `tap`/`tap-*` sub-parts belong here; the scene's body does not
    expect(Object.keys(bolt.parts)).not.toContain('Shell 1')
    // and it measures like a bolt, not like a 40 mm plate
    const [min, max] = boundsOf(combine(bolt))
    expect(min[0]).toBeGreaterThan(-15)
    expect(max[0]).toBeLessThan(15)
  })

  it('keeps a composite recipe from resolving ids that belong to the surrounding scene', () => {
    // The same leak seen from the other side: a recipe's records address their own
    // ids only. If the surrounding scene's `byId` is visible inside the expansion,
    // a document id colliding with a recipe id would silently change what a
    // composite is built from.
    const before = evaluate([
      { id: 'head', op: 'primitive.cuboid', params: { size: [40, 40, 6] }, name: 'Head Fake' },
    ])
    const { byId } = evaluate(
      [{ id: 'bolt1', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 20, fit: 'close' } }],
      { initial: { byId: before.byId, group: before.group } }
    )
    const bolt = asGroup(byId.get('bolt1'))
    // `tap` is hidden by default as of TODO/render-004 (2026-09-26).
    expect(bolt.names).toEqual(['head', 'thread'])
    expect(boundsOf(combine(bolt))[1][0]).toBeLessThan(15)
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
    // `rawOperands` and `subPartOperands` are two questions, not one
    // (TODO/core-024): this probe answers yes to both, the way `group.snap` does.
    'probe.raw': {
      kind: 'native',
      operandCount: '2+',
      rawOperands: true,
      subPartOperands: true,
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
    // `tap` is hidden by default as of TODO/render-004 (2026-09-26).
    expect(seen[0].value.names).toEqual(['head', 'thread'])
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
    // Silently dropping `pieces` would move the whole bolt while the record says
    // otherwise — wrong geometry, no error, exactly the class of bug this project
    // has already shipped twice. `transform.*` is the family this still applies to
    // (TODO/core-024): a transform edits one body in place, so honouring `pieces`
    // would have to discard the parts it did not name.
    expect(() =>
      evaluate([
        ...seed,
        {
          id: 'moved',
          op: 'transform.translate',
          params: { vector: [0, 0, 5] },
          target: { id: 'bolt1', pieces: 'tap' },
        },
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

/* ─────────────────────────────────────────────────────────────────────────────
 * Sub-part-addressed boolean operands, and parts surviving a transform
 * (TODO/core-024)
 *
 * Two halves of one decision, and neither is worth anything without the other:
 * a boolean may now name a composite's parts, *and* a composite that has been
 * moved still has parts to name. See the module doc in `index.js` and the
 * `subPartOperands` flag in `registry.js`.
 * ──────────────────────────────────────────────────────────────────────────── */
describe('sub-part-addressed boolean operands (TODO/core-024)', () => {
  const BOLT = { spec: 'm10 hex', length: 20, fit: 'loose' }

  /** A block big enough to swallow the whole bolt, so a hole's volume is the
   *  addressed parts' own volume exactly rather than some clipped fraction. */
  const BLOCK = { size: [40, 40, 30], center: [0, 0, 15] }
  const BLOCK_VOLUME_MM3 = 40 * 40 * 30

  const seed = [
    { id: 'bolt1', op: 'hardware.bolt', params: BOLT },
    { id: 'block', op: 'primitive.cuboid', params: BLOCK },
  ]

  /**
   * Volume of the block after subtracting `operand` from it.
   *
   * @param {any} operand
   * @param {any[]} [records] Extra records folded before the cut.
   * @returns {number}
   */
  function cutVolume(operand, records = []) {
    const { group } = evaluate([
      ...seed,
      ...records,
      { id: 'cut', op: 'boolean.subtract', target: 'block', operands: [operand], name: 'r' },
    ])
    return volumeOf(group.parts.r)
  }

  /** The bolt on its own, for comparing a hole against the parts that made it. */
  const bolt = () => asGroup(evaluate([seed[0]]).byId.get('bolt1'))

  it('cuts with the named part’s own geometry, not the whole composite', () => {
    // The decision this task exists to make, measured by volume per this project's
    // convention since `ui-014`. `head,thread` is the bolt's *metal*; the corpus
    // survey behind this task found `combine('head,thread')` its single most common
    // sub-part address (16 occurrences, and 82 `combine()` calls name a comma list
    // at all), which is why the comma list is the case pinned
    // here rather than a single name.
    const metalHole = BLOCK_VOLUME_MM3 - cutVolume({ id: 'bolt1', pieces: 'head,thread' })
    expect(metalHole).toBeCloseTo(volumeOf(combine(bolt(), 'head,thread')), 6)

    // Since TODO/render-004 (2026-09-26) hides `tap` by default, the bare-id
    // default combine() *is* head+thread — so the "does `pieces` get dropped"
    // contrast that used to compare against a bare `'bolt1'` now compares against
    // the explicit, still-addressable `tap` clearance envelope instead, which is
    // genuinely larger (grown by the fit clearance in both diameter and height).
    const tapHole = BLOCK_VOLUME_MM3 - cutVolume({ id: 'bolt1', pieces: 'tap' })
    expect(metalHole).toBeLessThan(tapHole)
    // And the bare-id default now agrees with the explicit metal address — proof
    // the default combine() genuinely excludes `tap` rather than silently keeping it.
    expect(cutVolume('bolt1')).toBeCloseTo(cutVolume({ id: 'bolt1', pieces: 'head,thread' }), 9)

    // One hard analytic number, so the two measurements above cannot agree by both
    // being wrong: the head is a hexagonal prism, 18 mm across corners, 6.5 mm tall.
    const headOnlyHole = BLOCK_VOLUME_MM3 - cutVolume({ id: 'bolt1', pieces: 'head' })
    expect(headOnlyHole).toBeCloseTo(((3 * Math.sqrt(3)) / 2) * 9 * 9 * 6.5, 6)
  })

  it('addresses a hidden part as readily as a visible one — both are named parts', () => {
    // The degenerate case TODO/core-024 asks to settle explicitly rather than leave
    // undefined. Answer: **any named part, hidden or visible**. A rule keyed on
    // `hidden` would not even reach this scenario's own target — `hardware.bolt`
    // now adds `tap` with `hidden: true` (TODO/render-004, user decision,
    // 2026-09-26; V1 itself left it `hidden: false`, and so did this recipe until
    // render-004), so `tap` itself, not just its `tap-*` children, exercises the
    // "hidden part" half of this test's own claim.
    const boltGroup = bolt()
    expect(boltGroup.names).toEqual(['head', 'thread'])
    expect(Object.keys(boltGroup.parts)).toContain('tap-thread')
    expect(boltGroup.names).not.toContain('tap-thread')
    expect(boltGroup.names).not.toContain('tap')

    const hiddenHole = BLOCK_VOLUME_MM3 - cutVolume({ id: 'bolt1', pieces: 'tap-thread' })
    expect(hiddenHole).toBeCloseTo(volumeOf(boltGroup.parts['tap-thread']), 6)

    const hiddenTapHole = BLOCK_VOLUME_MM3 - cutVolume({ id: 'bolt1', pieces: 'tap' })
    expect(hiddenTapHole).toBeCloseTo(volumeOf(boltGroup.parts.tap), 6)
  })

  it("measures the bolt's `tap` as its full clearance envelope, now genuinely bigger than the default combine() (TODO/render-004)", () => {
    // Before render-004, `tap` was V1-faithfully *visible*, so it sat in the
    // group's default `names` and `combine(bolt())` (no pieces) already *was* the
    // tap envelope — addressing `tap` explicitly changed nothing. render-004 hides
    // `tap` by default instead (user decision, 2026-09-26), so the two now
    // genuinely differ: `tap` is still every bit the same solid (head and thread
    // grown by the fit clearance, unioned) but the default combine() is the bare
    // metal, strictly smaller.
    expect(volumeOf(combine(bolt(), 'tap'))).toBeGreaterThan(volumeOf(combine(bolt())))
    // `cutVolume` is the *remaining* block volume after the cut, so the bigger
    // `tap` hole leaves *less* material behind than the metal-only default does.
    expect(cutVolume({ id: 'bolt1', pieces: 'tap' })).toBeLessThan(cutVolume('bolt1'))
  })

  it('accepts a sub-part address on all three booleans, and on either side', () => {
    // No reason to let `intersect` differ from `subtract`, and the corpus has real
    // `.union(pi.combine('ethernet,usb1,usb2'))` call sites as well as subtracts —
    // so this is one rule for the family, not a subtract-only special case.
    for (const op of ['boolean.union', 'boolean.subtract', 'boolean.intersect']) {
      expect(() =>
        evaluate([...seed, { id: 'r', op, target: 'block', operands: [{ id: 'bolt1', pieces: 'head' }] }])
      ).not.toThrow()
    }
    // …and with the sub-part as the *base*, which V1 also does
    // (`pimount.combine().subtract(pimount.combine('nuts,bolts'))`).
    expect(() =>
      evaluate([
        ...seed,
        { id: 'r', op: 'boolean.subtract', target: { id: 'bolt1', pieces: 'tap' }, operands: ['block'] },
      ])
    ).not.toThrow()
  })

  it('names the op, the operand and the part when a piece name does not exist', () => {
    expect(() =>
      evaluate([
        ...seed,
        { id: 'r', op: 'boolean.subtract', target: 'block', operands: [{ id: 'bolt1', pieces: 'tip' }] },
      ])
    ).toThrow(/boolean\.subtract.*bolt1.*no part named "tip"/s)
  })

  it('refuses a sub-part address on a bare solid, which has no parts to name', () => {
    expect(() =>
      evaluate([
        ...seed,
        { id: 'r', op: 'boolean.subtract', target: 'block', operands: [{ id: 'block', pieces: 'head' }] },
      ])
    ).toThrow(/single solid, not a group/)
  })
})

describe('a composite keeps its parts through a transform (TODO/core-024)', () => {
  const BOLT = { spec: 'm10 hex', length: 20, fit: 'loose' }
  const seed = [{ id: 'bolt1', op: 'hardware.bolt', params: BOLT }]

  it('translates a group part by part, so a moved bolt is still a bolt', () => {
    // The blocker `ui-030`'s drive measured: a placed composite commits a trailing
    // `transform.translate`, and before this task that translate flattened the
    // group — so the `tap` a boolean wants to address did not exist on the body the
    // user actually placed. V1's own `Group.translate` mapped over parts; this is
    // that behaviour, restored.
    const { byId } = evaluate([
      ...seed,
      { id: 'moved', op: 'transform.translate', params: { vector: [60, 0, 0] }, target: 'bolt1' },
    ])
    const moved = asGroup(byId.get('moved'))
    // `tap` is hidden by default as of TODO/render-004 (2026-09-26).
    expect(moved.names).toEqual(['head', 'thread'])
    expect(Object.keys(moved.parts)).toEqual(Object.keys(asGroup(byId.get('bolt1')).parts))

    const [before] = boundsOf(combine(asGroup(byId.get('bolt1')), 'head'))
    const [after] = boundsOf(combine(moved, 'head'))
    expect(after[0] - before[0]).toBeCloseTo(60, 9)
    expect(after[2]).toBeCloseTo(before[2], 9)
  })

  it('rotates a group part by part, about the record’s own centre', () => {
    const { byId } = evaluate([
      ...seed,
      {
        id: 'turned',
        op: 'transform.rotate',
        params: { angles: [90, 0, 0], center: [0, 0, 0] },
        target: 'bolt1',
      },
    ])
    const turned = asGroup(byId.get('turned'))
    // `tap` is hidden by default as of TODO/render-004 (2026-09-26).
    expect(turned.names).toEqual(['head', 'thread'])
    // A quarter turn about X takes the thread's +Z run onto −Y.
    const [min, max] = boundsOf(combine(turned, 'thread'))
    expect(min[1]).toBeCloseTo(-26.5, 6)
    expect(max[2] - min[2]).toBeCloseTo(10, 6)
  })

  it('leaves a bare solid a bare solid — a transform preserves what it is handed', () => {
    const { byId } = evaluate([
      { id: 'c', op: 'primitive.cuboid', params: { size: [10, 10, 10] } },
      { id: 'moved', op: 'transform.translate', params: { vector: [0, 0, 5] }, target: 'c' },
    ])
    expect(isGroup(byId.get('moved'))).toBe(false)
    expect(boundsOf(/** @type {any} */ (byId.get('moved')))).toEqual([
      [-5, -5, 0],
      [5, 5, 10],
    ])
  })

  it('lets a boolean address a sub-part of a composite that has already been moved', () => {
    // The end-to-end shape ACCEPTANCE.md scenario 5 needs, and the reason both
    // halves of this task had to land together: a bolt placed by drag-drop is a
    // recipe record *plus* a trailing translate, and the boolean addresses the
    // translate's result, not the recipe's.
    const records = [
      ...seed,
      { id: 'drop', op: 'transform.translate', params: { vector: [0, 0, 0] }, target: 'bolt1' },
      { id: 'block', op: 'primitive.cuboid', params: { size: [40, 40, 30], center: [0, 0, 15] } },
      {
        id: 'cut',
        op: 'boolean.subtract',
        target: 'block',
        operands: [{ id: 'drop', pieces: 'head,thread' }],
        name: 'r',
      },
    ]
    const { group, byId } = evaluate(records)
    const hole = 40 * 40 * 30 - volumeOf(group.parts.r)
    expect(hole).toBeCloseTo(volumeOf(combine(asGroup(byId.get('bolt1')), 'head,thread')), 6)
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
    // `tap` is hidden by default as of TODO/render-004 (2026-09-26), so the default
    // combine() is head+thread only: max z is headHeightMm 6.5 + length 20 = 26.5,
    // not the old tap-inclusive 27.5 (fit no longer affects this number).
    expect(bolt.names).toEqual(['head', 'thread'])
    expect(boundsOf(combine(bolt))[1][2]).toBeCloseTo(26.5, 6)
  })
})

describe('record colour threads through the fold alongside hidden (TODO/core-026)', () => {
  it("carries a named record's color/colorAlpha onto the group's part colours", () => {
    const { group } = evaluate([
      { id: 'a', op: 'primitive.cuboid', params: { size: [2, 2, 2] }, name: 'a', color: 0x808080 },
      {
        id: 'b',
        op: 'primitive.cuboid',
        params: { size: [1, 1, 1] },
        name: 'b',
        hidden: true,
        color: 0x008000,
        colorAlpha: 0.75,
      },
      { id: 'c', op: 'primitive.cuboid', params: { size: [1, 1, 1] }, name: 'c' },
    ])
    expect(group.colors).toEqual({
      a: { color: 0x808080, alpha: 1 },
      b: { color: 0x008000, alpha: 0.75 },
    })
  })

  it('carries it on the cached path too, not only on a fresh build (TODO/core-031)', () => {
    const records = [
      { id: 'a', op: 'primitive.cuboid', params: { size: [2, 2, 2] }, name: 'a', color: 0xff0000 },
    ]
    const cache = new WeakMap()
    evaluate(records, { cache })
    const { group } = evaluate(records, { cache })
    expect(group.colors).toEqual({ a: { color: 0xff0000, alpha: 1 } })
  })

  it('a composite keeps the colours its own recipe gave its parts', () => {
    const washer = evaluateOp('hardware.washer', { spec: '1/4', fit: 'loose' })
    expect(isGroup(washer) && washer.colors).toEqual({
      washer: { color: 0x808080, alpha: 1 },
      clearance: { color: 0xff0000, alpha: 1 },
    })
  })

  it('a composite moved by a transform is still coloured (TODO/core-024 shape)', () => {
    const { byId } = evaluate([
      { id: 'w', op: 'hardware.washer', params: { spec: '1/4' } },
      { id: 'm', op: 'transform.translate', params: { vector: [0, 0, 10] }, target: 'w' },
    ])
    const moved = byId.get('m')
    expect(isGroup(moved) && moved.colors).toEqual({ washer: { color: 0x808080, alpha: 1 } })
  })

  it('rejects a malformed colour loudly, naming the record', () => {
    expect(() =>
      evaluate([{ id: 'a', op: 'primitive.cuboid', params: { size: [2, 2, 2] }, name: 'a', color: -5 }])
    ).toThrow(/"a".*colour/)
  })
})
