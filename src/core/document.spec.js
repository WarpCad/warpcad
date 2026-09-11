import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { createDocument } from './document.js'
import { boundsOf, isGroup } from './kernel/group.js'

const { measurements } = modeling

/**
 * A fake registry, per CLAUDE.md's "always mock at the boundary" — the command
 * layer's job is the append/fold/origin bookkeeping, not geometry, so most of
 * these run against two trivial ops rather than the real kernel. The couple of
 * tests that need real geometry say so and use the real registry.
 */
/** @type {any} */
const fakeRegistry = Object.freeze({
  'fake.box': Object.freeze({
    kind: 'native',
    operandCount: 0,
    build: (/** @type {any} */ { params }) => ({ tag: 'box', size: params.size ?? 1 }),
  }),
  'fake.move': Object.freeze({
    kind: 'native',
    operandCount: 1,
    build: (/** @type {any} */ { params }) => ({ tag: 'moved', by: params.by ?? 0 }),
  }),
  'fake.explode': Object.freeze({
    kind: 'native',
    operandCount: 0,
    build: () => {
      throw new Error('fake.explode always fails')
    },
  }),
  // A 2-or-more-in, one-out op — the shape a boolean has (TODO/ui-014) and the
  // one `consumes` exists for. Deliberately not called `fake.boolean`: the
  // mechanism is not boolean-specific, and `ui-015`'s "combine into group" is
  // the same shape.
  'fake.merge': Object.freeze({
    kind: 'native',
    operandCount: '2+',
    build: (/** @type {any} */ { inputs }) => ({ tag: 'merged', of: inputs.length }),
  }),
})

/** @param {object} [options] */
function doc(options = {}) {
  return createDocument({ registry: fakeRegistry, ...options })
}

describe('createDocument — the command layer', () => {
  it('starts empty, with an empty derived scene', () => {
    const document = doc()
    expect(document.records).toEqual([])
    expect(document.bodies()).toEqual([])
    expect(document.scene.errors).toEqual([])
    expect(document.version).toBe(0)
  })

  it('appends a record and returns the newly derived scene', () => {
    const document = doc()
    const { record, scene } = document.append(
      { id: 'a', op: 'fake.box', name: 'Box 1', params: { size: 3 } },
      { origin: 'local' }
    )
    expect(record.id).toBe('a')
    expect(scene.byId.get('a')).toEqual({ tag: 'box', size: 3 })
    expect(document.scene).toBe(scene)
    expect(document.records).toHaveLength(1)
    expect(document.version).toBe(1)
  })

  it('refuses a mutation with no origin — undo/redo scoping cannot be retrofitted', () => {
    // CLAUDE.md's Architecture rule: every document mutation goes through the
    // command layer "inside a transaction with an origin". This task does not build
    // undo/redo, but a record appended without an origin is one a later undo stack
    // could never classify, so it is rejected at the door rather than defaulted.
    const document = doc()
    expect(() => document.append({ id: 'a', op: 'fake.box' }, /** @type {any} */ (undefined))).toThrow(
      /origin/
    )
    expect(() => document.append({ id: 'a', op: 'fake.box' }, { origin: '' })).toThrow(/origin/)
    expect(document.records).toEqual([])
  })

  it('records each entry with its origin, so remote edits stay distinguishable', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
    document.append({ id: 'b', op: 'fake.box' }, { origin: 'remote' })
    expect(document.originOf('a')).toBe('local')
    expect(document.originOf('b')).toBe('remote')
    expect(document.originOf('nope')).toBeUndefined()
    expect(document.entries.map((entry) => entry.origin)).toEqual(['local', 'remote'])
  })

  it('folds incrementally: a second append does not re-evaluate the first record', () => {
    let builds = 0
    /** @type {any} */
    const counting = Object.freeze({
      'fake.count': Object.freeze({
        kind: 'native',
        operandCount: 0,
        build: () => {
          builds += 1
          return { tag: 'counted' }
        },
      }),
    })
    const document = createDocument({ registry: counting })
    document.append({ id: 'a', op: 'fake.count' }, { origin: 'local' })
    document.append({ id: 'b', op: 'fake.count' }, { origin: 'local' })
    document.append({ id: 'c', op: 'fake.count' }, { origin: 'local' })
    // Three appends, three builds. Replaying from scratch each time would be six.
    expect(builds).toBe(3)
  })

  it('rejects a record that fails to evaluate, and leaves the log untouched', () => {
    // A local UI mutation is code this project controls, so a failure is loud —
    // unlike `replay`'s deliberately lenient handling of an untrusted remote
    // document, where one bad line is skipped and reported.
    const document = doc()
    document.append({ id: 'good', op: 'fake.box' }, { origin: 'local' })
    expect(() => document.append({ id: 'bad', op: 'fake.explode' }, { origin: 'local' })).toThrow(
      /fake\.explode/
    )
    expect(document.records.map((record) => record.id)).toEqual(['good'])
    expect(document.scene.errors).toEqual([])
    expect(document.scene.byId.has('bad')).toBe(false)
    expect(document.version).toBe(1)
    // The scene the failed append tried to build is not the live one.
    expect(document.scene.byId.has('good')).toBe(true)
  })

  it('rejects a duplicate id rather than silently replacing a body', () => {
    // This is scenario 1's failure mode in miniature: the second attempt shipped a
    // build where placing a second body replaced the first.
    const document = doc()
    document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
    expect(() => document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })).toThrow(
      /duplicate/i
    )
    expect(document.records).toHaveLength(1)
  })

  it('rejects a record with no op', () => {
    const document = doc()
    expect(() => document.append(/** @type {any} */ ({ id: 'a' }), { origin: 'local' })).toThrow(/op/)
  })

  it('hands out unique ids and per-label names', () => {
    const document = doc()
    const first = document.nextId('primitive')
    const second = document.nextId('primitive')
    expect(first).not.toBe(second)
    expect(document.nextName('Cube')).toBe('Cube 1')
    document.append({ id: first, op: 'fake.box', name: 'Cube 1' }, { origin: 'local' })
    expect(document.nextName('Cube')).toBe('Cube 2')
    expect(document.nextName('Sphere')).toBe('Sphere 1')
  })

  it('lists placed bodies in document order, each with its id, name and op', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Cube 1' }, { origin: 'local' })
    document.append({ id: 'b', op: 'fake.box', name: 'Sphere 1' }, { origin: 'local' })
    expect(document.bodies().map((body) => [body.id, body.name, body.op])).toEqual([
      ['a', 'Cube 1', 'fake.box'],
      ['b', 'Sphere 1', 'fake.box'],
    ])
    expect(document.bodies()[0].geometry).toEqual({ tag: 'box', size: 1 })
  })

  it('every earlier body survives a later append — ACCEPTANCE.md scenario 1, at the model level', () => {
    const document = doc()
    for (let index = 0; index < 5; index += 1) {
      document.append(
        { id: `body-${index}`, op: 'fake.box', name: `Box ${index}`, params: { size: index + 1 } },
        { origin: 'local' }
      )
    }
    const bodies = document.bodies()
    expect(bodies).toHaveLength(5)
    expect(bodies.map((body) => /** @type {any} */ (body.geometry).size)).toEqual([1, 2, 3, 4, 5])
  })

  it('replays an existing action array on construction', () => {
    const document = createDocument({
      registry: fakeRegistry,
      actions: [{ id: 'a', op: 'fake.box', name: 'Box 1' }],
      origin: 'remote',
    })
    expect(document.bodies()).toHaveLength(1)
    expect(document.originOf('a')).toBe('remote')
    // A pre-existing id is still taken: a fresh append must not collide with it.
    expect(document.nextName('Box')).toBe('Box 2')
  })

  it('drives the real kernel registry end to end', () => {
    const document = createDocument()
    const { scene } = document.append(
      {
        id: 'cube-1',
        op: 'primitive.cuboid',
        name: 'Cube 1',
        params: { size: [10, 10, 10], center: [0, 0, 5] },
      },
      { origin: 'local' }
    )
    const geometry = /** @type {any} */ (scene.byId.get('cube-1'))
    expect(geometry.polygons.length).toBeGreaterThan(0)
    expect(document.bodies()).toHaveLength(1)
  })
})

describe('supersession — one logical body per lineage (TODO/ui-012)', () => {
  /**
   * The regression this whole mechanism exists to prevent, stated as directly as
   * it can be: a transform record has its own id and its own entry in
   * `scene.byId`, so a `bodies()` that reported "one Body per record with an id"
   * would render the moved body *and* the body it moved from — the exact inverse
   * of ACCEPTANCE.md scenario 1's "placing a second body silently hid the first".
   */
  it('a transform does not add a second body', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1', params: { size: 3 } }, { origin: 'local' })
    expect(document.bodies()).toHaveLength(1)

    document.append(
      { id: 'a-move-1', op: 'fake.move', target: 'a', supersedes: 'a', params: { by: 5 } },
      { origin: 'local' }
    )

    expect(document.bodies()).toHaveLength(1)
    // Nothing is deleted: a future undo/redo needs the whole chain.
    expect(document.records).toHaveLength(2)
    expect(document.scene.byId.has('a')).toBe(true)
    expect(document.scene.byId.has('a-move-1')).toBe(true)
  })

  it('the surviving body keeps its logical identity but reports the newest geometry', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1', params: { size: 3 } }, { origin: 'local' })
    document.append(
      { id: 'a-move-1', op: 'fake.move', target: 'a', supersedes: 'a', params: { by: 5 } },
      { origin: 'local' }
    )
    const [body] = document.bodies()

    // Identity is the *lineage root*, so a selection, a mesh and a data-testid
    // all survive a move rather than being torn down and rebuilt under a new id.
    expect(body.id).toBe('a')
    expect(body.name).toBe('Box 1')
    expect(body.op).toBe('fake.box')
    expect(body.params).toEqual({ size: 3 })
    // Geometry is the terminal record's.
    expect(body.recordId).toBe('a-move-1')
    expect(body.geometry).toEqual({ tag: 'moved', by: 5 })
  })

  it('chains: a second transform supersedes the first, still one body', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1' }, { origin: 'local' })
    document.append(
      { id: 'm1', op: 'fake.move', target: 'a', supersedes: 'a', params: { by: 5 } },
      { origin: 'local' }
    )
    document.append(
      { id: 'm2', op: 'fake.move', target: 'm1', supersedes: 'm1', params: { by: 9 } },
      { origin: 'local' }
    )
    const bodies = document.bodies()
    expect(bodies).toHaveLength(1)
    expect(bodies[0].id).toBe('a')
    expect(bodies[0].recordId).toBe('m2')
    expect(bodies[0].geometry).toEqual({ tag: 'moved', by: 9 })
    expect(document.currentIdOf('a')).toBe('m2')
    // Asking from anywhere in the lineage gives the same answer.
    expect(document.currentIdOf('m1')).toBe('m2')
  })

  it('leaves other bodies alone, and keeps creation order', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1' }, { origin: 'local' })
    document.append({ id: 'b', op: 'fake.box', name: 'Box 2' }, { origin: 'local' })
    document.append(
      { id: 'm1', op: 'fake.move', target: 'a', supersedes: 'a', params: { by: 5 } },
      { origin: 'local' }
    )
    const bodies = document.bodies()
    expect(bodies).toHaveLength(2)
    // A moved body keeps its place in the list rather than jumping to the end.
    expect(bodies.map((body) => body.id)).toEqual(['a', 'b'])
    expect(bodies[1].recordId).toBe('b')
    expect(bodies[1].geometry).toEqual({ tag: 'box', size: 1 })
  })

  it('refuses to supersede an unknown id, or one already superseded', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1' }, { origin: 'local' })
    expect(() =>
      document.append(
        { id: 'x', op: 'fake.move', target: 'a', supersedes: 'nope', params: { by: 1 } },
        { origin: 'local' }
      )
    ).toThrow(/supersedes/)

    document.append(
      { id: 'm1', op: 'fake.move', target: 'a', supersedes: 'a', params: { by: 5 } },
      { origin: 'local' }
    )
    // `a` is no longer the lineage's terminal record — superseding it again would
    // fork the lineage and put two live representations of one body on screen.
    expect(() =>
      document.append(
        { id: 'm2', op: 'fake.move', target: 'a', supersedes: 'a', params: { by: 7 } },
        { origin: 'local' }
      )
    ).toThrow(/supersedes/)
    expect(document.bodies()).toHaveLength(1)
  })

  it('carries a rotation state param forward off the terminal record', () => {
    // `transform.*` records carry the body's *absolute* rotation so the Inspector
    // can read it without the document layer knowing what a rotation means.
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1' }, { origin: 'local' })
    expect(document.bodies()[0].rotationDeg).toEqual([0, 0, 0])

    document.append(
      {
        id: 'r1',
        op: 'fake.move',
        target: 'a',
        supersedes: 'a',
        params: { by: 0, rotation: [0, 0, 45] },
      },
      { origin: 'local' }
    )
    expect(document.bodies()[0].rotationDeg).toEqual([0, 0, 45])
  })

  it('a real move through the real kernel leaves exactly one body, at the new place', () => {
    const document = createDocument()
    document.append(
      {
        id: 'cube-1',
        op: 'primitive.cuboid',
        name: 'Cube 1',
        params: { size: [10, 10, 10], center: [0, 0, 5] },
      },
      { origin: 'local' }
    )
    document.append(
      {
        id: 'cube-1-move-1',
        op: 'transform.translate',
        target: 'cube-1',
        supersedes: 'cube-1',
        params: { vector: [25, 0, 0] },
      },
      { origin: 'local' }
    )

    const bodies = document.bodies()
    expect(bodies).toHaveLength(1)
    const [min, max] = boundsOf(bodies[0].geometry)
    expect((min[0] + max[0]) / 2).toBeCloseTo(25, 6)
    expect((min[2] + max[2]) / 2).toBeCloseTo(5, 6)
  })
})

describe('consumption — several bodies retired into one (TODO/ui-014)', () => {
  /**
   * `supersedes` answers "this record *continues* that body's identity" — a moved
   * Cube is still a Cube, so `Body.op`/`params`/`name` keep coming from the root.
   * A boolean result is not a continuation of either operand: there is no honest
   * answer to *whose* op and params it inherits. So it gets its own field and its
   * own lineage, and the operands stop being independently selectable.
   */
  /**
   * @param {ReturnType<typeof doc>} document
   * @returns {ReturnType<typeof doc>}
   */
  function twoBoxes(document) {
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1' }, { origin: 'local' })
    document.append({ id: 'b', op: 'fake.box', name: 'Box 2' }, { origin: 'local' })
    return document
  }

  it('merges two roots into one body — not three, and not zero', () => {
    const document = twoBoxes(doc())
    expect(document.bodies()).toHaveLength(2)

    document.append(
      { id: 'm', op: 'fake.merge', name: 'Union 1', target: 'a', operands: ['b'], consumes: ['a', 'b'] },
      { origin: 'local' }
    )

    const bodies = document.bodies()
    expect(bodies).toHaveLength(1)
    // The result is its own new lineage root, so its identity, name and op are
    // its own rather than borrowed from whichever operand happened to be first.
    expect(bodies[0].id).toBe('m')
    expect(bodies[0].recordId).toBe('m')
    expect(bodies[0].name).toBe('Union 1')
    expect(bodies[0].op).toBe('fake.merge')
    expect(bodies[0].geometry).toEqual({ tag: 'merged', of: 2 })
    // Nothing is deleted — a future undo/redo needs the whole chain, exactly as
    // supersession keeps every intermediate record.
    expect(document.records).toHaveLength(3)
    expect(document.scene.byId.has('a')).toBe(true)
    expect(document.scene.byId.has('b')).toBe(true)
  })

  it('resolves a consumed id forward to whatever now represents it', () => {
    const document = twoBoxes(doc())
    document.append(
      { id: 'm', op: 'fake.merge', target: 'a', operands: ['b'], consumes: ['a', 'b'] },
      { origin: 'local' }
    )
    expect(document.currentIdOf('a')).toBe('m')
    expect(document.currentIdOf('b')).toBe('m')
    expect(document.currentIdOf('m')).toBe('m')
  })

  it('chains a merge through a later merge, and through a transform', () => {
    // A + B -> C, then C + D -> E. A reference to `a` two operations later still
    // resolves all the way forward, the same guarantee supersession gives.
    const document = twoBoxes(doc())
    document.append({ id: 'd', op: 'fake.box', name: 'Box 3' }, { origin: 'local' })
    document.append(
      { id: 'c', op: 'fake.merge', target: 'a', operands: ['b'], consumes: ['a', 'b'] },
      { origin: 'local' }
    )
    document.append(
      { id: 'e', op: 'fake.merge', target: 'c', operands: ['d'], consumes: ['c', 'd'] },
      { origin: 'local' }
    )
    expect(document.bodies()).toHaveLength(1)
    expect(document.bodies()[0].id).toBe('e')
    expect(document.currentIdOf('a')).toBe('e')
    expect(document.currentIdOf('b')).toBe('e')
    expect(document.currentIdOf('d')).toBe('e')

    // A merged result is an ordinary body: it can then be moved like any other.
    document.append(
      { id: 'e-move-1', op: 'fake.move', target: 'e', supersedes: 'e', params: { by: 4 } },
      { origin: 'local' }
    )
    expect(document.bodies()).toHaveLength(1)
    expect(document.currentIdOf('a')).toBe('e-move-1')
  })

  it('consumes a moved body by its current record, and retires the whole lineage', () => {
    // What the toolbar actually passes: `document.currentIdOf(bodyId)`, never the
    // lineage root, because the root's entry in `scene.byId` still holds the
    // *pre-move* geometry — subtracting that would cut a hole where the body used
    // to be.
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1' }, { origin: 'local' })
    document.append({ id: 'b', op: 'fake.box', name: 'Box 2' }, { origin: 'local' })
    document.append(
      { id: 'a-move-1', op: 'fake.move', target: 'a', supersedes: 'a', params: { by: 5 } },
      { origin: 'local' }
    )
    expect(document.currentIdOf('a')).toBe('a-move-1')

    document.append(
      {
        id: 'm',
        op: 'fake.merge',
        target: 'a-move-1',
        operands: ['b'],
        consumes: ['a-move-1', 'b'],
      },
      { origin: 'local' }
    )
    expect(document.bodies()).toHaveLength(1)
    expect(document.bodies()[0].id).toBe('m')
    // Retiring the terminal retires the lineage it belongs to, so the root id the
    // selection was holding resolves forward rather than dangling.
    expect(document.currentIdOf('a')).toBe('m')
  })

  it('leaves untouched bodies alone and keeps creation order', () => {
    const document = twoBoxes(doc())
    document.append({ id: 'c', op: 'fake.box', name: 'Box 3' }, { origin: 'local' })
    document.append(
      { id: 'm', op: 'fake.merge', target: 'b', operands: ['c'], consumes: ['b', 'c'] },
      { origin: 'local' }
    )
    const bodies = document.bodies()
    expect(bodies).toHaveLength(2)
    // `a` keeps its place at the head of the list; the result joins at the end
    // because it is genuinely a new body, not a continuation of `b`.
    expect(bodies.map((body) => body.id)).toEqual(['a', 'm'])
    expect(bodies[0].geometry).toEqual({ tag: 'box', size: 1 })
  })

  it('refuses to consume an unknown id, an already-consumed one, or a superseded one', () => {
    const document = twoBoxes(doc())
    expect(() =>
      document.append(
        { id: 'x', op: 'fake.merge', target: 'a', operands: ['b'], consumes: ['a', 'nope'] },
        { origin: 'local' }
      )
    ).toThrow(/consumes/)
    // Rejected *before* anything is committed: no half-applied merge.
    expect(document.bodies()).toHaveLength(2)

    document.append(
      { id: 'm', op: 'fake.merge', target: 'a', operands: ['b'], consumes: ['a', 'b'] },
      { origin: 'local' }
    )
    document.append({ id: 'c', op: 'fake.box', name: 'Box 3' }, { origin: 'local' })
    // `a` has been absorbed into `m`; consuming it again would resurrect a body
    // the user can no longer see or select.
    expect(() =>
      document.append(
        { id: 'x2', op: 'fake.merge', target: 'a', operands: ['c'], consumes: ['a', 'c'] },
        { origin: 'local' }
      )
    ).toThrow(/consumes/)

    // And a record that is not its lineage's terminal — the same fork this
    // module rejects for `supersedes`.
    document.append(
      { id: 'c-move-1', op: 'fake.move', target: 'c', supersedes: 'c', params: { by: 2 } },
      { origin: 'local' }
    )
    expect(() =>
      document.append(
        { id: 'x3', op: 'fake.merge', target: 'm', operands: ['c'], consumes: ['m', 'c'] },
        { origin: 'local' }
      )
    ).toThrow(/consumes/)
  })

  it('refuses to supersede a body that has been consumed', () => {
    // The mirror of the case above: a moved body cannot be moved again once a
    // boolean has absorbed it, because there is nothing on screen to move.
    const document = twoBoxes(doc())
    document.append(
      { id: 'm', op: 'fake.merge', target: 'a', operands: ['b'], consumes: ['a', 'b'] },
      { origin: 'local' }
    )
    expect(() =>
      document.append(
        { id: 'mv', op: 'fake.move', target: 'a', supersedes: 'a', params: { by: 1 } },
        { origin: 'local' }
      )
    ).toThrow(/supersedes/)
    expect(document.bodies()).toHaveLength(1)
  })

  it('refuses a record that both supersedes and consumes', () => {
    // Two different meanings — continue one identity, or retire several into a
    // new one — and no coherent answer for what a record doing both would mean.
    const document = twoBoxes(doc())
    expect(() =>
      document.append(
        {
          id: 'm',
          op: 'fake.merge',
          target: 'a',
          operands: ['b'],
          supersedes: 'a',
          consumes: ['a', 'b'],
        },
        { origin: 'local' }
      )
    ).toThrow(/supersedes.*consumes|consumes.*supersedes/)
    expect(document.bodies()).toHaveLength(2)
  })

  it('refuses a consuming record with no id of its own, or a malformed consumes list', () => {
    const document = twoBoxes(doc())
    expect(() =>
      document.append(
        { op: 'fake.merge', target: 'a', operands: ['b'], consumes: ['a', 'b'] },
        { origin: 'local' }
      )
    ).toThrow(/id/)
    expect(() =>
      document.append(
        { id: 'm', op: 'fake.merge', target: 'a', operands: ['b'], consumes: /** @type {any} */ ('a') },
        { origin: 'local' }
      )
    ).toThrow(/consumes/)
    expect(() =>
      document.append(
        { id: 'm', op: 'fake.merge', target: 'a', operands: ['b'], consumes: [] },
        { origin: 'local' }
      )
    ).toThrow(/consumes/)
    // The same body named twice would retire one lineage and silently count it
    // as two operands.
    expect(() =>
      document.append(
        { id: 'm', op: 'fake.merge', target: 'a', operands: ['a'], consumes: ['a', 'a'] },
        { origin: 'local' }
      )
    ).toThrow(/consumes/)
    expect(document.bodies()).toHaveLength(2)
  })

  it('a composite appended after other bodies keeps only its own parts (TODO/core-020)', () => {
    const document = createDocument()
    document.append(
      {
        id: 'shell',
        op: 'primitive.cuboid',
        name: 'Shell 1',
        params: { size: [40, 40, 6], center: [0, 0, 3] },
      },
      { origin: 'local' }
    )
    document.append(
      {
        id: 'lug',
        op: 'primitive.cuboid',
        name: 'Lug 1',
        params: { size: [8, 8, 8], center: [30, 0, 4] },
      },
      { origin: 'local' }
    )
    document.append(
      {
        id: 'bolt1',
        op: 'hardware.bolt',
        name: 'Bolt 1',
        params: { spec: 'm10 hex', length: 20, fit: 'close' },
      },
      { origin: 'local' }
    )

    // The direct assertion: the stored bolt is a bolt, not a bolt that has
    // absorbed the two bodies placed before it. Appending incrementally used to
    // produce names ['Shell 1', 'Lug 1', 'head', 'thread', 'tap'] here, with
    // bounds spanning the whole plate.
    const bolt = /** @type {import('./kernel/group.js').Group} */ (document.scene.byId.get('bolt1'))
    expect(bolt.names).toEqual(['head', 'thread', 'tap'])
    // `parts` also holds the recipe's own hidden `tap-*` sub-parts (V1 parity),
    // so the claim here is not a fixed key list — it is that nothing belonging to
    // the surrounding document is in there at all.
    expect(Object.keys(bolt.parts)).not.toContain('Shell 1')
    expect(Object.keys(bolt.parts)).not.toContain('Lug 1')

    expect(document.bodies().map((body) => body.name)).toEqual(['Shell 1', 'Lug 1', 'Bolt 1'])
    const [min, max] = boundsOf(document.bodies()[2].geometry)
    expect(min[0]).toBeGreaterThan(-15)
    expect(max[0]).toBeLessThan(15)
    expect(max[2]).toBeCloseTo(27, 6)
  })

  it('subtracting a composite from a plate cuts a hole, it does not erase the plate (TODO/core-020)', () => {
    // ACCEPTANCE.md scenario 5 in miniature, through the incremental command
    // layer rather than a batch evaluate: the tap-clearance body of a bolt is
    // what gets subtracted, so the plate must survive with a hole in it. This
    // asserts volume as well as bounds on purpose — the batch-path test this
    // mirrors originally asserted only that the bounds were *defined*, which an
    // empty geometry satisfies, and that is precisely what let core-020 through.
    const document = createDocument()
    document.append(
      {
        id: 'plate',
        op: 'primitive.cuboid',
        name: 'Plate 1',
        params: { size: [40, 40, 6], center: [0, 0, 3] },
      },
      { origin: 'local' }
    )
    document.append(
      {
        id: 'bolt1',
        op: 'hardware.bolt',
        name: 'Bolt 1',
        params: { spec: 'm10 hex', length: 20, fit: 'close' },
      },
      { origin: 'local' }
    )
    document.append(
      {
        id: 'cut',
        op: 'boolean.subtract',
        name: 'Subtract 1',
        target: 'plate',
        operands: ['bolt1'],
        consumes: ['plate', 'bolt1'],
      },
      { origin: 'local' }
    )

    const bodies = document.bodies()
    expect(bodies).toHaveLength(1)
    const [min, max] = boundsOf(bodies[0].geometry)
    expect(min).toEqual([-20, -20, 0])
    expect(max).toEqual([20, 20, 6])
    const plateVolume = 40 * 40 * 6
    const cutVolume = measurements.measureVolume(
      /** @type {any} */ (bodies[0].geometry)
    )
    expect(cutVolume).toBeGreaterThan(plateVolume * 0.8)
    expect(cutVolume).toBeLessThan(plateVolume)
  })

  it('a real subtract through the real kernel leaves exactly one body, cut to size', () => {
    const document = createDocument()
    document.append(
      {
        id: 'cube-1',
        op: 'primitive.cuboid',
        name: 'Cube 1',
        params: { size: [10, 10, 10], center: [0, 0, 5] },
      },
      { origin: 'local' }
    )
    document.append(
      {
        id: 'cube-2',
        op: 'primitive.cuboid',
        name: 'Cube 2',
        params: { size: [10, 10, 6], center: [0, 0, 12] },
      },
      { origin: 'local' }
    )
    expect(document.bodies()).toHaveLength(2)

    document.append(
      {
        id: 'bool-1',
        op: 'boolean.subtract',
        name: 'Subtract 1',
        target: 'cube-1',
        operands: ['cube-2'],
        consumes: ['cube-1', 'cube-2'],
      },
      { origin: 'local' }
    )

    const bodies = document.bodies()
    expect(bodies).toHaveLength(1)
    expect(bodies[0].id).toBe('bool-1')
    // The second cube's lower half overlapped the first from z = 9 upward, so
    // the result is the first cube with its top 1 mm removed.
    const [min, max] = boundsOf(bodies[0].geometry)
    expect(max[2]).toBeCloseTo(9, 6)
    expect(min[2]).toBeCloseTo(0, 6)
  })

  // TODO/ui-015: `group.assemble` is `consumes`-shaped exactly like a boolean — 2+
  // ids in, 1 new lineage root out — which is precisely the module comment above
  // (`document.js:78`) claims needs no change here. This pins that claim with a
  // real assertion rather than leaving it to be trusted by inspection.
  it('a group.assemble through the real kernel leaves exactly one body whose geometry is a Group, and resolves consumed ids forward', () => {
    const document = createDocument()
    document.append(
      {
        id: 'cube-1',
        op: 'primitive.cuboid',
        name: 'Cube 1',
        params: { size: [10, 10, 10], center: [-10, 0, 0] },
      },
      { origin: 'local' }
    )
    document.append(
      {
        id: 'cube-2',
        op: 'primitive.cuboid',
        name: 'Cube 2',
        params: { size: [10, 10, 10], center: [10, 0, 0] },
      },
      { origin: 'local' }
    )
    expect(document.bodies()).toHaveLength(2)

    document.append(
      {
        id: 'group-1',
        op: 'group.assemble',
        name: 'Group 1',
        target: 'cube-1',
        operands: ['cube-2'],
        consumes: ['cube-1', 'cube-2'],
        params: { names: ['Cube 1', 'Cube 2'] },
      },
      { origin: 'local' }
    )

    const bodies = document.bodies()
    expect(bodies).toHaveLength(1)
    expect(bodies[0].id).toBe('group-1')
    expect(isGroup(bodies[0].geometry)).toBe(true)
    // Both consumed ids resolve forward through the new lineage root, same as a
    // boolean's operands do — a stale reference to either original cube still
    // finds the group rather than dangling.
    expect(document.currentIdOf('cube-1')).toBe('group-1')
    expect(document.currentIdOf('cube-2')).toBe('group-1')
  })
})
