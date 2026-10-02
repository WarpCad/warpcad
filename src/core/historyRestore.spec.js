// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Undo/Redo without a re-fold (`TODO/core-030`, option 2).
 *
 * Undo used to be remove-and-re-fold (`data-003`): take the step out of the log and
 * run the whole remaining log back through the kernel — 70-78 ms on `data-004`'s
 * 200-record scene and 133-163 ms on the 24-body composite scene, on the main thread,
 * every press. `core-030` measured that the common Undo (the most recent change, with
 * nothing else written since) needs no fold at all: the fold is deterministic, so the
 * derived state the document had *before* the step is exactly what a re-fold of the
 * remaining log would produce, and it can simply be put back.
 *
 * What this file pins down, in three kinds of case:
 *
 * 1. **It does not fold.** Counted at the registry boundary (a fake registry whose
 *    `build` counts calls — the same evidence `document.spec.js` uses for sketch
 *    records), because "it was fast" is not evidence and "it ran" is not either.
 * 2. **It is identical to the fold it replaces.** Every script runs twice, on a
 *    restoring document and on a twin with `restorableSteps: 0` (the old, always-fold
 *    path), and after *every* action both are compared field by field — `bodies()`
 *    with real kernel geometry, every id's `rootOf`/`currentIdOf`/`originOf`/
 *    `lineageOf`, `timeline()`, `brokenSteps()`, the marker, both stacks' labels —
 *    and against a third, independent fresh fold of the same entries.
 * 3. **It falls back honestly.** When something *was* written since the step (a
 *    remote record, a batch that failed half-way, a snapshot aged out of the bounded
 *    history), Undo re-folds exactly as before — including refusing by name.
 */
import { describe, expect, it } from 'vitest'

import { observe } from './__fixtures__/documentObservation.js'
import { ReplayRejection, createDocument } from './document.js'
import { registry as realRegistry } from './kernel/registry.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * A fake registry whose every `build` is counted — the fold's whole kernel cost,
 * observable as one number.
 */
function countingRegistry() {
  const calls = { count: 0 }
  /** @type {any} */
  const registry = Object.freeze({
    'fake.box': Object.freeze({
      kind: 'native',
      operandCount: 0,
      build: (/** @type {any} */ { params }) => {
        calls.count += 1
        return { tag: 'box', size: params.size ?? 1 }
      },
    }),
    'fake.move': Object.freeze({
      kind: 'native',
      operandCount: 1,
      build: (/** @type {any} */ { params }) => {
        calls.count += 1
        return { tag: 'moved', by: params.by ?? 0 }
      },
    }),
    'fake.merge': Object.freeze({
      kind: 'native',
      operandCount: '2+',
      build: (/** @type {any} */ { inputs }) => {
        calls.count += 1
        return { tag: 'merged', of: inputs.length }
      },
    }),
    'fake.fail': Object.freeze({
      kind: 'native',
      operandCount: 0,
      build: () => {
        calls.count += 1
        throw new Error('refused on purpose')
      },
    }),
  })
  return { registry, calls }
}

/** @param {string} id @param {number} [size] */
const box = (id, size = 1) => ({ id, op: 'fake.box', name: id, params: { size } })

/**
 * A document with `bodies` remote-seeded boxes — enough log that a re-fold is
 * visible as a call count, and none of it on the local user's undo stack.
 *
 * @param {number} bodies
 * @param {object} [options]
 */
function seededFake(bodies, options = {}) {
  const { registry, calls } = countingRegistry()
  // Uncached by default (TODO/core-031): with the fold cache on, a fold-path Undo
  // rebuilds nothing it already had, so "zero builds" would stop telling a restore
  // apart from a fold — which is the whole of what this file's counts are evidence of.
  const document = createDocument({ registry, foldCache: null, ...options })
  document.appendAll(
    Array.from({ length: bodies }, (unused, index) => box(`seed-${index}`)),
    { origin: 'remote' }
  )
  calls.count = 0
  return { document, calls }
}

// ---------------------------------------------------------------------------
// 1. It does not fold
// ---------------------------------------------------------------------------

describe('Undo/Redo of the most recent change restore, never re-fold (TODO/core-030)', () => {
  it('undoes a placement with zero kernel builds', () => {
    const { document, calls } = seededFake(20)
    document.append(box('mine'), { origin: 'local' })
    calls.count = 0

    document.undo()

    expect(calls.count).toBe(0)
    expect(document.bodies().map((body) => body.id)).not.toContain('mine')
    expect(document.bodies()).toHaveLength(20)
  })

  it('redoes it with zero kernel builds', () => {
    const { document, calls } = seededFake(20)
    document.append(box('mine'), { origin: 'local' })
    document.undo()
    calls.count = 0

    document.redo()

    expect(calls.count).toBe(0)
    expect(document.bodies().map((body) => body.id)).toContain('mine')
  })

  it('chains: several Undos in a row, then several Redos, never fold', () => {
    const { document, calls } = seededFake(20)
    document.append(box('a'), { origin: 'local' })
    document.append({ id: 'a-mv', op: 'fake.move', target: 'a', supersedes: 'a', params: { by: 3 } }, { origin: 'local' })
    document.append(box('b'), { origin: 'local' })
    document.append(
      { id: 'ab', op: 'fake.merge', name: 'ab', target: 'a-mv', operands: ['b'], consumes: ['a-mv', 'b'] },
      { origin: 'local' }
    )
    calls.count = 0

    for (let press = 0; press < 4; press += 1) document.undo()
    for (let press = 0; press < 4; press += 1) document.redo()
    document.undo()
    document.undo()

    expect(calls.count).toBe(0)
  })

  it('undoes and redoes every data-004 row action with zero builds', () => {
    const { document, calls } = seededFake(10)
    document.append(box('a'), { origin: 'local' })
    document.append({ id: 'a-mv', op: 'fake.move', target: 'a', supersedes: 'a', params: { by: 1 } }, { origin: 'local' })
    document.append(box('b'), { origin: 'local' })

    /** @type {Array<() => void>} */
    const actions = [
      () => document.replaceRecord('a-mv', { id: 'a-mv', op: 'fake.move', target: 'a', supersedes: 'a', params: { by: 7 } }, { origin: 'local' }),
      () => document.setSuppressed('b', true, { origin: 'local' }),
      () => document.moveStep('b', -1, { origin: 'local' }),
      () => document.rollBackTo('a', { origin: 'local' }),
    ]
    for (const act of actions) {
      act()
      calls.count = 0
      document.undo()
      document.redo()
      document.undo()
      expect(calls.count).toBe(0)
    }
  })

  it('undoes an insert made while rolled back, and the roll-forward after it, with zero builds', () => {
    const { document, calls } = seededFake(5)
    document.append(box('a'), { origin: 'local' })
    document.append(box('b'), { origin: 'local' })
    document.rollBackTo('a', { origin: 'local' })
    document.append(box('c'), { origin: 'local' })
    document.rollForward({ origin: 'local' })
    calls.count = 0

    document.undo() // roll forward
    document.undo() // the insert at the marker
    document.redo()
    document.redo()

    expect(calls.count).toBe(0)
  })

  it('the row action itself re-folds, but (core-031) builds nothing whose inputs are unchanged', () => {
    const { document, calls } = seededFake(10, { foldCache: new WeakMap() })
    document.append(box('a'), { origin: 'local' })
    calls.count = 0
    document.setSuppressed('a', true, { origin: 'local' })
    expect(calls.count).toBe(0)
  })

  it('without the fold cache, the row action itself builds every active record again', () => {
    const { document, calls } = seededFake(10)
    document.append(box('a'), { origin: 'local' })
    calls.count = 0
    document.setSuppressed('a', true, { origin: 'local' })
    expect(calls.count).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// 3. It falls back honestly
// ---------------------------------------------------------------------------

describe('the fold is still the path whenever anything was written since the step', () => {
  it('re-folds when a remote record arrived after the step, and keeps it', () => {
    const { document, calls } = seededFake(10)
    document.append(box('mine'), { origin: 'local' })
    document.append(box('theirs'), { origin: 'remote' })
    calls.count = 0

    document.undo()

    expect(calls.count).toBeGreaterThan(0)
    const ids = document.bodies().map((body) => body.id)
    expect(ids).toContain('theirs')
    expect(ids).not.toContain('mine')
  })

  it('then redoes that fold-path Undo by restoring — the state before it was captured', () => {
    const { document, calls } = seededFake(10)
    document.append(box('mine'), { origin: 'local' })
    document.append(box('theirs'), { origin: 'remote' })
    document.undo()
    calls.count = 0

    document.redo()

    expect(calls.count).toBe(0)
    expect(document.bodies().map((body) => body.id)).toEqual([
      ...Array.from({ length: 10 }, (unused, index) => `seed-${index}`),
      'mine',
      'theirs',
    ])
  })

  it('still refuses by name, unchanged, when a later step someone else added depends on it', () => {
    const { document } = seededFake(3)
    document.append(box('mine'), { origin: 'local' })
    document.append({ id: 'their-move', op: 'fake.move', target: 'mine', supersedes: 'mine', params: { by: 2 } }, { origin: 'mcp' })
    const before = JSON.stringify(document.timeline())

    expect(() => document.undo()).toThrow(/depends on "Place mine"/)
    expect(JSON.stringify(document.timeline())).toBe(before)
    expect(document.canUndo()).toBe(true)
  })

  it('never restores a stale state after a batch that failed half-way', () => {
    const { document, calls } = seededFake(3)
    document.append(box('first'), { origin: 'local' })
    // Not atomic across the batch by design (`appendAll`'s note): `good` stays in
    // the log with no undo step of its own. An Undo that restored the snapshot
    // taken before `first` would silently delete it.
    expect(() =>
      document.appendAll([box('good'), { id: 'bad', op: 'fake.fail', params: {} }], { origin: 'local' })
    ).toThrow(/refused on purpose/)
    calls.count = 0

    document.undo()

    expect(calls.count).toBeGreaterThan(0)
    const ids = document.bodies().map((body) => body.id)
    expect(ids).toContain('good')
    expect(ids).not.toContain('first')
  })

  it('does not lose the free path when a local append was refused outright', () => {
    const { document, calls } = seededFake(3)
    document.append(box('first'), { origin: 'local' })
    expect(() => document.append({ id: 'bad', op: 'fake.fail', params: {} }, { origin: 'local' })).toThrow()
    calls.count = 0

    document.undo()

    expect(calls.count).toBe(0)
    expect(document.bodies().map((body) => body.id)).not.toContain('first')
  })

  it('bounds the history it keeps: past `restorableSteps`, Undo re-folds — and is still right', () => {
    const { document, calls } = seededFake(3, { restorableSteps: 2 })
    for (const id of ['a', 'b', 'c', 'd']) document.append(box(id), { origin: 'local' })
    calls.count = 0

    document.undo() // d — kept
    document.undo() // c — kept
    expect(calls.count).toBe(0)
    document.undo() // b — aged out
    expect(calls.count).toBeGreaterThan(0)
    document.undo() // a — aged out too: re-folds
    expect(document.bodies().map((body) => body.id)).toEqual(['seed-0', 'seed-1', 'seed-2'])
  })

  it('`restorableSteps: 0` is the old, always-fold path', () => {
    const { document, calls } = seededFake(5, { restorableSteps: 0 })
    document.append(box('mine'), { origin: 'local' })
    calls.count = 0
    document.undo()
    expect(calls.count).toBe(5)
  })

  it('Open (loadEntries) clears the stacks, so nothing from before it can be restored', () => {
    const { document } = seededFake(3)
    document.append(box('mine'), { origin: 'local' })
    document.loadEntries([{ record: box('other'), origin: 'local' }])
    expect(document.canUndo()).toBe(false)
    expect(document.undo()).toBeUndefined()
    expect(document.bodies().map((body) => body.id)).toEqual(['other'])
  })
})

// ---------------------------------------------------------------------------
// 2. It is identical to the fold it replaces — real kernel, differential
// ---------------------------------------------------------------------------

// `canonical` and `observe` live in `./__fixtures__/documentObservation.js` (TODO/core-032
// reuses them for the announced Open's differential).

/**
 * A third opinion that shares no history with either twin: fold the same entries
 * from nothing.
 *
 * @param {any} document
 */
function freshFoldOf(document) {
  // No fold cache (TODO/core-031): every record really is built again, from nothing.
  const reference = createDocument({ registry: realRegistry, foldCache: null })
  reference.loadEntries(document.entries, document.rollbackAt())
  return reference
}

/**
 * Run `script` on a restoring document and an always-fold twin, comparing after
 * every step. An action that throws must throw on both, with the same message.
 *
 * @param {Array<(document: any) => unknown>} script
 */
function differential(script) {
  const restoring = createDocument()
  // The old path on both counts: no restore (core-030) and no fold cache (core-031).
  const folding = createDocument({ restorableSteps: 0, foldCache: null })
  script.forEach((act, index) => {
    /** @type {unknown} */
    let restoringError
    /** @type {unknown} */
    let foldingError
    try {
      act(restoring)
    } catch (error) {
      restoringError = error
    }
    try {
      act(folding)
    } catch (error) {
      foldingError = error
    }
    const where = `after action ${index + 1}: ${act.toString().slice(0, 80)}`
    expect(String(restoringError), where).toBe(String(foldingError))
    expect(observe(restoring, { history: true }), where).toEqual(observe(folding, { history: true }))
    expect(observe(restoring), where).toEqual(observe(freshFoldOf(restoring)))
  })
  return restoring
}

const local = { origin: 'local' }
const cube = { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [0, 0, 10] } }
const sphere = { id: 'sphere-1', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 16, center: [40, 0, 8] } }
const cone = { id: 'cone-1', op: 'primitive.cone', name: 'Cone 1', params: { diameter: 10, height: 12, center: [-40, 0, 6] } }
/** @param {number} radius */
const chamfer = (radius) => ({ id: 'cube-1-chamfer', op: 'modify.chamferRim', target: 'cube-1', supersedes: 'cube-1', params: { radius } })

describe('identical to the synchronous fold, action by action (real kernel)', () => {
  it('placements, a move, a boolean — undone and redone in runs', () => {
    differential([
      (d) => d.append(cube, local),
      (d) => d.append({ id: 'cube-1-mv', op: 'transform.translate', target: 'cube-1', supersedes: 'cube-1', params: { vector: [5, 0, 0] } }, local),
      (d) => d.append(sphere, local),
      (d) => d.append({ id: 'sub-1', op: 'boolean.subtract', name: 'Subtract 1', target: 'cube-1-mv', operands: ['sphere-1'], consumes: ['cube-1-mv', 'sphere-1'] }, local),
      (d) => d.undo(),
      (d) => d.undo(),
      (d) => d.undo(),
      (d) => d.redo(),
      (d) => d.redo(),
      (d) => d.redo(),
      (d) => d.undo(),
      (d) => d.undo(),
      (d) => d.append(cone, local), // clears redo
      (d) => d.redo(), // nothing to redo, on both
      (d) => d.undo(),
      (d) => d.redo(),
    ])
  })

  it('scenario 12\'s row actions — edit, suppress, move, roll back, insert, roll forward — and their Undo/Redo', () => {
    differential([
      (d) => d.append(cube, local),
      (d) => d.append(chamfer(5), local),
      (d) => d.append(sphere, local),
      (d) => d.replaceRecord('cube-1-chamfer', chamfer(3), local),
      (d) => d.undo(),
      (d) => d.redo(),
      (d) => d.setSuppressed('cube-1-chamfer', true, local),
      (d) => d.undo(),
      (d) => d.redo(),
      (d) => d.setSuppressed('cube-1-chamfer', false, local),
      (d) => d.rollBackTo('cube-1-chamfer', local),
      (d) => d.append(cone, local), // inserted at the marker
      (d) => d.undo(),
      (d) => d.redo(),
      (d) => d.rollForward(local),
      (d) => d.undo(),
      (d) => d.redo(),
      (d) => d.moveStep('sphere-1', -1, local),
      (d) => d.undo(),
      (d) => d.redo(),
      (d) => d.undo(),
      (d) => d.undo(),
      (d) => d.undo(),
      (d) => d.undo(),
    ])
  })

  it('a refused mid-history edit leaves both unchanged, and Undo after it is still exact', () => {
    differential([
      (d) => d.append(cube, local),
      (d) => d.append(chamfer(5), local),
      (d) => d.append({ id: 'cube-1-fillet', op: 'modify.filletRim', target: 'cube-1-chamfer', supersedes: 'cube-1-chamfer', params: { face: 'top', radius: 4 } }, local),
      (d) => {
        // Scenario 12 step 12: the chamfer eats the top face, the fillet no longer fits.
        try {
          d.replaceRecord('cube-1-chamfer', chamfer(18), local)
        } catch (error) {
          expect(error).toBeInstanceOf(ReplayRejection)
          throw error
        }
      },
      (d) => d.undo(),
      (d) => d.undo(),
      (d) => d.redo(),
    ])
  })

  it('a remote record interleaved between local steps: fold path, then restore path, same answers', () => {
    differential([
      (d) => d.append(cube, local),
      (d) => d.append(sphere, { origin: 'remote' }),
      (d) => d.append(cone, local),
      (d) => d.undo(), // cone — restorable (nothing written since)
      (d) => d.undo(), // cube — the remote sphere was written since: fold
      (d) => d.redo(),
      (d) => d.redo(),
    ])
  })

  it('a refused Undo (someone else depends on the step) changes nothing on either', () => {
    differential([
      (d) => d.append(cube, local),
      (d) => d.append({ id: 'their-move', op: 'transform.translate', target: 'cube-1', supersedes: 'cube-1', params: { vector: [0, 9, 0] } }, { origin: 'mcp' }),
      (d) => d.undo(),
      (d) => d.append(sphere, local),
      (d) => d.undo(),
    ])
  })

  it('(core-031) row actions over dependency chains, composites and sub-part operands', () => {
    const plate = { id: 'plate', op: 'primitive.cuboid', name: 'Plate', params: { size: [80, 30, 6], center: [0, 0, 3] } }
    const hole = (/** @type {number} */ index, /** @type {number} */ diameter) => ({ id: `hole-${index}`, op: 'primitive.cylinder', name: `Hole ${index}`, params: { diameter, height: 20, center: [-30 + index * 15, 0, 3] } })
    const cut = (/** @type {number} */ index, /** @type {string} */ from) => ({ id: `cut-${index}`, op: 'boolean.subtract', name: 'Plate', target: from, operands: [`hole-${index}`], consumes: [from, `hole-${index}`] })
    const bolt = { id: 'bolt', op: 'hardware.bolt', name: 'Bolt', params: { spec: 'm10 hex', length: 30 } }
    const block = { id: 'block', op: 'primitive.cuboid', name: 'Block', params: { size: [30, 30, 30], center: [0, 60, 15] } }
    const tapped = { id: 'tapped', op: 'boolean.subtract', name: 'Block', target: 'block', operands: [{ id: 'bolt', pieces: 'tap' }], consumes: ['block'] }
    differential([
      (d) => d.append(plate, local),
      (d) => d.append(hole(1, 5), local),
      (d) => d.append(cut(1, 'plate'), local),
      (d) => d.append(hole(2, 6), local),
      (d) => d.append(cut(2, 'cut-1'), local),
      (d) => d.append(bolt, local),
      (d) => d.append(block, local),
      (d) => d.append(tapped, local),
      // Edit the chain's root: every later cut rebuilds, the bolt and block do not.
      (d) => d.replaceRecord('plate', { ...plate, params: { ...plate.params, size: [90, 30, 6] } }, local),
      // Edit a hole in the middle of the chain.
      (d) => d.replaceRecord('hole-1', hole(1, 7), local),
      // Edit the composite: the sub-part operand (`tap`) changes, so the subtract rebuilds.
      (d) => d.replaceRecord('bolt', { ...bolt, params: { spec: 'm12 hex', length: 30 } }, local),
      (d) => d.setSuppressed('tapped', true, local),
      (d) => d.setSuppressed('tapped', false, local),
      (d) => d.moveStep('bolt', -1, local),
      (d) => d.rollBackTo('cut-1', local),
      (d) => d.append(cone, local),
      (d) => d.rollForward(local),
      (d) => d.append(sphere, { origin: 'mcp' }),
      (d) => d.undo(), // behind an MCP write: the fold path, on a warm cache
      (d) => d.undo(),
      (d) => d.redo(),
      (d) => d.loadEntries(d.entries.slice(0, 6)), // Open, on a warm cache
      (d) => d.replaceRecord('hole-2', hole(2, 4), local),
    ])
  })

  it('(core-031) a refusal on a warm cache is identical to the uncached one, and leaves both unchanged', () => {
    differential([
      (d) => d.append(cube, local),
      (d) => d.append(chamfer(5), local),
      (d) => d.append({ id: 'cube-1-fillet', op: 'modify.filletRim', target: 'cube-1-chamfer', supersedes: 'cube-1-chamfer', params: { face: 'top', radius: 4 } }, local),
      (d) => d.append(sphere, local),
      (d) => d.replaceRecord('cube-1-chamfer', chamfer(18), local), // refused: the fillet no longer fits
      (d) => d.replaceRecord('cube-1-chamfer', chamfer(18), local), // and again: never cached
      (d) => d.setSuppressed('cube-1-chamfer', true, local), // fine: the fillet lands on the cube
      (d) => d.setSuppressed('cube-1', true, local), // refused: needs Cube 1
      (d) => d.undo(),
    ])
  })

  it('restores the very geometry objects the step replaced, so nothing downstream re-measures them', () => {
    const document = createDocument()
    document.append(cube, local)
    const before = document.bodies()[0].geometry
    document.append({ id: 'cube-1-mv', op: 'transform.translate', target: 'cube-1', supersedes: 'cube-1', params: { vector: [5, 0, 0] } }, local)
    document.undo()
    expect(document.bodies()[0].geometry).toBe(before)
  })
})
