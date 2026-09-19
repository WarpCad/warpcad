/**
 * Undo/redo, scoped by transaction origin (`TODO/data-003`).
 *
 * Kept in its own file rather than bolted onto `document.spec.js`'s 1,100 lines
 * because the thing under test is a *stack over* the log, not another property
 * of appending to it — and because every case here has to say something about
 * origin, which none of that file's cases do.
 *
 * Real kernel geometry in the position/boolean cases, deliberately: "restores
 * the pre-transform position exactly" and "both operands reappear" are claims
 * about millimetres and about `bodies()`, and a fake registry returning
 * `{tag:'box'}` could satisfy the bookkeeping while the geometry silently came
 * back wrong. The bookkeeping-only cases keep the fake, per CLAUDE.md's "always
 * mock at the boundary".
 */
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { boundsOf } from './kernel/group.js'

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
  'fake.merge': Object.freeze({
    kind: 'native',
    operandCount: '2+',
    build: (/** @type {any} */ { inputs }) => ({ tag: 'merged', of: inputs.length }),
  }),
})

/** @param {object} [options] */
function fakeDoc(options = {}) {
  return createDocument({ registry: fakeRegistry, ...options })
}

/** A real-geometry document. */
function realDoc() {
  return createDocument()
}

/**
 * The millimetre centre of a body, measured off its evaluated geometry — the
 * same measurement `src/stores/document.js` reports to the UI.
 *
 * @param {any} document
 * @param {string} bodyId
 * @returns {[number, number, number]}
 */
function centerOf(document, bodyId) {
  const body = document.bodies().find((/** @type {any} */ candidate) => candidate.id === bodyId)
  if (!body) throw new Error(`no body "${bodyId}"`)
  const [min, max] = boundsOf(body.geometry)
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}

/** A 40mm cube record centred on the origin. */
function cubeRecord(id = 'cube-1', name = 'Cube 1') {
  return { id, op: 'primitive.cuboid', name, params: { size: [40, 40, 40], center: [0, 0, 0] } }
}

describe('undo/redo — the local user’s own edits, and only those', () => {
  it('restores the pre-transform position exactly', () => {
    const document = realDoc()
    document.append(cubeRecord(), { origin: 'local' })
    const before = centerOf(document, 'cube-1')

    document.append(
      {
        id: 'cube-1-move-1',
        op: 'transform.translate',
        target: 'cube-1',
        supersedes: 'cube-1',
        params: { vector: [12.5, -7.25, 0], rotation: [0, 0, 0] },
      },
      { origin: 'local' }
    )
    expect(centerOf(document, 'cube-1')[0]).toBeCloseTo(before[0] + 12.5, 9)

    document.undo()

    const after = centerOf(document, 'cube-1')
    expect(after[0]).toBeCloseTo(before[0], 9)
    expect(after[1]).toBeCloseTo(before[1], 9)
    expect(after[2]).toBeCloseTo(before[2], 9)
    // The body itself survives the undo of its *move* — undo removed one step,
    // not the cube.
    expect(document.bodies()).toHaveLength(1)
  })

  it('redoes the transform exactly', () => {
    const document = realDoc()
    document.append(cubeRecord(), { origin: 'local' })
    document.append(
      {
        id: 'cube-1-move-1',
        op: 'transform.translate',
        target: 'cube-1',
        supersedes: 'cube-1',
        params: { vector: [12.5, -7.25, 0], rotation: [0, 0, 0] },
      },
      { origin: 'local' }
    )
    const moved = centerOf(document, 'cube-1')

    document.undo()
    document.redo()

    const again = centerOf(document, 'cube-1')
    expect(again[0]).toBeCloseTo(moved[0], 9)
    expect(again[1]).toBeCloseTo(moved[1], 9)
    expect(again[2]).toBeCloseTo(moved[2], 9)
    // `ui-012`'s regression surface: the redone move must re-enter its *own*
    // lineage, not start a second one. Two live bodies here would be the
    // double-render defect supersession exists to prevent.
    expect(document.bodies()).toHaveLength(1)
    expect(document.bodies()[0].id).toBe('cube-1')
  })

  it('never lets undo touch a programmatic-origin record', () => {
    const document = fakeDoc()
    document.append({ id: 'local-1', op: 'fake.box', name: 'Local' }, { origin: 'local' })
    document.append({ id: 'mcp-1', op: 'fake.box', name: 'Remote' }, { origin: 'programmatic' })

    // One undoable step, not two — the programmatic record is in the document
    // and in `bodies()`, but it is not this user's to undo.
    expect(document.canUndo()).toBe(true)
    document.undo()

    expect(document.canUndo()).toBe(false)
    expect(document.records.map((record) => record.id)).toEqual(['mcp-1'])
    expect(document.bodies().map((body) => body.id)).toEqual(['mcp-1'])
  })

  it('does not disturb the stacks when a remote record arrives', () => {
    const document = fakeDoc()
    document.append({ id: 'local-1', op: 'fake.box' }, { origin: 'local' })
    document.undo()
    expect(document.canRedo()).toBe(true)

    // Point 3 of the origin-scoping contract: a remote arrival "does not touch
    // the undo buttons". A naive "any mutation clears redo" would silently eat
    // the user's redo because someone else edited the project.
    document.append({ id: 'remote-1', op: 'fake.box' }, { origin: 'remote' })
    expect(document.canRedo()).toBe(true)
    expect(document.canUndo()).toBe(false)

    // Redo is an **insert at the original index**, not an append: the redone
    // step goes back where it was, so the log reads as though the undo never
    // happened rather than quietly reordering the user's work behind a remote
    // arrival. That is also the insert-at-index primitive `data-004` needs for
    // inserting at a rollback marker, which is why it is worth pinning here.
    document.redo()
    expect(document.records.map((record) => record.id)).toEqual(['local-1', 'remote-1'])
  })

  it('clears the redo stack on a new local mutation', () => {
    const document = fakeDoc()
    document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
    document.undo()
    expect(document.canRedo()).toBe(true)

    document.append({ id: 'b', op: 'fake.box' }, { origin: 'local' })
    expect(document.canRedo()).toBe(false)
  })

  it('refuses by name when undoing would orphan a step someone else added', () => {
    const document = fakeDoc()
    document.append({ id: 'a', op: 'fake.box', name: 'Box 1' }, { origin: 'local' })
    document.append(
      { id: 'mcp-move', op: 'fake.move', name: 'Nudged', target: 'a', supersedes: 'a' },
      { origin: 'programmatic' }
    )

    // Point 4 of the contract: refuse, naming the blocking step — never delete
    // someone else's work and never leave a hole in the log.
    expect(() => document.undo()).toThrow(/Nudged/)
    expect(() => document.undo()).toThrow(/programmatic/)
    // And the refusal changed nothing.
    expect(document.records.map((record) => record.id)).toEqual(['a', 'mcp-move'])
    expect(document.bodies()).toHaveLength(1)
    expect(document.canUndo()).toBe(true)
  })

  it('brings both operands back when a boolean is undone, and re-consumes them on redo', () => {
    const document = realDoc()
    document.append(cubeRecord('cube-1', 'Cube 1'), { origin: 'local' })
    document.append(
      {
        id: 'cube-2',
        op: 'primitive.cuboid',
        name: 'Cube 2',
        params: { size: [20, 20, 20], center: [15, 0, 0] },
      },
      { origin: 'local' }
    )
    const cube1Before = centerOf(document, 'cube-1')
    const cube2Before = centerOf(document, 'cube-2')

    document.append(
      {
        id: 'sub-1',
        op: 'boolean.subtract',
        name: 'Subtract 1',
        target: 'cube-1',
        operands: ['cube-2'],
        consumes: ['cube-1', 'cube-2'],
      },
      { origin: 'local' }
    )
    expect(document.bodies().map((body) => body.id)).toEqual(['sub-1'])

    document.undo()

    // The degenerate case the TODO names: both operands back, separately
    // selectable, neither merged nor missing — and in their original order.
    expect(document.bodies().map((body) => body.id)).toEqual(['cube-1', 'cube-2'])
    expect(centerOf(document, 'cube-1')[0]).toBeCloseTo(cube1Before[0], 9)
    expect(centerOf(document, 'cube-2')[0]).toBeCloseTo(cube2Before[0], 9)

    document.redo()
    expect(document.bodies().map((body) => body.id)).toEqual(['sub-1'])
  })

  it('treats one gesture as one step, however many records it took', () => {
    const document = fakeDoc()
    // A composite drop (`ui-030`): the recipe's own record plus the trailing
    // translate that puts it where the pointer let go. Two records, one thing
    // the user did — so one press of Undo, not two.
    document.appendAll(
      [
        { id: 'bolt-1', op: 'fake.box', name: 'Bolt 1' },
        {
          id: 'bolt-1-drop',
          op: 'fake.move',
          target: 'bolt-1',
          supersedes: 'bolt-1',
          params: { by: 4 },
        },
      ],
      { origin: 'local' }
    )
    expect(document.records).toHaveLength(2)

    document.undo()
    expect(document.records).toEqual([])
    expect(document.canUndo()).toBe(false)

    document.redo()
    expect(document.records.map((record) => record.id)).toEqual(['bolt-1', 'bolt-1-drop'])
    expect(document.bodies()).toHaveLength(1)
  })

  it('names the action, so the button can say what it will undo', () => {
    const document = realDoc()
    document.append(cubeRecord(), { origin: 'local' })
    expect(document.pendingUndo()?.label).toBe('Place Cube 1')

    document.append(
      {
        id: 'cube-1-move-1',
        op: 'transform.translate',
        target: 'cube-1',
        supersedes: 'cube-1',
        params: { vector: [5, 0, 0], rotation: [0, 0, 0] },
      },
      { origin: 'local' }
    )
    expect(document.pendingUndo()?.label).toBe('Move Cube 1')

    document.undo()
    expect(document.pendingRedo()?.label).toBe('Move Cube 1')
    expect(document.pendingUndo()?.label).toBe('Place Cube 1')

    // `ui-029`'s param edit reuses the body's own *creation* op and carries a
    // generated id and no name, so the naive "no verb means a placement" rule
    // would announce `Place cube-1-param-1`. It is an edit of Cube 1.
    document.append(
      {
        id: 'cube-1-param-1',
        op: 'primitive.cuboid',
        supersedes: 'cube-1',
        params: { size: [50, 40, 40], center: [0, 0, 0] },
      },
      { origin: 'local' }
    )
    expect(document.pendingUndo()?.label).toBe('Edit Cube 1')
  })

  it('carries opaque step metadata, which is how selection is restored', () => {
    const document = fakeDoc()
    document.append(
      { id: 'a', op: 'fake.box' },
      { origin: 'local', meta: { selectionBefore: ['x', 'y'] } }
    )
    expect(document.pendingUndo()?.meta).toEqual({ selectionBefore: ['x', 'y'] })
    expect(document.undo()?.meta).toEqual({ selectionBefore: ['x', 'y'] })
  })

  it('starts with empty stacks, and clears them without touching the document', () => {
    const document = fakeDoc()
    expect(document.canUndo()).toBe(false)
    expect(document.canRedo()).toBe(false)
    expect(document.pendingUndo()).toBeUndefined()

    document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
    document.undo()
    document.append({ id: 'b', op: 'fake.box' }, { origin: 'local' })

    // Section 19's decided rule: the stacks start empty after a reload and after
    // Open — the document survives, the history of how you got there does not.
    document.clearHistory()
    expect(document.canUndo()).toBe(false)
    expect(document.canRedo()).toBe(false)
    expect(document.records.map((record) => record.id)).toEqual(['b'])
    expect(document.bodies()).toHaveLength(1)
  })

  it('leaves the document untouched when there is nothing to undo or redo', () => {
    const document = fakeDoc()
    document.append({ id: 'a', op: 'fake.box' }, { origin: 'local' })
    const versionBefore = document.version
    expect(document.redo()).toBeUndefined()
    expect(document.version).toBe(versionBefore)
    document.undo()
    expect(document.undo()).toBeUndefined()
    expect(document.records).toEqual([])
  })

  it('does not enter the stack for a seeded document’s own records', () => {
    // Loading a file is not something to undo back out of (section 19: the
    // stacks start empty after Open), and the seed loop runs through `append`.
    const document = fakeDoc({
      actions: [{ id: 'a', op: 'fake.box' }, { id: 'b', op: 'fake.box' }],
      origin: 'local',
    })
    expect(document.bodies()).toHaveLength(2)
    expect(document.canUndo()).toBe(false)
  })

  it('keeps id generation monotonic across an undo, so a redo can never collide', () => {
    const document = fakeDoc()
    const first = document.nextId('x')
    document.append({ id: first, op: 'fake.box' }, { origin: 'local' })
    document.undo()
    expect(document.nextId('x')).not.toBe(first)
  })

  it('keeps `core-020`’s guarantee across an undo/redo cycle', () => {
    // `core-020`: a composite appended after other bodies must not absorb them.
    // The rebuild an undo performs re-runs the very lineage bookkeeping that
    // finding was about, so it gets re-checked here rather than assumed.
    const document = fakeDoc()
    document.append({ id: 'earlier', op: 'fake.box', name: 'Earlier' }, { origin: 'local' })
    document.appendAll(
      [
        { id: 'composite', op: 'fake.box', name: 'Composite' },
        {
          id: 'composite-drop',
          op: 'fake.move',
          target: 'composite',
          supersedes: 'composite',
          params: { by: 2 },
        },
      ],
      { origin: 'local' }
    )
    expect(document.bodies().map((body) => body.id)).toEqual(['earlier', 'composite'])

    document.undo()
    expect(document.bodies().map((body) => body.id)).toEqual(['earlier'])

    document.redo()
    expect(document.bodies().map((body) => body.id)).toEqual(['earlier', 'composite'])
  })
})
