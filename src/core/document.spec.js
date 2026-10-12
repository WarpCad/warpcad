// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { createDocument, ReplayRejection } from './document.js'
import { boundsOf, isGroup } from './kernel/group.js'
import { registry as realRegistry } from './kernel/registry.js'

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
  // The real op name (`TODO/data-005`), not a `fake.*` alias: `document.js`'s
  // `setColorOverride` hardcodes `style.recolor`, so exercising it against this
  // fake registry needs an entry under that exact key. Identity, like the real
  // `wholeGroupNative` build in `kernel/registry.js` — a colour override changes
  // nothing about the geometry, only the record's own `colorOverride` field, which
  // `document.js` reads back independently of this build function.
  'style.recolor': Object.freeze({
    kind: 'native',
    operandCount: 1,
    build: (/** @type {any} */ { inputs }) => inputs[0],
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
    // `tap` is hidden by default as of TODO/render-004 (user decision, 2026-09-26),
    // so it no longer appears in `names` — it is still in `parts` (checked below).
    expect(bolt.names).toEqual(['head', 'thread'])
    // `parts` also holds the recipe's own hidden `tap`/`tap-*` sub-parts (V1 parity
    // for `tap-*`; render-004's own deliberate divergence for `tap` itself), so the
    // claim here is not a fixed key list — it is that nothing belonging to the
    // surrounding document is in there at all.
    expect(Object.keys(bolt.parts)).not.toContain('Shell 1')
    expect(Object.keys(bolt.parts)).not.toContain('Lug 1')

    expect(document.bodies().map((body) => body.name)).toEqual(['Shell 1', 'Lug 1', 'Bolt 1'])
    const [min, max] = boundsOf(document.bodies()[2].geometry)
    expect(min[0]).toBeGreaterThan(-15)
    expect(max[0]).toBeLessThan(15)
    // Default combine() is now head+thread only (TODO/render-004): max z is the
    // thread's own top (headHeightMm 6.5 + length 20 = 26.5), not the old
    // tap-inclusive 27 — `fit` no longer affects this number, since head+thread
    // never depended on it.
    expect(max[2]).toBeCloseTo(26.5, 6)
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

describe('no sketch.* fold branch remains (TODO/sketch-001)', () => {
  // ui-020 routed `sketch.line` records *around* the kernel into a parallel
  // `sketchEntities` map. sketch-001 replaced that with `primitive.sketch`, an ordinary
  // primitive, so the parallel path is gone and nothing in the fold treats a `sketch.`
  // prefix specially any more. An old file's lines are dropped at parse time with a
  // warning (`project.js`); a *new* append of one is simply an op nobody knows.
  it('rejects a sketch.line append as an unknown op, like any other', () => {
    const document = createDocument({ registry: realRegistry })
    expect(() =>
      document.append(
        { id: 'sketch-1', op: 'sketch.line', name: 'Line 1', params: { start: [0, 0], end: [1, 1] } },
        { origin: 'local' }
      )
    ).toThrow(/unknown op "sketch\.line"/)
    expect(document.records).toEqual([])
  })

  it('has no sketchEntities accessor', () => {
    expect(/** @type {any} */ (doc()).sketchEntities).toBeUndefined()
  })

  it('folds a primitive.sketch through the kernel like any primitive: a body, labelled Place', () => {
    const document = createDocument({ registry: realRegistry })
    document.append(
      {
        id: 'sketch-1',
        op: 'primitive.sketch',
        name: 'Sketch 1',
        params: {
          center: [0, 0, 0],
          slices: [{ id: 's1', zMm: 0, profiles: [{ id: 'p1', kind: 'rect', role: 'solid', centerMm: [0, 0], widthMm: 10, heightMm: 10 }] }],
          extrusion: { method: 'linear', heightMm: 5, twistDeg: 0, twistSteps: 1 },
        },
      },
      { origin: 'local' }
    )
    expect(document.bodies().map((body) => body.id)).toEqual(['sketch-1'])
    expect(document.pendingUndo()).toMatchObject({ label: 'Place Sketch 1' })
  })

  it('refuses a primitive.sketch the kernel cannot build — the document never holds one', () => {
    const document = createDocument({ registry: realRegistry })
    expect(() =>
      document.append(
        {
          id: 'sketch-1',
          op: 'primitive.sketch',
          name: 'Sketch 1',
          params: { center: [0, 0, 0], slices: [{ id: 's1', zMm: 0, profiles: [] }], extrusion: { method: 'linear', heightMm: 5 } },
        },
        { origin: 'local' }
      )
    ).toThrow(/closed solid outline/)
    expect(document.bodies()).toEqual([])
  })
})

describe('lineageOf and a creation record superseding a creation record (TODO/ui-029)', () => {
  it('walks a lineage root-first, from the creation record to the current terminal', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1' }, { origin: 'local' })
    document.append(
      { id: 'a-move-1', op: 'fake.move', target: 'a', supersedes: 'a' },
      { origin: 'local' }
    )
    document.append(
      { id: 'a-move-2', op: 'fake.move', target: 'a-move-1', supersedes: 'a-move-1' },
      { origin: 'local' }
    )
    // An untouched body's lineage is just itself.
    document.append({ id: 'b', op: 'fake.box', name: 'Box 2' }, { origin: 'local' })

    expect(document.lineageOf('a').map((record) => record.id)).toEqual(['a', 'a-move-1', 'a-move-2'])
    // Answered the same from anywhere in the lineage, not only from its root —
    // a caller holding a terminal id must not get a truncated answer.
    expect(document.lineageOf('a-move-2').map((record) => record.id)).toEqual([
      'a',
      'a-move-1',
      'a-move-2',
    ])
    expect(document.lineageOf('b').map((record) => record.id)).toEqual(['b'])
    expect(document.lineageOf('nope')).toEqual([])
  })

  it('folds a creation record that supersedes another creation record, still one body', () => {
    // The direction every other supersession test covers is a `transform.*` over a
    // creation record. `TODO/ui-029` edits a primitive's own params by appending a
    // *fresh creation record* over the lineage's terminal instead — legal under
    // this module's own rule (supersession only cares which record is terminal,
    // never which op built either one), and this is what pins that.
    const document = doc()
    document.append(
      { id: 'a', op: 'fake.box', name: 'Box 1', params: { size: 3 } },
      { origin: 'local' }
    )
    document.append(
      { id: 'a-param-1', op: 'fake.box', supersedes: 'a', params: { size: 9 } },
      { origin: 'local' }
    )

    const bodies = document.bodies()
    expect(bodies).toHaveLength(1)
    const [body] = bodies
    // Identity and name still come from the root — a resized Box is still Box 1.
    expect(body.id).toBe('a')
    expect(body.name).toBe('Box 1')
    expect(body.recordId).toBe('a-param-1')
    expect(body.op).toBe('fake.box')
    // ...but the geometry is the newest record's, which is the whole point.
    expect(body.geometry).toEqual({ tag: 'box', size: 9 })
    // ...and so are `Body.params`, which is what makes the Inspector show the
    // value that was just typed rather than the one the body was created with.
    // A `transform.*` in between is still skipped — see the next case.
    expect(body.params).toEqual({ size: 9 })
    expect(document.currentIdOf('a')).toBe('a-param-1')
    expect(document.lineageOf('a').map((record) => record.op)).toEqual(['fake.box', 'fake.box'])
  })

  it('never reads a transform record\'s params as the body\'s own dimensions', () => {
    // The reason `Body.params` was pinned to the root before `ui-029`: a
    // translate's `vector` is not a size. A rebuild changes which *creation*
    // record is read, and must not weaken this.
    const document = doc()
    document.append(
      { id: 'a', op: 'fake.box', name: 'Box 1', params: { size: 3 } },
      { origin: 'local' }
    )
    document.append(
      { id: 'a-move-1', op: 'fake.move', target: 'a', supersedes: 'a', params: { by: 7 } },
      { origin: 'local' }
    )
    expect(document.bodies()[0].params).toEqual({ size: 3 })

    document.append(
      { id: 'a-param-1', op: 'fake.box', supersedes: 'a-move-1', params: { size: 9 } },
      { origin: 'local' }
    )
    expect(document.bodies()[0].params).toEqual({ size: 9 })

    // And a transform appended *after* the rebuild still does not displace it.
    document.append(
      {
        id: 'a-move-2',
        op: 'fake.move',
        target: 'a-param-1',
        supersedes: 'a-param-1',
        params: { by: 2 },
      },
      { origin: 'local' }
    )
    expect(document.bodies()[0].params).toEqual({ size: 9 })
    expect(document.bodies()[0].id).toBe('a')
  })

  it('keeps a param rebuild from forking a lineage or disturbing its neighbours', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', params: { size: 3 } }, { origin: 'local' })
    document.append({ id: 'b', op: 'fake.box', params: { size: 4 } }, { origin: 'local' })
    document.append(
      { id: 'a-param-1', op: 'fake.box', supersedes: 'a', params: { size: 9 } },
      { origin: 'local' }
    )

    expect(document.bodies().map((body) => body.id)).toEqual(['a', 'b'])
    expect(document.scene.byId.get('b')).toEqual({ tag: 'box', size: 4 })
    // Superseding the now-stale terminal a second time is refused, exactly as it
    // is for a transform — one live representation per body, always.
    expect(() =>
      document.append(
        { id: 'a-param-2', op: 'fake.box', supersedes: 'a', params: { size: 11 } },
        { origin: 'local' }
      )
    ).toThrow(/already been superseded/)
  })
})

describe('setColorOverride — user colour overrides (TODO/data-005)', () => {
  it('a body with no override reports exactly as before — the regression guard', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1', params: { size: 3 } }, { origin: 'local' })
    const [body] = document.bodies()
    expect(body.colorOverrides).toBeUndefined()
    expect(body.params).toEqual({ size: 3 })
  })

  it('reports the new colour while every other field stays unchanged', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1', params: { size: 3 } }, { origin: 'local' })
    const before = document.bodies()[0]

    const { record } = document.setColorOverride('a', { color: 0xff0000 }, { origin: 'local' })

    expect(record.op).toBe('style.recolor')
    expect(record.supersedes).toBe('a')
    expect(record.target).toBe('a')
    expect(record.name).toBeUndefined() // unnamed, per `ui-029`'s established precedent

    const [body] = document.bodies()
    expect(body.id).toBe('a') // same lineage, same logical body
    expect(body.recordId).toBe(record.id) // the override is now the terminal
    expect(body.colorOverrides).toEqual([{ color: 0xff0000 }])
    // Nothing else moved: params and the rest of the body are untouched.
    expect(body.params).toEqual(before.params)
    expect(body.op).toBe(before.op)
    expect(body.name).toBe(before.name)
    expect(body.rotationDeg).toEqual(before.rotationDeg)
  })

  it('omits colorAlpha when 1, carries it through otherwise', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })

    document.setColorOverride('a', { color: 0x00ff00, colorAlpha: 1 }, { origin: 'local' })
    expect(document.bodies()[0].colorOverrides).toEqual([{ color: 0x00ff00 }])

    const document2 = doc()
    document2.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
    document2.setColorOverride('a', { color: 0x00ff00, colorAlpha: 0.5 }, { origin: 'local' })
    expect(document2.bodies()[0].colorOverrides).toEqual([{ color: 0x00ff00, colorAlpha: 0.5 }])
  })

  it('a second whole-body override replaces the first, not appends a second entry', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
    document.setColorOverride('a', { color: 0xff0000 }, { origin: 'local' })
    document.setColorOverride('a', { color: 0x0000ff }, { origin: 'local' })
    expect(document.bodies()[0].colorOverrides).toEqual([{ color: 0x0000ff }])
  })

  it('an override survives a later transform, still readable off the lineage', () => {
    const document = doc({ replica: 'abcdef' })
    document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
    document.setColorOverride('a', { color: 0xff0000 }, { origin: 'local' })
    document.append(
      { id: 'a-move-1', op: 'fake.move', target: 'a-color-abcdef-1', supersedes: 'a-color-abcdef-1', params: { by: 5 } },
      { origin: 'local' }
    )
    const [body] = document.bodies()
    expect(body.colorOverrides).toEqual([{ color: 0xff0000 }])
    expect(document.scene.byId.get('a-move-1')).toEqual({ tag: 'moved', by: 5 })
  })

  describe('per-part addressing (subPart)', () => {
    it('an override on one sub-part carries its name and does not affect its siblings', () => {
      const document = doc()
      document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
      document.setColorOverride('a', { color: 0xff0000, subPart: 'usbc' }, { origin: 'local' })
      const [body] = document.bodies()
      expect(body.colorOverrides).toEqual([{ color: 0xff0000, subPart: 'usbc' }])
      // Only `usbc` is named — nothing claims `ethernet` or any other sibling part
      // is affected, since each entry is scoped to its own `subPart` key.
    })

    it('overriding two different sub-parts tracks both independently', () => {
      const document = doc()
      document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
      document.setColorOverride('a', { color: 0xff0000, subPart: 'usbc' }, { origin: 'local' })
      document.setColorOverride('a', { color: 0x00ff00, subPart: 'ethernet' }, { origin: 'local' })
      const [body] = document.bodies()
      expect(body.colorOverrides).toHaveLength(2)
      expect(body.colorOverrides).toEqual(
        expect.arrayContaining([
          { color: 0xff0000, subPart: 'usbc' },
          { color: 0x00ff00, subPart: 'ethernet' },
        ])
      )
    })

    it('re-overriding the same sub-part replaces only that entry', () => {
      const document = doc()
      document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
      document.setColorOverride('a', { color: 0xff0000, subPart: 'usbc' }, { origin: 'local' })
      document.setColorOverride('a', { color: 0x00ff00, subPart: 'ethernet' }, { origin: 'local' })
      document.setColorOverride('a', { color: 0x0000ff, subPart: 'usbc' }, { origin: 'local' })
      const [body] = document.bodies()
      expect(body.colorOverrides).toEqual(
        expect.arrayContaining([
          { color: 0x0000ff, subPart: 'usbc' },
          { color: 0x00ff00, subPart: 'ethernet' },
        ])
      )
      expect(body.colorOverrides).toHaveLength(2)
    })

    it('a whole-body override and a per-part override on the same body coexist as separate entries', () => {
      const document = doc()
      document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
      document.setColorOverride('a', { color: 0xff0000 }, { origin: 'local' })
      document.setColorOverride('a', { color: 0x00ff00, subPart: 'usbc' }, { origin: 'local' })
      const [body] = document.bodies()
      expect(body.colorOverrides).toEqual(
        expect.arrayContaining([{ color: 0xff0000 }, { color: 0x00ff00, subPart: 'usbc' }])
      )
      expect(body.colorOverrides).toHaveLength(2)
    })
  })

  describe('degenerate cases', () => {
    it('refuses a non-numeric or out-of-range color', () => {
      const document = doc()
      document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
      expect(() =>
        document.setColorOverride('a', /** @type {any} */ ({ color: 'red' }), { origin: 'local' })
      ).toThrow(/color/)
      expect(() =>
        document.setColorOverride('a', { color: -1 }, { origin: 'local' })
      ).toThrow(/color/)
      expect(() =>
        document.setColorOverride('a', { color: 0x1000000 }, { origin: 'local' })
      ).toThrow(/color/)
      expect(document.bodies()[0].colorOverrides).toBeUndefined()
    })

    it('refuses a colorAlpha outside (0, 1]', () => {
      const document = doc()
      document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
      expect(() =>
        document.setColorOverride('a', { color: 0xff0000, colorAlpha: 0 }, { origin: 'local' })
      ).toThrow(/colorAlpha/)
      expect(() =>
        document.setColorOverride('a', { color: 0xff0000, colorAlpha: 1.5 }, { origin: 'local' })
      ).toThrow(/colorAlpha/)
    })

    it('refuses an empty subPart', () => {
      const document = doc()
      document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
      expect(() =>
        document.setColorOverride('a', { color: 0xff0000, subPart: '' }, { origin: 'local' })
      ).toThrow(/subPart/)
    })

    it('refuses overriding a body that does not exist', () => {
      const document = doc()
      expect(() =>
        document.setColorOverride('nope', { color: 0xff0000 }, { origin: 'local' })
      ).toThrow(/no such body/)
    })
  })

  describe('closed-finding regression surface (TODO/core-020)', () => {
    it('overriding a sub-part of a composite disturbs neither its own part list nor an earlier body', () => {
      // Against the real kernel, mirroring the describe block above's own
      // core-020 reproduction: a shell, a lug, then a bolt — and now a colour
      // override on the bolt's `tap` sub-part on top. `core-020`'s regression
      // was a composite absorbing every previously-placed body into its own
      // group; `style.recolor`'s identity-passthrough build is new code in
      // that exact fold, so it gets the same check.
      const document = createDocument()
      document.append(
        { id: 'shell', op: 'primitive.cuboid', name: 'Shell 1', params: { size: [40, 40, 6], center: [0, 0, 3] } },
        { origin: 'local' }
      )
      document.append(
        { id: 'lug', op: 'primitive.cuboid', name: 'Lug 1', params: { size: [8, 8, 8], center: [30, 0, 4] } },
        { origin: 'local' }
      )
      document.append(
        { id: 'bolt1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 20, fit: 'close' } },
        { origin: 'local' }
      )

      document.setColorOverride('bolt1', { color: 0xff0000, subPart: 'tap' }, { origin: 'local' })

      const boltTerminalId = document.currentIdOf('bolt1')
      if (boltTerminalId === undefined) throw new Error('expected a live "bolt1" lineage')
      const bolt = /** @type {import('./kernel/group.js').Group} */ (document.scene.byId.get(boltTerminalId))
      // `tap` is hidden by default as of TODO/render-004 — still addressable
      // (the colour override above targets it directly), just not visible.
      expect(bolt.names).toEqual(['head', 'thread'])
      expect(Object.keys(bolt.parts)).not.toContain('Shell 1')
      expect(Object.keys(bolt.parts)).not.toContain('Lug 1')

      // Body count, order and names: unchanged. The override is a fourth
      // record in the log, not a fourth body.
      expect(document.bodies().map((body) => body.name)).toEqual(['Shell 1', 'Lug 1', 'Bolt 1'])
      const boltBody = document.bodies()[2]
      expect(boltBody.colorOverrides).toEqual([{ color: 0xff0000, subPart: 'tap' }])
      const [min, max] = boundsOf(boltBody.geometry)
      expect(min[0]).toBeGreaterThan(-15)
      expect(max[0]).toBeLessThan(15)
      // Default combine() is head+thread only now (TODO/render-004): max z 26.5,
      // not the old tap-inclusive 27 — see the sibling test above for the maths.
      expect(max[2]).toBeCloseTo(26.5, 6)

      // The earlier bodies are untouched — still their own bounds, no override.
      expect(document.bodies()[0].colorOverrides).toBeUndefined()
      expect(document.bodies()[1].colorOverrides).toBeUndefined()
    })

    it('undo removes a colour override, redo restores it (TODO/data-003/core-030)', () => {
      const document = doc()
      document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
      document.setColorOverride('a', { color: 0xff0000 }, { origin: 'local' })
      expect(document.bodies()[0].colorOverrides).toEqual([{ color: 0xff0000 }])

      document.undo()
      expect(document.bodies()[0].colorOverrides).toBeUndefined()

      document.redo()
      expect(document.bodies()[0].colorOverrides).toEqual([{ color: 0xff0000 }])
    })

    it('a re-fold with the fold cache reports the same override as an uncached one (TODO/core-031)', () => {
      // The cached and fresh-build paths sharing one behaviour is exactly the
      // property `core-026`'s own `partOptions` helper exists to guarantee for
      // `hidden`/`color` — a colour override is new code in the same fold, so
      // it gets the same equivalence check, against the real kernel.
      const cached = createDocument({ restorableSteps: 0 })
      const uncached = createDocument({ restorableSteps: 0, foldCache: null })
      for (const document of [cached, uncached]) {
        document.append({ id: 'a', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10] } }, { origin: 'local' })
        document.setColorOverride('a', { color: 0x00ff00, subPart: 'foo' }, { origin: 'local' })
        // A second, unrelated append forces a re-fold to walk past the override
        // record again, exercising the cache hit/miss path on both sides.
        document.append({ id: 'b', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [5, 5, 5] } }, { origin: 'local' })
      }
      expect(cached.bodies()[0].colorOverrides).toEqual(uncached.bodies()[0].colorOverrides)
      expect(cached.bodies()[0].colorOverrides).toEqual([{ color: 0x00ff00, subPart: 'foo' }])
    })
  })
})

describe('clearColorOverride — resetting a colour back to the default (TODO/ui-037)', () => {
  it('clears a whole-body override: the body reports no override at all, as if never set', () => {
    const document = doc({ replica: 'abcdef' })
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1' }, { origin: 'local' })
    document.setColorOverride('a', { color: 0xff0000 }, { origin: 'local' })

    const { record } = document.clearColorOverride('a', {}, { origin: 'local' })

    expect(record.op).toBe('style.recolor')
    expect(record.colorOverride).toBeNull()
    expect(record.supersedes).toBe('a-color-abcdef-1')
    expect(record.name).toBeUndefined()
    expect(document.bodies()[0].colorOverrides).toBeUndefined()
  })

  it('clears only the addressed key: a sub-part reset keeps the whole-body colour, and vice versa', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Board' }, { origin: 'local' })
    document.setColorOverride('a', { color: 0xff0000 }, { origin: 'local' })
    document.setColorOverride('a', { color: 0x0000ff, subPart: 'usbc' }, { origin: 'local' })

    document.clearColorOverride('a', { subPart: 'usbc' }, { origin: 'local' })
    expect(document.bodies()[0].colorOverrides).toEqual([{ color: 0xff0000 }])

    document.setColorOverride('a', { color: 0x0000ff, subPart: 'usbc' }, { origin: 'local' })
    document.clearColorOverride('a', {}, { origin: 'local' })
    expect(document.bodies()[0].colorOverrides).toEqual([{ color: 0x0000ff, subPart: 'usbc' }])
  })

  it('a colour set after a reset is in force again', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
    document.setColorOverride('a', { color: 0xff0000 }, { origin: 'local' })
    document.clearColorOverride('a', {}, { origin: 'local' })
    document.setColorOverride('a', { color: 0x00ff00 }, { origin: 'local' })
    expect(document.bodies()[0].colorOverrides).toEqual([{ color: 0x00ff00 }])
  })

  it('is one undo step, and Undo brings the cleared colour back', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1' }, { origin: 'local' })
    document.setColorOverride('a', { color: 0xff0000 }, { origin: 'local' })
    document.clearColorOverride('a', {}, { origin: 'local' })
    expect(document.pendingUndo()?.label).toBe('Reset color of Box 1')
    document.undo()
    expect(document.bodies()[0].colorOverrides).toEqual([{ color: 0xff0000 }])
  })

  it('refuses a malformed subPart and an unknown body, appending nothing', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
    const before = document.records.length
    expect(() => document.clearColorOverride('a', { subPart: '' }, { origin: 'local' })).toThrow(/subPart/)
    expect(() => document.clearColorOverride('nope', {}, { origin: 'local' })).toThrow(/no such body/)
    expect(document.records.length).toBe(before)
  })
})

describe('a colour pick names itself in Undo (TODO/ui-037)', () => {
  it('labels a recolour "Recolor <body>", not the generic "Edit <body>"', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1' }, { origin: 'local' })
    document.setColorOverride('a', { color: 0xff0000 }, { origin: 'local' })
    expect(document.pendingUndo()?.label).toBe('Recolor Box 1')
  })
})

describe('deleteBodies — a delete is an appended tombstone, not a removed entry (TODO/ui-051)', () => {
  /** Two boxes, the first moved and recoloured, so a restore has something to get wrong. */
  function twoBoxes(options = {}) {
    const document = doc(options)
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1', params: { size: 3 } }, { origin: 'local' })
    document.append({ id: 'b', op: 'fake.box', name: 'Box 2', params: { size: 4 } }, { origin: 'local' })
    return document
  }

  it('deleting one of two bodies leaves only the other, untouched', () => {
    const document = twoBoxes()
    const [, keptBefore] = document.bodies()

    const { records } = document.deleteBodies(['a'], { origin: 'local' })

    expect(records).toHaveLength(1)
    expect(records[0].op).toBe('body.delete')
    expect(records[0].supersedes).toBe('a')
    const bodies = document.bodies()
    expect(bodies.map((body) => body.id)).toEqual(['b'])
    expect(bodies[0].geometry).toBe(keptBefore.geometry)
    expect(bodies[0]).toEqual(keptBefore)
    // Nothing was taken out of the log: the tombstone is one more line in it.
    expect(document.records.map((record) => record.id)).toEqual(['a', 'b', records[0].id])
    expect(document.pendingUndo()?.label).toBe('Delete Box 1')
  })

  it('never reaches the kernel — a tombstone builds no geometry', () => {
    let builds = 0
    const counting = Object.freeze({
      ...fakeRegistry,
      'fake.box': Object.freeze({
        kind: 'native',
        operandCount: 0,
        build: () => {
          builds += 1
          return { tag: 'box' }
        },
      }),
    })
    const document = createDocument({ registry: counting })
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1' }, { origin: 'local' })
    const before = builds
    const { records } = document.deleteBodies(['a'], { origin: 'local' })
    expect(builds).toBe(before)
    expect(document.scene.byId.has(/** @type {string} */ (records[0].id))).toBe(false)
  })

  it('undo brings the body back exactly: same id, terminal record, rotation and colour', () => {
    const document = twoBoxes()
    const { record: recolor } = document.setColorOverride('a', { color: 0xff0000 }, { origin: 'local' })
    document.append(
      {
        id: 'a-move',
        op: 'fake.move',
        target: recolor.id,
        supersedes: recolor.id,
        params: { by: 2, rotation: [0, 0, 30] },
      },
      { origin: 'local' }
    )
    const before = document.bodies().find((body) => body.id === 'a')

    document.deleteBodies(['a'], { origin: 'local' })
    expect(document.bodies().some((body) => body.id === 'a')).toBe(false)
    document.undo()

    const after = document.bodies().find((body) => body.id === 'a')
    expect(after).toEqual(before)
    expect(after?.recordId).toBe(before?.recordId)
    expect(after?.rotationDeg).toEqual([0, 0, 30])
    expect(after?.colorOverrides).toEqual([{ color: 0xff0000 }])
    // Redo deletes it again, and the undo is also exact by the fold path.
    document.redo()
    expect(document.bodies().map((body) => body.id)).toEqual(['b'])
  })

  it('undo is exact on the re-fold path too (restoring turned off)', () => {
    const document = twoBoxes({ restorableSteps: 0 })
    const before = document.bodies()
    document.deleteBodies(['a'], { origin: 'local' })
    document.undo()
    expect(document.bodies()).toEqual(before)
  })

  it('deleting 3 bodies in one call is one undo step, labelled with the count', () => {
    const document = twoBoxes()
    document.append({ id: 'c', op: 'fake.box', name: 'Box 3' }, { origin: 'local' })
    const stepsBefore = document.records.length

    const { records } = document.deleteBodies(['a', 'b', 'c'], { origin: 'local' })

    expect(records).toHaveLength(3)
    expect(document.records.length).toBe(stepsBefore + 3)
    expect(document.bodies()).toEqual([])
    expect(document.pendingUndo()?.label).toBe('Delete 3 objects')
    document.undo()
    expect(document.bodies().map((body) => body.id)).toEqual(['a', 'b', 'c'])
    expect(document.canUndo()).toBe(true) // the three placements are still there to undo
    expect(document.pendingUndo()?.label).toBe('Place Box 3')
  })

  it('accepts any id in the lineage, not only the root', () => {
    const document = twoBoxes()
    document.append({ id: 'a-move', op: 'fake.move', target: 'a', supersedes: 'a' }, { origin: 'local' })
    const { records } = document.deleteBodies(['a-move'], { origin: 'local' })
    expect(records[0].supersedes).toBe('a-move')
    expect(document.bodies().map((body) => body.id)).toEqual(['b'])
  })

  it('superseding a deleted body is refused by name', () => {
    const document = twoBoxes()
    const { records } = document.deleteBodies(['a'], { origin: 'local' })
    const tombstone = /** @type {string} */ (records[0].id)
    expect(() =>
      document.append({ id: 'x', op: 'fake.move', target: tombstone, supersedes: tombstone }, { origin: 'local' })
    ).toThrow(/Box 1.*deleted/)
    expect(() =>
      document.append({ id: 'y', op: 'fake.move', target: 'a', supersedes: 'a' }, { origin: 'local' })
    ).toThrow(/Box 1.*deleted/)
  })

  it('consuming a deleted body is refused by name', () => {
    const document = twoBoxes()
    document.deleteBodies(['a'], { origin: 'local' })
    expect(() =>
      document.append(
        { id: 'm', op: 'fake.merge', target: 'a', operands: ['b'], consumes: ['a', 'b'] },
        { origin: 'local' }
      )
    ).toThrow(/Box 1.*deleted/)
    expect(document.bodies().map((body) => body.id)).toEqual(['b'])
  })

  it('naming a deleted body as a plain operand is refused by name too', () => {
    const document = twoBoxes()
    document.deleteBodies(['a'], { origin: 'local' })
    expect(() =>
      document.append({ id: 'm', op: 'fake.move', target: 'a' }, { origin: 'local' })
    ).toThrow(/Box 1.*deleted/)
  })

  it('suppressing the Delete row un-deletes the body; unsuppressing deletes it again (data-004)', () => {
    const document = twoBoxes()
    const { records } = document.deleteBodies(['a'], { origin: 'local' })
    const tombstone = /** @type {string} */ (records[0].id)

    document.setSuppressed(tombstone, true, { origin: 'local' })
    expect(document.bodies().map((body) => body.id)).toEqual(['a', 'b'])
    document.setSuppressed(tombstone, false, { origin: 'local' })
    expect(document.bodies().map((body) => body.id)).toEqual(['b'])
  })

  it('moving a Move of Box 1 to after its Delete is refused atomically (data-004)', () => {
    const document = twoBoxes()
    document.append({ id: 'a-move', op: 'fake.move', target: 'a', supersedes: 'a' }, { origin: 'local' })
    const { records } = document.deleteBodies(['a'], { origin: 'local' })
    const before = document.records.slice()

    // The static check already sees it: the Delete names the Move's result.
    expect(document.canMove('a-move', 1).allowed).toBe(false)
    expect(() => document.moveStep('a-move', 1, { origin: 'local' })).toThrow(/uses step 3's result/)
    expect(document.records).toEqual(before)

    // And the replay itself, handed that order directly, names the body.
    const reordered = [before[0], before[1], records[0], before[2]].map((record) => ({ record, origin: 'local' }))
    let rejection
    try {
      document.loadEntries(reordered)
    } catch (error) {
      rejection = error
    }
    expect(rejection).toBeInstanceOf(ReplayRejection)
    expect(/** @type {ReplayRejection} */ (rejection).step.reason).toBe('needs Box 1')
    expect(document.records).toEqual(before)
    expect(document.bodies().map((body) => body.id)).toEqual(['b'])
  })

  it('a later edit before the Delete still replays, and the body stays deleted', () => {
    const document = twoBoxes()
    document.deleteBodies(['a'], { origin: 'local' })
    // Edit Box 2's creation step in place (section 15); the fold re-runs past the tombstone.
    document.replaceRecord(
      'b',
      { id: 'b', op: 'fake.box', name: 'Box 2', params: { size: 9 } },
      { origin: 'local' }
    )
    expect(document.bodies().map((body) => [body.id, body.params.size])).toEqual([['b', 9]])
  })

  it('a delete while rolled back inserts at the marker, like every other mutation (section 18)', () => {
    const document = twoBoxes()
    document.append({ id: 'c', op: 'fake.box', name: 'Box 3' }, { origin: 'local' })
    document.rollBackTo('b', { origin: 'local' })
    document.deleteBodies(['a'], { origin: 'local' })
    expect(document.bodies().map((body) => body.id)).toEqual(['b'])
    document.rollForward({ origin: 'local' })
    expect(document.bodies().map((body) => body.id)).toEqual(['b', 'c'])
  })

  it('round-trips through loadEntries: a reloaded document keeps the body deleted', () => {
    const document = twoBoxes()
    document.deleteBodies(['a'], { origin: 'local' })
    const reloaded = doc()
    reloaded.loadEntries(document.entries)
    expect(reloaded.bodies().map((body) => body.id)).toEqual(['b'])
    // …and the reloaded tombstone still guards the lineage.
    expect(() =>
      reloaded.append({ id: 'y', op: 'fake.move', target: 'a', supersedes: 'a' }, { origin: 'local' })
    ).toThrow(/deleted/)
  })

  describe('degenerate cases', () => {
    it('an empty id list is a no-op that appends nothing and pushes no step', () => {
      const document = twoBoxes()
      const before = document.records.length
      const label = document.pendingUndo()?.label
      const { records } = document.deleteBodies([], { origin: 'local' })
      expect(records).toEqual([])
      expect(document.records.length).toBe(before)
      expect(document.pendingUndo()?.label).toBe(label)
    })

    it('deleting an already-deleted body is refused', () => {
      const document = twoBoxes()
      document.deleteBodies(['a'], { origin: 'local' })
      const before = document.records.length
      expect(() => document.deleteBodies(['a'], { origin: 'local' })).toThrow(/Box 1.*deleted/)
      expect(document.records.length).toBe(before)
    })

    it('deleting an unknown id is refused, appending nothing — even alongside a good one', () => {
      const document = twoBoxes()
      const before = document.records.length
      expect(() => document.deleteBodies(['b', 'nope'], { origin: 'local' })).toThrow(/no such body "nope"/)
      expect(document.records.length).toBe(before)
      expect(document.bodies().map((body) => body.id)).toEqual(['a', 'b'])
    })

    it('naming one body twice (root and a later record of it) is refused', () => {
      const document = twoBoxes()
      document.append({ id: 'a-move', op: 'fake.move', target: 'a', supersedes: 'a' }, { origin: 'local' })
      expect(() => document.deleteBodies(['a', 'a-move'], { origin: 'local' })).toThrow(/twice/)
    })

    it('a body already consumed into another is refused — delete the result instead', () => {
      const document = twoBoxes()
      document.append(
        { id: 'm', op: 'fake.merge', name: 'Merged 1', target: 'a', operands: ['b'], consumes: ['a', 'b'] },
        { origin: 'local' }
      )
      expect(() => document.deleteBodies(['a'], { origin: 'local' })).toThrow(/consumed/)
      document.deleteBodies(['m'], { origin: 'local' })
      expect(document.bodies()).toEqual([])
    })

    it('a hand-written tombstone must supersede something', () => {
      const document = twoBoxes()
      expect(() => document.append({ id: 'd', op: 'body.delete' }, { origin: 'local' })).toThrow(/supersede/)
    })
  })
})

describe('removePart — removing one part is a supersession, not a tombstone (TODO/ui-051)', () => {
  it('appends a group.removePart record over the terminal and labels it by part and body', () => {
    /** @type {string[]} */
    const removals = []
    const withRemove = Object.freeze({
      ...fakeRegistry,
      'group.removePart': Object.freeze({
        kind: 'native',
        operandCount: 1,
        build: (/** @type {any} */ { params, inputs }) => {
          removals.push(params.part)
          return { tag: 'without', part: params.part, from: inputs[0] }
        },
      }),
    })
    const document = createDocument({ registry: withRemove })
    document.append({ id: 'pi', op: 'fake.box', name: 'Raspberry Pi 1' }, { origin: 'local' })

    const { record } = document.removePart('pi', 'usb1', { origin: 'local' })

    expect(record).toMatchObject({ op: 'group.removePart', target: 'pi', supersedes: 'pi', params: { part: 'usb1' } })
    expect(record.name).toBeUndefined()
    expect(removals).toEqual(['usb1'])
    const [body] = document.bodies()
    expect(body.id).toBe('pi') // the body survives: same lineage, same identity
    expect(body.recordId).toBe(record.id)
    expect(document.pendingUndo()?.label).toBe('Remove usb1 from Raspberry Pi 1')
    document.undo()
    expect(document.bodies()[0].recordId).toBe('pi')
  })

  it('refuses an empty part name and an unknown body, appending nothing', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
    const before = document.records.length
    expect(() => document.removePart('a', '', { origin: 'local' })).toThrow(/part name/)
    expect(() => document.removePart('nope', 'usb1', { origin: 'local' })).toThrow(/no such body/)
    expect(document.records.length).toBe(before)
  })

  it('refuses a part of a deleted body', () => {
    const document = doc()
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1' }, { origin: 'local' })
    document.deleteBodies(['a'], { origin: 'local' })
    expect(() => document.removePart('a', 'usb1', { origin: 'local' })).toThrow(/deleted/)
  })
})

describe('transform.mirror — creation-shaped: a second body, the original untouched (TODO/core-028)', () => {
  /**
   * The record shape `core-028` settled on, and the one `ui-039`'s commit appends:
   * `target` names the source body's **current terminal** (so a moved cube is
   * mirrored where it now is), and there is **no `supersedes` and no `consumes`** —
   * which is all it takes for `append` to make it its own new lineage root. Real
   * registry throughout: the claim is about real geometry landing where it should.
   *
   * @param {ReturnType<typeof createDocument>} document
   * @param {string} sourceId Any id in the source body's lineage.
   * @param {Record<string, any>} params
   */
  const mirrorOf = (document, sourceId, params) => {
    const id = document.nextId(`${sourceId}-mirror`)
    document.append(
      {
        id,
        op: 'transform.mirror',
        name: `${sourceId} mirror`,
        target: document.currentIdOf(sourceId),
        params,
      },
      { origin: 'local' }
    )
    return id
  }

  /** A 4 mm cube, placed then moved to x = 20 the way a real drop + drag leaves one. */
  const placedCube = () => {
    const document = createDocument()
    document.append(
      { id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [4, 4, 4] } },
      { origin: 'local' }
    )
    document.append(
      { id: 'cube-move', op: 'transform.translate', target: 'cube', supersedes: 'cube', params: { vector: [20, 0, 0] } },
      { origin: 'local' }
    )
    return document
  }

  it('reports two bodies afterwards, not one', () => {
    const document = placedCube()
    expect(document.bodies()).toHaveLength(1)
    const mirrorId = mirrorOf(document, 'cube', { axis: 'x', pointMm: [0, 0, 0] })
    const bodies = document.bodies()
    expect(bodies.map((body) => body.id)).toEqual(['cube', mirrorId])
    // Its own body — own identity, own op, own name — not a continuation of the cube.
    expect(bodies[1]).toMatchObject({ id: mirrorId, recordId: mirrorId, op: 'transform.mirror' })
  })

  it("leaves the original body's records, geometry and position exactly as they were", () => {
    const document = placedCube()
    const [before] = document.bodies()
    const lineageBefore = document.lineageOf('cube').map((record) => record.id)
    const recordsBefore = document.records.slice()

    mirrorOf(document, 'cube', { axis: 'x', pointMm: [0, 0, 0] })

    const original = document.bodies().find((body) => body.id === 'cube')
    // Same terminal, same geometry object — not re-derived, not superseded.
    expect(original?.recordId).toBe(before.recordId)
    expect(original?.geometry).toBe(before.geometry)
    expect(document.lineageOf('cube').map((record) => record.id)).toEqual(lineageBefore)
    expect(document.currentIdOf('cube')).toBe('cube-move')
    // Every earlier record is still there, byte for byte; the mirror only appended.
    expect(document.records.slice(0, recordsBefore.length)).toEqual(recordsBefore)
    const [min, max] = boundsOf(/** @type {any} */ (original?.geometry))
    expect(min[0]).toBeCloseTo(18, 9)
    expect(max[0]).toBeCloseTo(22, 9)
  })

  it('puts the new body where the reflection says, reading the source where it now is', () => {
    const document = placedCube()
    const mirrorId = mirrorOf(document, 'cube', { axis: 'x', pointMm: [0, 0, 0] })
    const copy = document.bodies().find((body) => body.id === mirrorId)
    const [min, max] = boundsOf(/** @type {any} */ (copy?.geometry))
    expect(min[0]).toBeCloseTo(-22, 9)
    expect(max[0]).toBeCloseTo(-18, 9)
  })

  it('the two bodies are independent: moving either one afterwards leaves the other alone', () => {
    const document = placedCube()
    const mirrorId = mirrorOf(document, 'cube', { axis: 'x', pointMm: [0, 0, 0] })
    const xMinOf = (/** @type {string} */ id) =>
      boundsOf(/** @type {any} */ (document.bodies().find((body) => body.id === id)?.geometry))[0][0]

    // Move the original on: the copy is a snapshot, like V1's `cableTie.mirrorY()`,
    // not a live reflection that follows it around.
    document.append(
      { id: 'cube-move-2', op: 'transform.translate', target: 'cube-move', supersedes: 'cube-move', params: { vector: [0, 0, 7] } },
      { origin: 'local' }
    )
    expect(xMinOf(mirrorId)).toBeCloseTo(-22, 9)
    expect(document.bodies()).toHaveLength(2)

    // Move the copy: it supersedes its own lineage, never the cube's.
    document.append(
      { id: `${mirrorId}-move`, op: 'transform.translate', target: mirrorId, supersedes: mirrorId, params: { vector: [-5, 0, 0] } },
      { origin: 'local' }
    )
    expect(xMinOf(mirrorId)).toBeCloseTo(-27, 9)
    expect(xMinOf('cube')).toBeCloseTo(18, 9)
    expect(document.bodies()).toHaveLength(2)
  })

  it('one undo takes the copy away and leaves the original where it was', () => {
    const document = placedCube()
    mirrorOf(document, 'cube', { axis: 'x', pointMm: [0, 0, 0] })
    document.undo()
    const bodies = document.bodies()
    expect(bodies.map((body) => body.id)).toEqual(['cube'])
    expect(bodies[0].recordId).toBe('cube-move')
  })

  it('defaults the plane to the source body’s own centre when the record names no point', () => {
    const document = placedCube()
    const mirrorId = mirrorOf(document, 'cube', { axis: 'x' })
    const copy = document.bodies().find((body) => body.id === mirrorId)
    // A symmetric cube reflected about its own centre lands exactly on itself — worth
    // pinning, since it is what a user sees if the UI commits without a point.
    const [min, max] = boundsOf(/** @type {any} */ (copy?.geometry))
    expect(min[0]).toBeCloseTo(18, 9)
    expect(max[0]).toBeCloseTo(22, 9)
  })

  it('core-020 regression: a mirrored composite holds only its own parts, never an earlier body', () => {
    // `core-020`'s bug was a composite appended incrementally absorbing every earlier
    // *named* body into its group. A mirror record is a new kind of named, creation-
    // shaped record reading another body's geometry, so re-run that repro against it:
    // a plate, then a bolt, then a mirror of the bolt.
    const document = createDocument()
    document.append(
      { id: 'plate', op: 'primitive.cuboid', name: 'Plate 1', params: { size: [40, 40, 4] } },
      { origin: 'local' }
    )
    document.append(
      { id: 'bolt', op: 'hardware.bolt', name: 'Bolt 1', params: realRegistry['hardware.bolt'].ui?.defaults },
      { origin: 'local' }
    )
    const mirrorId = mirrorOf(document, 'bolt', { axis: 'z', pointMm: [0, 0, 0] })

    const bodies = document.bodies()
    expect(bodies.map((body) => body.id)).toEqual(['plate', 'bolt', mirrorId])
    const bolt = bodies[1].geometry
    const copy = bodies[2].geometry
    if (!isGroup(bolt) || !isGroup(copy)) throw new Error('a bolt and its mirror are both groups')
    expect(copy.names).toEqual(bolt.names)
    expect(Object.keys(copy.parts).sort()).toEqual(Object.keys(bolt.parts).sort())
    expect(Object.keys(copy.parts)).not.toContain('Plate 1')
    expect(Object.keys(copy.parts)).not.toContain('Bolt 1')
  })
})

describe('replica-scoped record ids (TODO/data-008)', () => {
  /** @param {import('./document.js').WarpDocument} document @param {number} count */
  function appendBoxes(document, count) {
    const ids = []
    for (let i = 0; i < count; i += 1) {
      const id = document.nextId('primitive')
      document.append({ id, op: 'fake.box', name: `Cube ${i + 1}` }, { origin: 'local' })
      ids.push(id)
    }
    return ids
  }

  it('mints prefix-replica-counter ids from the replica it was given', () => {
    const document = doc({ replica: 'abcdef' })
    expect(document.replicaId()).toBe('abcdef')
    expect(document.nextId('primitive')).toBe('primitive-abcdef-1')
    expect(document.nextId('primitive')).toBe('primitive-abcdef-2')
  })

  it('gives every instance its own replica id unless the caller passes one', () => {
    expect(doc().replicaId()).not.toBe(doc().replicaId())
  })

  it('two documents seeded from the same entries share no new id over 1000 appends each', () => {
    const seed = doc({ replica: 'seedaa' })
    appendBoxes(seed, 3)
    const entries = seed.entries.map((entry) => ({ ...entry }))

    const human = doc()
    const fork = doc()
    human.loadEntries(entries)
    fork.loadEntries(entries)
    const mine = appendBoxes(human, 1000)
    const theirs = appendBoxes(fork, 1000)

    expect(new Set([...mine, ...theirs]).size).toBe(2000)
    for (const { record } of seed.entries) {
      expect(mine).not.toContain(record.id)
      expect(theirs).not.toContain(record.id)
    }
  })

  it('a legacy file loads untouched and its ids are never reissued', () => {
    const document = doc({ replica: 'abcdef' })
    document.loadEntries([
      { record: { id: 'op-1', op: 'fake.box', name: 'Cube 1' }, origin: 'local' },
      { record: { id: 'op-2', op: 'fake.box', name: 'Cube 2' }, origin: 'local' },
    ])
    expect(document.entries.map((entry) => entry.record.id)).toEqual(['op-1', 'op-2'])
    const next = document.nextId('op')
    expect(next).toBe('op-abcdef-1')
    expect(['op-1', 'op-2']).not.toContain(next)
  })

  it('moves its clock past the highest counter in a loaded file', () => {
    const document = doc({ replica: 'abcdef' })
    document.loadEntries([
      { record: { id: 'cube-zzzzzz-41', op: 'fake.box', name: 'Cube 1' }, origin: 'local' },
      { record: { id: 'cube-yyyyyy-7', op: 'fake.box', name: 'Cube 2' }, origin: 'local' },
    ])
    expect(document.nextId('cube')).toBe('cube-abcdef-42')
  })

  it('never reissues the id of a suppressed or rolled-back row', () => {
    const document = doc({ replica: 'abcdef' })
    const [first, second] = appendBoxes(document, 2)
    document.setSuppressed(second, true, { origin: 'local' })
    const next = document.nextId('primitive')
    expect([first, second]).not.toContain(next)
  })

  it("a fork's records land on the live document without an id clash", () => {
    const live = doc()
    appendBoxes(live, 2)
    const fork = doc()
    fork.loadEntries(live.entries.map((entry) => ({ ...entry })))
    const forked = appendBoxes(fork, 3)
    const added = appendBoxes(live, 3)
    for (const id of forked) {
      live.append({ id, op: 'fake.box', name: id }, { origin: 'ai' })
    }
    const ids = live.entries.map((entry) => entry.record.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expect.arrayContaining(added))
  })
})
