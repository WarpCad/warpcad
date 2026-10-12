// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A re-fold reuses every record whose inputs did not change (`TODO/core-031`).
 *
 * `core-030` made Undo/Redo free by restoring captured state. What still re-folded the
 * whole log through the kernel was the **row action itself** (edit, suppress, move,
 * roll back, roll forward, insert while rolled back), the Undo fallback after a
 * non-local write, Open and the History preview: 74 ms on `data-004`'s 200-record
 * scene and 157 ms on the 24-body scene, per gesture, on the main thread.
 *
 * `core-031` measured the async-fold contract change against keeping the fold
 * synchronous and making it *incremental by construction*: the fold still runs the one
 * `ingest` loop over the whole entry list, but a record's build is looked up in a
 * per-document cache keyed by the record object, its JSON and the exact operand values
 * it resolved to. Geometry is immutable, and a build is a pure function of those three
 * things, so a hit is the value a fresh build would produce. See
 * `docs/decisions/kernel-evaluation-worker.md`, "Slice 3".
 *
 * What this file pins down:
 *
 * 1. **Only what changed is rebuilt.** Counted at the registry boundary (a fake
 *    registry whose `build` counts calls), per row action.
 * 2. **Never stale.** A record mutated in place, a different operand value, or a build
 *    that throws is never served from the cache.
 * 3. **Every refusal is unchanged**: still synchronous, still names the row, still
 *    atomic. (Identity with the uncached fold, action by action on the real kernel, is
 *    `historyRestore.spec.js`'s differential harness, whose twin and fresh fold now
 *    run with `foldCache: null`.)
 */
import { describe, expect, it } from 'vitest'

import { ReplayRejection, createDocument } from './document.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A fake registry whose every `build` is counted, by op. */
function countingRegistry() {
  /** @type {{ count: number, built: string[] }} */
  const calls = { count: 0, built: [] }
  /** @param {string} tag @param {(input: any) => any} make */
  const counted = (tag, make) => (/** @type {any} */ input) => {
    calls.count += 1
    calls.built.push(tag)
    return make(input)
  }
  /** @type {any} */
  const registry = Object.freeze({
    'fake.box': Object.freeze({
      kind: 'native',
      operandCount: 0,
      build: counted('box', ({ params }) => ({ tag: 'box', size: params.size ?? 1 })),
    }),
    'fake.move': Object.freeze({
      kind: 'native',
      operandCount: 1,
      build: counted('move', ({ params, inputs }) => ({ tag: 'moved', by: params.by ?? 0, of: inputs[0] })),
    }),
    'fake.merge': Object.freeze({
      kind: 'native',
      operandCount: '2+',
      build: counted('merge', ({ inputs }) => ({ tag: 'merged', of: inputs })),
    }),
    'fake.fits': Object.freeze({
      kind: 'native',
      operandCount: 1,
      build: counted('fits', ({ params, inputs }) => {
        if (params.radius > inputs[0].size) throw new Error(`radius ${params.radius} doesn't fit`)
        return { tag: 'fitted', radius: params.radius, of: inputs[0] }
      }),
    }),
  })
  return { registry, calls }
}

const local = { origin: 'local' }
/** @param {string} id @param {number} [size] */
const box = (id, size = 1) => ({ id, op: 'fake.box', name: id, params: { size } })
/** @param {string} id @param {string} of @param {number} [by] */
const move = (id, of, by = 1) => ({ id, op: 'fake.move', target: of, supersedes: of, params: { by } })

/**
 * Ten independent boxes (remote-seeded, so none is on the undo stack), then a local
 * box `a` moved once (`a-mv`), then a local box `b`.
 */
function scene() {
  const { registry, calls } = countingRegistry()
  const document = createDocument({ registry })
  document.appendAll(
    Array.from({ length: 10 }, (unused, index) => box(`seed-${index}`)),
    { origin: 'remote' }
  )
  document.append(box('a', 5), local)
  document.append(move('a-mv', 'a', 2), local)
  document.append(box('b'), local)
  calls.count = 0
  calls.built.length = 0
  return { document, calls, registry }
}

// ---------------------------------------------------------------------------
// 1. Only what changed is rebuilt
// ---------------------------------------------------------------------------

describe('a row action rebuilds only the records whose inputs changed (TODO/core-031)', () => {
  it('edit: the edited record and what depends on it — nothing else', () => {
    const { document, calls } = scene()
    document.replaceRecord('a', box('a', 6), local)
    expect(calls.built).toEqual(['box', 'move'])
    expect(document.bodies().find((body) => body.recordId === 'a-mv')?.geometry).toMatchObject({ by: 2, of: { size: 6 } })
  })

  it('edit of an independent row rebuilds that row alone', () => {
    const { document, calls } = scene()
    document.replaceRecord('seed-3', box('seed-3', 4), local)
    expect(calls.built).toEqual(['box'])
  })

  it('suppress and unsuppress an independent row: zero builds', () => {
    const { document, calls } = scene()
    document.setSuppressed('b', true, local)
    expect(calls.count).toBe(0)
    document.setSuppressed('b', false, local)
    expect(calls.count).toBe(0)
    expect(document.bodies().map((body) => body.id)).toContain('b')
  })

  it('suppressing a move rebuilds nothing: its body falls back to the value already built', () => {
    const { document, calls } = scene()
    document.setSuppressed('a-mv', true, local)
    expect(calls.count).toBe(0)
    expect(document.bodies().find((body) => body.recordId === 'a')?.geometry).toEqual({ tag: 'box', size: 5 })
  })

  it('move two independent rows past each other: zero builds', () => {
    const { document, calls } = scene()
    document.moveStep('b', -1, local)
    expect(calls.count).toBe(0)
  })

  it('roll back, insert at the marker, roll forward: only the inserted record builds', () => {
    const { document, calls } = scene()
    document.rollBackTo('seed-9', local)
    expect(calls.count).toBe(0) // including the tail shadow check
    document.append(box('inserted'), local)
    expect(calls.built).toEqual(['box'])
    calls.built.length = 0
    document.rollForward(local)
    expect(calls.built).toEqual([])
  })

  it('the Undo fallback after a non-local write rebuilds nothing it already had', () => {
    const { document, calls } = scene()
    document.append(box('theirs'), { origin: 'mcp' })
    calls.count = 0
    document.undo() // `b` — someone wrote since, so this is the fold path, not a restore
    expect(calls.count).toBe(0)
    expect(document.bodies().map((body) => body.id)).toEqual(expect.arrayContaining(['theirs']))
    expect(document.bodies().map((body) => body.id)).not.toContain('b')
  })

  it('an unchanged body keeps the very same geometry object across a row action', () => {
    const { document } = scene()
    const before = document.bodies().find((body) => body.id === 'seed-0')?.geometry
    document.replaceRecord('a', box('a', 6), local)
    expect(document.bodies().find((body) => body.id === 'seed-0')?.geometry).toBe(before)
  })

  it('a document opened with the same cache (the History preview) builds nothing', () => {
    const { document, calls, registry } = scene()
    const preview = createDocument({ registry, foldCache: document.foldCache })
    preview.loadEntries(document.entries.slice(0, 12), null)
    expect(calls.count).toBe(0)
    expect(preview.bodies().map((body) => body.recordId)).toEqual([...Array.from({ length: 10 }, (unused, index) => `seed-${index}`), 'a-mv'])
  })

  it('(data-010) a merge builds only the records that arrived, and a row action after it only what changed', () => {
    const { document, calls, registry } = scene()
    const other = createDocument({ registry, foldCache: null, replica: 'otherz' })
    other.mergeFrom(document.mergeState(), { origin: 'merge' })
    other.append(box('theirs', 2), { origin: 'ai' })
    other.append(move('theirs-mv', 'theirs', 4), { origin: 'ai' })
    calls.built.length = 0

    document.mergeFrom(other.mergeState(), { origin: 'merge' })
    expect(calls.built).toEqual(['box', 'move'])

    calls.built.length = 0
    document.replaceRecord('a', box('a', 6), local)
    expect(calls.built).toEqual(['box', 'move'])
    expect(document.bodies().map((body) => body.recordId)).toContain('theirs-mv')
  })

  it('`foldCache: null` is the uncached fold: every active record builds again', () => {
    const { registry, calls } = countingRegistry()
    const document = createDocument({ registry, foldCache: null })
    document.appendAll([box('x'), box('y'), box('z')], local)
    calls.count = 0
    document.setSuppressed('z', true, local)
    expect(calls.count).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// 2. Never stale
// ---------------------------------------------------------------------------

describe('the cache never serves a value a fresh build would not produce', () => {
  it('a record object mutated in place is rebuilt, not served stale', () => {
    const { registry, calls } = countingRegistry()
    const document = createDocument({ registry })
    const record = box('m', 1)
    document.append(record, local)
    document.append(box('other'), local)
    record.params.size = 9 // a caller that should not do this, but might
    calls.built.length = 0
    document.setSuppressed('other', true, local)
    expect(calls.built).toEqual(['box'])
    expect(document.bodies().find((body) => body.id === 'm')?.geometry).toEqual({ tag: 'box', size: 9 })
  })

  it('the same record against a different operand value is rebuilt', () => {
    const { document, calls } = scene()
    // `a-mv`'s record object is untouched; only its operand `a` changes.
    document.replaceRecord('a', box('a', 7), local)
    expect(calls.built).toContain('move')
  })

  it('a build that throws is not cached: the refusal repeats, and so does the build', () => {
    const { registry, calls } = countingRegistry()
    const document = createDocument({ registry })
    document.append(box('base', 3), local)
    document.append({ id: 'fit', op: 'fake.fits', target: 'base', supersedes: 'base', params: { radius: 2 } }, local)
    calls.built.length = 0
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(() => document.replaceRecord('base', box('base', 1), local)).toThrow(ReplayRejection)
    }
    expect(calls.built).toEqual(['box', 'fits', 'box', 'fits'])
  })

  it('a composite value built once is reused whole, parts intact', () => {
    // Real registry: a bolt is a recipe, and its group must come back as the same object.
    const document = createDocument()
    document.append({ id: 'bolt', op: 'hardware.bolt', name: 'Bolt', params: { spec: 'm10 hex', length: 30 } }, local)
    document.append({ id: 'cube', op: 'primitive.cuboid', name: 'Cube', params: { size: [5, 5, 5], center: [20, 0, 2.5] } }, local)
    const bolt = document.bodies().find((body) => body.id === 'bolt')?.geometry
    document.replaceRecord('cube', { id: 'cube', op: 'primitive.cuboid', name: 'Cube', params: { size: [6, 6, 6], center: [20, 0, 3] } }, local)
    expect(document.bodies().find((body) => body.id === 'bolt')?.geometry).toBe(bolt)
  })

  it('a named composite is not re-unioned into the scene group either — its combined part is reused', () => {
    // Measured: on the 24-body scene the builds were not the cost once cached; the
    // scene group's `add` was, because it `combine()`s (a real union) every named
    // Group-valued record on every fold. The combined part is a pure function of the
    // group value, so it is kept beside it.
    const document = createDocument()
    document.append({ id: 'bolt', op: 'hardware.bolt', name: 'Bolt', params: { spec: 'm10 hex', length: 30 } }, local)
    document.append({ id: 'cube', op: 'primitive.cuboid', name: 'Cube', params: { size: [5, 5, 5], center: [20, 0, 2.5] } }, local)
    const part = document.scene.group.parts.Bolt
    document.replaceRecord('cube', { id: 'cube', op: 'primitive.cuboid', name: 'Cube', params: { size: [6, 6, 6], center: [20, 0, 3] } }, local)
    expect(document.scene.group.parts.Bolt).toBe(part)
    expect(document.scene.group.names).toEqual(['Bolt', 'Cube'])
  })
})

// ---------------------------------------------------------------------------
// 3. Refusals are unchanged: synchronous, by name, atomic
// ---------------------------------------------------------------------------

describe('every row-action refusal is still synchronous, named and atomic', () => {
  it('edit that breaks a later row: names the row, changes nothing, even with a warm cache', () => {
    const { registry } = countingRegistry()
    const document = createDocument({ registry })
    document.append(box('base', 3), local)
    document.append({ id: 'fit', op: 'fake.fits', target: 'base', supersedes: 'base', params: { radius: 2 } }, local)
    const before = document.bodies().map((body) => body.geometry)
    const version = document.version

    /** @type {any} */
    let refusal
    try {
      document.replaceRecord('base', box('base', 1), local)
    } catch (error) {
      refusal = error
    }
    expect(refusal).toBeInstanceOf(ReplayRejection)
    expect(refusal.step).toMatchObject({ id: 'fit', step: 2 })
    expect(refusal.step.reason).toMatch(/^can't be built: .*doesn't fit/)
    expect(document.bodies().map((body) => body.geometry)).toEqual(before)
    expect(document.bodies()[0].geometry).toBe(before[0])
    expect(document.version).toBe(version)
  })

  it('suppress a row something depends on: `needs <name>`, nothing changes', () => {
    const { document } = scene()
    const version = document.version
    expect(() => document.setSuppressed('a', true, local)).toThrow(/needs a/)
    expect(document.version).toBe(version)
    expect(document.bodies().map((body) => body.recordId)).toContain('a-mv')
  })

  it('Open (loadEntries) is still atomic on a warm cache', () => {
    const { document } = scene()
    const ids = document.bodies().map((body) => body.id)
    expect(() =>
      document.loadEntries([{ record: box('fresh'), origin: 'local' }, { record: move('bad', 'nowhere'), origin: 'local' }])
    ).toThrow(ReplayRejection)
    expect(document.bodies().map((body) => body.id)).toEqual(ids)
  })
})
