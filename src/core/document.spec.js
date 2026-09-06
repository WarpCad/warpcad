import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { boundsOf } from './kernel/group.js'

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
