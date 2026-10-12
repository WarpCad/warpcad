// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The document carries merge state (`TODO/data-010`, `docs/decisions/document-sync.md`).
 *
 * `document.js` becomes a replica: every mutation it already performs also records what
 * `data-009`'s merge core needs (position keys, last-writer-wins stamps, tombstones,
 * registers), and `mergeFrom(state)` merges another replica's state in and re-folds.
 *
 * What this file pins down:
 *
 * 1. **Legacy derivation** is deterministic: two builds upgrading one file agree.
 * 2. **Every mutator stamps**, one tick per transaction (a batch shares one stamp).
 * 3. **Removal is a tombstone**; Redo brings a row back with a stamp that beats it.
 * 4. **The named conflicts** (real kernel), merged in both orders: identical timeline and
 *    serialised state, and the flagged row and its reason text.
 * 5. **A merged document equals a fresh load of its own file.**
 * 6. **Local Undo after a merge** drops a step the other side removed or revised.
 * 7. **Atomicity**: a merge that throws mid-fold changes nothing.
 * 8. **Model-based property suite**: random command-layer scripts on three replicas,
 *    merged in every order. Seeded; a failure names its seed.
 */
import { describe, expect, it } from 'vitest'

import { UnrelatedProjectError, createDocument, undoAfterMergeNote } from './document.js'
import { canonicalJSON, highestCounter } from './merge/state.js'
import { compareStamps } from './replica.js'
import { parseProject, serializeProject } from './project.js'
import { defineVariable } from './variables.js'

const MERGE = { origin: 'merge' }
const local = { origin: 'local' }
const ai = { origin: 'ai' }

// ---------------------------------------------------------------------------
// Fixtures (real kernel)
// ---------------------------------------------------------------------------

const cube1 = { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [0, 0, 10] } }
const boxA = { id: 'box-a', op: 'primitive.cuboid', name: 'Box A', params: { size: [10, 10, 10], center: [40, 0, 5] } }
const boxB = { id: 'box-b', op: 'primitive.cuboid', name: 'Box B', params: { size: [10, 10, 10], center: [45, 0, 5] } }
const BASE = [cube1, boxA, boxB]

/** @param {any[]} records */
const clone = (records) => records.map((record) => structuredClone(record))

/**
 * Two replicas of one seed file: the human (`hhhhhh`) and the other writer (`oooooo`).
 *
 * @param {any[]} [base]
 */
function pair(base = BASE) {
  return {
    human: createDocument({ replica: 'hhhhhh', actions: clone(base) }),
    other: createDocument({ replica: 'oooooo', actions: clone(base) }),
  }
}

/**
 * Everything a reader sees, plus both serialised forms.
 *
 * @param {any} document
 */
function view(document) {
  return {
    timeline: document.timeline().map((/** @type {any} */ row) => ({
      step: row.step,
      id: row.id,
      record: row.record,
      origin: row.origin,
      label: row.label,
      suppressed: row.suppressed,
      active: row.active,
      broken: row.broken,
    })),
    bodies: document.bodies().map((/** @type {any} */ body) => body.id),
    rollbackAt: document.rollbackAt(),
    file: serializeProject(document),
    state: canonicalJSON(document.mergeState()),
  }
}

/**
 * Run the two edits on fresh pairs and merge in both directions: human ← other, and
 * other ← human. Both results must be identical; returns the first, and its conflicts.
 *
 * @param {(document: any) => void} humanEdit
 * @param {(document: any) => void} otherEdit
 * @param {any[]} [base]
 */
function mergeBothWays(humanEdit, otherEdit, base = BASE) {
  const first = pair(base)
  humanEdit(first.human)
  otherEdit(first.other)
  const outcome = first.human.mergeFrom(first.other.mergeState(), MERGE)

  const second = pair(base)
  humanEdit(second.human)
  otherEdit(second.other)
  const reverse = second.other.mergeFrom(second.human.mergeState(), MERGE)

  expect(view(first.human)).toEqual(view(second.other))
  expect(outcome.conflicts).toEqual(reverse.conflicts)
  return { document: first.human, outcome }
}

/** @param {any} document @param {string} id */
const rowOf = (document, id) => document.timeline().find((/** @type {any} */ row) => row.id === id)

// ---------------------------------------------------------------------------
// 1. Legacy derivation
// ---------------------------------------------------------------------------

describe('a document never touched by this build derives its merge state from the file', () => {
  it('two builds upgrading the same legacy file derive identical metadata', () => {
    const entries = [
      { record: cube1, origin: 'local' },
      { record: boxA, origin: 'mcp', suppressed: true },
      { record: boxB, origin: 'local' },
    ]
    const one = createDocument({ replica: 'aaaaaa' })
    const two = createDocument({ replica: 'zzzzzz' })
    one.loadEntries(clone(entries.map((entry) => entry.record)).map((record, index) => ({ ...entries[index], record })), 2, 'normal', {
      standingInstructions: 'Keep walls 2 mm',
    })
    two.loadEntries(clone(entries.map((entry) => entry.record)).map((record, index) => ({ ...entries[index], record })), 2, 'normal', {
      standingInstructions: 'Keep walls 2 mm',
    })
    expect(canonicalJSON(one.mergeState())).toBe(canonicalJSON(two.mergeState()))
  })

  it('every derived stamp is zero, and the position keys follow row order', () => {
    const document = createDocument({ replica: 'aaaaaa', actions: clone(BASE) })
    const state = document.mergeState()
    expect(highestCounter(state)).toBe(0)
    expect([...state.entries.keys()]).toEqual(['cube-1', 'box-a', 'box-b'])
    const keys = [...state.entries.values()].map((entry) => entry.pos[0])
    expect([...keys].sort()).toEqual(keys)
    expect(state.dead.size).toBe(0)
  })

  it('a seeded document and the same file loaded are the same replica state', () => {
    const seeded = createDocument({ replica: 'aaaaaa', actions: clone(BASE) })
    const loaded = createDocument({ replica: 'bbbbbb' })
    loaded.loadEntries(clone(BASE).map((record) => ({ record, origin: 'local' })))
    expect(canonicalJSON(seeded.mergeState())).toBe(canonicalJSON(loaded.mergeState()))
  })
})

// ---------------------------------------------------------------------------
// 2. Every mutator stamps
// ---------------------------------------------------------------------------

describe('every mutator stamps the register it writes (the module note\'s table)', () => {
  /**
   * @param {(document: any) => void} act
   * @param {(change: ReturnType<typeof stateChange>) => void} check
   */
  function stamps(act, check) {
    const document = createDocument({ replica: 'hhhhhh', actions: clone(BASE) })
    const before = document.mergeState()
    act(document)
    check(stateChange(before, document.mergeState()))
  }

  /** @param {any} before @param {any} after */
  function stateChange(before, after) {
    const changed = (/** @type {string} */ id) => {
      const a = before.entries.get(id)
      const b = after.entries.get(id)
      return {
        born: a && b ? compareStamps(a.born, b.born) !== 0 : true,
        rec: a && b ? compareStamps(a.rec, b.rec) !== 0 : true,
        pos: a && b ? a.pos[0] !== b.pos[0] : true,
        suppressed: JSON.stringify(a?.suppressed) !== JSON.stringify(b?.suppressed),
        leftBroken: JSON.stringify(a?.leftBroken) !== JSON.stringify(b?.leftBroken),
      }
    }
    return {
      added: [...after.entries.keys()].filter((id) => !before.entries.has(id)),
      dead: [...after.dead.keys()].filter((id) => !before.dead.has(id)),
      changed,
      registers: ['rollbackAfter', 'resolution', 'standingInstructions', 'buildVolume'].filter(
        (name) => JSON.stringify(before.registers[name]) !== JSON.stringify(after.registers[name])
      ),
      parts: [...after.parts.keys()].filter((op) => JSON.stringify(before.parts.get(op)) !== JSON.stringify(after.parts.get(op))),
      highest: highestCounter(after),
    }
  }

  const translate = (/** @type {string} */ id, /** @type {string} */ of) => ({ id, op: 'transform.translate', target: of, supersedes: of, params: { vector: [1, 0, 0] } })

  it('append / appendAll / insertAt: a new row, born and keyed', () => {
    stamps((d) => d.append(translate('mv', 'cube-1'), local), (c) => expect(c.added).toEqual(['mv']))
    stamps(
      (d) => d.appendAll([translate('mv', 'cube-1'), translate('mv2', 'box-a')], local),
      (c) => expect(c.added).toEqual(['mv', 'mv2'])
    )
    stamps((d) => d.insertAt(0, [{ ...boxA, id: 'front', name: 'Front' }], local), (c) => expect(c.added).toEqual(['front']))
  })

  it('replaceRecord: the record stamp', () => {
    stamps(
      (d) => d.replaceRecord('box-a', { ...boxA, params: { ...boxA.params, size: [12, 12, 12] } }, local),
      (c) => expect(c.changed('box-a')).toMatchObject({ rec: true, pos: false, born: false })
    )
  })

  it('reviseRecords: the record stamp and the leftBroken flag', () => {
    stamps(
      (d) => d.reviseRecords([{ id: 'box-a', record: { ...boxA, params: { ...boxA.params, size: [12, 12, 12] } }, leftBroken: true }], local),
      (c) => expect(c.changed('box-a')).toMatchObject({ rec: true, leftBroken: true })
    )
  })

  it('setSuppressed: the suppressed flag', () => {
    stamps((d) => d.setSuppressed('box-a', true, local), (c) => expect(c.changed('box-a')).toMatchObject({ suppressed: true, rec: false }))
  })

  it('moveStep: the moved row\'s position key, and only it', () => {
    stamps((d) => d.moveStep('box-b', -1, local), (c) => {
      expect(c.changed('box-b').pos).toBe(true)
      expect(c.changed('box-a').pos).toBe(false)
    })
  })

  it('removeRecords: a tombstone', () => {
    stamps((d) => d.removeRecords(['box-b'], ai), (c) => expect(c.dead).toEqual(['box-b']))
  })

  it('deleteBodies / setColorOverride: a new row (a body.delete record is a row like any other)', () => {
    stamps((d) => d.deleteBodies(['box-a'], local), (c) => expect(c.added).toHaveLength(1))
    stamps((d) => d.setColorOverride('box-a', { color: 0xff0000 }, local), (c) => expect(c.added).toHaveLength(1))
  })

  it('rollBackTo / rollForward: the rollback register', () => {
    stamps((d) => d.rollBackTo('cube-1', local), (c) => expect(c.registers).toEqual(['rollbackAfter']))
    stamps(
      (d) => {
        d.rollBackTo('cube-1', local)
        d.rollForward(local)
      },
      (c) => expect(c.registers).toEqual(['rollbackAfter'])
    )
  })

  it('setResolution / setStandingInstructions / setBuildVolume: their registers', () => {
    stamps((d) => d.setResolution('fine', local), (c) => expect(c.registers).toEqual(['resolution']))
    stamps((d) => d.setStandingInstructions('Walls 2 mm', local), (c) => expect(c.registers).toEqual(['standingInstructions']))
    stamps((d) => d.setBuildVolume({ widthMm: 100, depthMm: 100, heightMm: 100 }, local), (c) => expect(c.registers).toEqual(['buildVolume']))
  })

  it('a no-op mutation writes nothing and ticks nothing', () => {
    stamps(
      (d) => {
        d.setSuppressed('box-a', false, local)
        d.setStandingInstructions('', local)
        d.rollForward(local)
      },
      (c) => {
        expect(c.highest).toBe(0)
        expect(c.registers).toEqual([])
      }
    )
  })

  it('one clock tick per transaction: a batch shares one stamp', () => {
    const document = createDocument({ replica: 'hhhhhh', actions: clone(BASE) })
    document.batch((d) => {
      d.append(translate('mv', 'cube-1'), local)
      d.append(translate('mv2', 'box-a'), local)
      d.setSuppressed('box-b', true, local)
    })
    const state = document.mergeState()
    const born = /** @type {any} */ (state.entries.get('mv')).born
    expect(/** @type {any} */ (state.entries.get('mv2')).born).toEqual(born)
    expect(/** @type {any} */ (state.entries.get('box-b')).suppressed[1]).toEqual(born)
    expect(highestCounter(state)).toBe(1)
  })

  it('a failed batch leaves the merge state exactly as it was', () => {
    const document = createDocument({ replica: 'hhhhhh', actions: clone(BASE) })
    const before = canonicalJSON(document.mergeState())
    expect(() =>
      document.batch((d) => {
        d.append(translate('mv', 'cube-1'), local)
        throw new Error('no')
      })
    ).toThrow('no')
    expect(canonicalJSON(document.mergeState())).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// 3. Removal is a tombstone
// ---------------------------------------------------------------------------

describe('removal is a tombstone, and Redo beats it', () => {
  it('Undo of an append records the tombstone; Redo brings the row back with a newer born stamp', () => {
    const document = createDocument({ replica: 'hhhhhh', actions: clone(BASE) })
    document.append({ ...boxA, id: 'mine', name: 'Mine' }, local)
    document.undo()
    const tomb = document.mergeState().dead.get('mine')
    expect(tomb).toBeDefined()
    expect(document.mergeState().entries.has('mine')).toBe(false)
    document.redo()
    const state = document.mergeState()
    expect(state.dead.get('mine')).toEqual(tomb)
    expect(compareStamps(/** @type {any} */ (state.entries.get('mine')).born, /** @type {any} */ (tomb))).toBeGreaterThan(0)
  })

  it('the tombstone survives a merge with a copy that still holds the row', () => {
    const { human, other } = pair()
    human.append({ ...boxA, id: 'mine', name: 'Mine' }, local)
    other.mergeFrom(human.mergeState(), MERGE)
    human.undo()
    human.mergeFrom(other.mergeState(), MERGE)
    expect(human.timeline().map((/** @type {any} */ row) => row.id)).not.toContain('mine')
  })

  it('Undo AI turn (removeRecords) records a tombstone too', () => {
    const document = createDocument({ replica: 'hhhhhh', actions: clone(BASE) })
    document.append({ ...boxA, id: 'ai-box', name: 'AI box' }, ai)
    document.removeRecords(['ai-box'], ai)
    expect(document.mergeState().dead.has('ai-box')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4. The named conflicts, merged both ways
// ---------------------------------------------------------------------------

describe('the named conflicts (real kernel), merged in both orders', () => {
  it('human moves Cube 1 while the other side fillets it: the later row is flagged', () => {
    const { document, outcome } = mergeBothWays(
      (d) => d.append({ id: 'move', op: 'transform.translate', target: 'cube-1', supersedes: 'cube-1', params: { vector: [5, 0, 0] } }, local),
      (d) => d.append({ id: 'fillet', op: 'modify.filletRim', target: 'cube-1', supersedes: 'cube-1', params: { face: 'top', radius: 2 } }, ai)
    )
    expect(rowOf(document, 'move').broken).toBeNull()
    expect(rowOf(document, 'fillet').broken).toBe('conflicts with step 4 (Move Cube 1, by you)')
    expect(outcome.conflicts).toEqual([
      { id: 'fillet', step: 5, label: 'Fillet Cube 1', reason: 'conflicts with step 4 (Move Cube 1, by you)', lostTo: 'move' },
    ])
    expect(document.bodies()).toHaveLength(3)
  })

  it('human unions A+B while the other side moves A: the move loses to the union', () => {
    const { document } = mergeBothWays(
      (d) => d.append({ id: 'union', op: 'boolean.union', name: 'Union 1', target: 'box-a', operands: ['box-b'], consumes: ['box-a', 'box-b'] }, local),
      (d) => d.append({ id: 'move-a', op: 'transform.translate', target: 'box-a', supersedes: 'box-a', params: { vector: [0, 5, 0] } }, ai)
    )
    expect(rowOf(document, 'union').broken).toBeNull()
    expect(rowOf(document, 'move-a').broken).toBe('conflicts with step 4 (Union, by you)')
    expect(document.bodies().map((/** @type {any} */ body) => body.id)).toEqual(['cube-1', 'union'])
  })

  it('both define a variable called `wall`: the second definition cannot be used', () => {
    const { document } = mergeBothWays(
      (d) => defineVariable(d, { name: 'wall', kind: 'number', value: 2, unit: 'mm' }, local),
      (d) => defineVariable(d, { name: 'wall', kind: 'number', value: 3, unit: 'mm' }, ai)
    )
    const rows = document.timeline().filter((/** @type {any} */ row) => row.record.op === 'var.define')
    expect(rows).toHaveLength(2)
    expect(rows[0].broken).toBeNull()
    expect(rows[1].broken).toBe('variable can\'t be used: a variable named "wall" is already defined')
  })

  it('one side deletes a body the other recolours: the recolour loses to the delete', () => {
    const { document, outcome } = mergeBothWays(
      (d) => d.deleteBodies(['box-a'], local),
      (d) => d.setColorOverride('box-a', { color: 0xff0000 }, ai)
    )
    expect(outcome.conflicts).toHaveLength(1)
    expect(outcome.conflicts[0].reason).toBe('conflicts with step 4 (Delete Box A, by you)')
    expect(document.bodies().map((/** @type {any} */ body) => body.id)).toEqual(['cube-1', 'box-b'])
  })

  it('one side suppresses a row the other edits: both changes land, nothing is flagged', () => {
    const edited = { ...boxB, params: { ...boxB.params, size: [14, 14, 14] } }
    const { document, outcome } = mergeBothWays(
      (d) => d.setSuppressed('box-b', true, local),
      (d) => d.replaceRecord('box-b', structuredClone(edited), ai)
    )
    expect(outcome.conflicts).toEqual([])
    expect(rowOf(document, 'box-b')).toMatchObject({ suppressed: true, record: edited, broken: null })
  })

  it('both reorder U,V,W (W needs U): two legal moves combine into an illegal order, and W is flagged', () => {
    const U = { id: 'u', op: 'primitive.cuboid', name: 'U', params: { size: [5, 5, 5], center: [0, 0, 2.5] } }
    const V = { id: 'v', op: 'primitive.cuboid', name: 'V', params: { size: [5, 5, 5], center: [20, 0, 2.5] } }
    const W = { id: 'w', op: 'transform.translate', target: 'u', supersedes: 'u', params: { vector: [0, 0, 5] } }
    const { document, outcome } = mergeBothWays(
      (d) => d.moveStep('u', 1, local),
      (d) => d.moveStep('w', -1, ai),
      [U, V, W]
    )
    expect(document.timeline().map((/** @type {any} */ row) => row.id)).toEqual(['w', 'v', 'u'])
    expect(rowOf(document, 'w').broken).toBe('needs U')
    expect(outcome.conflicts).toEqual([{ id: 'w', step: 1, label: 'Move U', reason: 'needs U', lostTo: null }])
  })

  it('both move the marker: the later stamp wins', () => {
    const { document } = mergeBothWays(
      (d) => d.rollBackTo('cube-1', local),
      (d) => d.rollBackTo('box-a', ai)
    )
    expect(document.rollbackAt()).toBe(2)
  })

  it('refuses a copy of a different project by name, and changes nothing', () => {
    const human = createDocument({ replica: 'hhhhhh', actions: clone(BASE) })
    const stranger = createDocument({ replica: 'oooooo', actions: [{ ...cube1, params: { ...cube1.params, size: [1, 1, 1] } }] })
    const before = view(human)
    expect(() => human.mergeFrom(stranger.mergeState(), MERGE)).toThrow(UnrelatedProjectError)
    expect(view(human)).toEqual(before)
  })

  it('never pushes onto either local stack, and bumps the version', () => {
    const { human, other } = pair()
    human.append({ ...boxA, id: 'mine', name: 'Mine' }, local)
    other.append({ ...boxA, id: 'theirs', name: 'Theirs', params: { ...boxA.params, center: [80, 0, 5] } }, ai)
    const version = human.version
    const undoLabel = human.pendingUndo()?.label
    human.mergeFrom(other.mergeState(), MERGE)
    expect(human.version).toBeGreaterThan(version)
    expect(human.pendingUndo()?.label).toBe(undoLabel)
    expect(human.canRedo()).toBe(false)
    expect(human.bodies().map((/** @type {any} */ body) => body.id)).toEqual(['cube-1', 'box-a', 'box-b', 'mine', 'theirs'])
  })

  it('returns the change as a diff of before and after', () => {
    const { human, other } = pair()
    other.append({ ...boxA, id: 'theirs', name: 'Theirs', params: { ...boxA.params, center: [80, 0, 5] } }, ai)
    other.setSuppressed('box-a', true, ai)
    const { change } = human.mergeFrom(other.mergeState(), MERGE)
    expect(change.added).toEqual(['theirs'])
    expect(change.revised).toEqual(['box-a'])
  })
})

// ---------------------------------------------------------------------------
// 5. A merged document equals a fresh load of its own file
// ---------------------------------------------------------------------------

describe('a merged document is the document its own file loads to', () => {
  it('with a flagged row, the conflict reason survives the reload', () => {
    const { document } = mergeBothWays(
      (d) => d.append({ id: 'move', op: 'transform.translate', target: 'cube-1', supersedes: 'cube-1', params: { vector: [5, 0, 0] } }, local),
      (d) => d.append({ id: 'fillet', op: 'modify.filletRim', target: 'cube-1', supersedes: 'cube-1', params: { face: 'top', radius: 2 } }, ai)
    )
    const parsed = parseProject(serializeProject(document))
    const fresh = createDocument({ foldCache: null })
    fresh.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, parsed)
    const { state: _merged, ...mergedView } = view(document)
    const { state: _fresh, ...freshView } = view(fresh)
    expect(freshView).toEqual(mergedView)
  })
})

// ---------------------------------------------------------------------------
// 6. Local Undo after a merge
// ---------------------------------------------------------------------------

describe('local Undo after a merge', () => {
  const mine = { ...boxA, id: 'mine', name: 'Mine', params: { ...boxA.params, center: [80, 0, 5] } }

  it('drops a step whose row the other side removed, with a note, instead of resurrecting it', () => {
    const { human, other } = pair()
    human.append(structuredClone(mine), local)
    other.mergeFrom(human.mergeState(), MERGE)
    other.removeRecords(['mine'], ai)
    human.mergeFrom(other.mergeState(), MERGE)
    expect(human.canUndo()).toBe(true)

    const result = human.undo()

    expect(result?.note).toBe(undoAfterMergeNote('Place Mine', 'removed'))
    expect(result?.note).toBe('"Place Mine" can\'t be undone — a merged change removed it. It has been taken off the Undo list.')
    expect(human.canUndo()).toBe(false)
    expect(human.canRedo()).toBe(false)
    expect(human.timeline().map((/** @type {any} */ row) => row.id)).not.toContain('mine')
  })

  it('drops a step whose row the other side revised, leaving their revision in place', () => {
    const { human, other } = pair()
    human.append(structuredClone(mine), local)
    other.mergeFrom(human.mergeState(), MERGE)
    const theirs = { ...mine, params: { ...mine.params, size: [3, 3, 3] } }
    other.replaceRecord('mine', structuredClone(theirs), ai)
    human.mergeFrom(other.mergeState(), MERGE)

    const result = human.undo()

    expect(result?.note).toBe(undoAfterMergeNote('Place Mine', 'revised'))
    expect(rowOf(human, 'mine').record).toEqual(theirs)
    expect(human.canUndo()).toBe(false)
  })

  it('a step the merge did not touch still undoes, and its Redo lands by position key, not index', () => {
    const { human, other } = pair()
    human.append(structuredClone(mine), local)
    human.undo()
    other.insertAt(0, [{ ...boxA, id: 'front', name: 'Front', params: { ...boxA.params, center: [-40, 0, 5] } }], ai)
    human.mergeFrom(other.mergeState(), MERGE)
    human.redo()
    expect(human.timeline().map((/** @type {any} */ row) => row.id)).toEqual(['front', 'cube-1', 'box-a', 'box-b', 'mine'])
    human.undo()
    expect(human.timeline().map((/** @type {any} */ row) => row.id)).toEqual(['front', 'cube-1', 'box-a', 'box-b'])
  })

  it('still refuses by name when a row the merge brought in depends on the step', () => {
    const { human, other } = pair()
    human.append(structuredClone(mine), local)
    other.mergeFrom(human.mergeState(), MERGE)
    other.append({ id: 'their-move', op: 'transform.translate', target: 'mine', supersedes: 'mine', params: { vector: [0, 3, 0] } }, ai)
    human.mergeFrom(other.mergeState(), MERGE)
    expect(() => human.undo()).toThrow(/depends on "Place Mine"/)
    expect(human.canUndo()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 7. Atomicity
// ---------------------------------------------------------------------------

describe('a merge that throws mid-fold changes nothing', () => {
  it('leaves entries, the marker, both stacks and the restore path untouched', () => {
    const { registry, calls } = countingRegistry()
    const base = [fakeBox('s1'), fakeBox('s2'), fakeBox('s3')]
    const human = createDocument({ registry, replica: 'hhhhhh', actions: clone(base) })
    const other = createDocument({ registry, replica: 'oooooo', actions: clone(base) })
    human.rollBackTo('s2', local)
    human.append(fakeBox('mine'), local)
    let armed = false
    const trap = fakeBox('trap')
    Object.defineProperty(trap, 'when', {
      enumerable: false,
      get() {
        if (armed) throw new Error('boom mid-fold')
        return undefined
      },
    })
    other.append(trap, ai)

    const entries = human.entries.slice()
    const marker = human.rollbackAt()
    const undoLabel = human.pendingUndo()?.label
    const state = canonicalJSON(human.mergeState())
    const version = human.version
    armed = true
    expect(() => human.mergeFrom(other.mergeState(), MERGE)).toThrow('boom mid-fold')
    armed = false

    expect(human.entries).toEqual(entries)
    human.entries.forEach((/** @type {any} */ entry, /** @type {number} */ index) => expect(entry).toBe(entries[index]))
    expect(human.rollbackAt()).toBe(marker)
    expect(human.pendingUndo()?.label).toBe(undoLabel)
    expect(human.canRedo()).toBe(false)
    expect(canonicalJSON(human.mergeState())).toBe(state)
    expect(human.version).toBe(version)

    // The state token is untouched: the most recent Undo is still a restore, not a fold.
    calls.count = 0
    human.undo()
    expect(calls.count).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 8. Model-based property suite
// ---------------------------------------------------------------------------

/** A fake registry whose builds are counted; `fake.fits` fails when the radius is too big. */
function countingRegistry() {
  const calls = { count: 0 }
  /** @param {(input: any) => any} make */
  const counted = (make) => (/** @type {any} */ input) => {
    calls.count += 1
    return make(input)
  }
  /** @type {any} */
  const registry = Object.freeze({
    'fake.box': Object.freeze({ kind: 'native', operandCount: 0, build: counted(({ params }) => ({ tag: 'box', size: params.size ?? 1 })) }),
    'fake.move': Object.freeze({ kind: 'native', operandCount: 1, build: counted(({ params, inputs }) => ({ ...inputs[0], by: (inputs[0].by ?? 0) + (params.by ?? 0) })) }),
    'fake.merge': Object.freeze({ kind: 'native', operandCount: '2+', build: counted(({ inputs }) => ({ tag: 'merged', size: inputs.reduce((/** @type {number} */ sum, /** @type {any} */ input) => sum + (input.size ?? 1), 0) })) }),
    'fake.fits': Object.freeze({
      kind: 'native',
      operandCount: 1,
      build: counted(({ params, inputs }) => {
        if (params.radius > (inputs[0].size ?? 1)) throw new Error(`radius ${params.radius} doesn't fit`)
        return { ...inputs[0], fitted: params.radius }
      }),
    }),
  })
  return { registry, calls }
}

/** @param {string} id @param {number} [size] */
const fakeBox = (id, size = 3) => ({ id, op: 'fake.box', name: id, params: { size } })

/** mulberry32. */
function prng(/** @type {number} */ seed) {
  let t = seed >>> 0
  const next = () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
  return {
    int: (/** @type {number} */ n) => Math.floor(next() * n),
    /** @template T @param {T[]} list @returns {T} */
    pick: (list) => list[Math.floor(next() * list.length)],
  }
}

const REPLICAS = /** @type {const} */ ([
  ['alicea', 'local'],
  ['bobbbb', 'local'],
  ['carolc', 'ai'],
])

/**
 * Three replicas of one seed, each edited by its own random command-layer script. Rebuilt
 * from scratch for every merge order, so every order starts from identical replicas.
 *
 * @param {number} seed
 */
function replicasFor(seed) {
  const { registry } = countingRegistry()
  const base = [fakeBox('base-1', 3), fakeBox('base-2', 4), fakeBox('base-3', 5)]
  return REPLICAS.map(([replica, origin], which) => {
    const document = createDocument({ registry, replica, actions: clone(base) })
    const random = prng(seed * 7 + which * 104729 + 1)
    const transaction = { origin }
    const steps = 4 + random.int(6)
    for (let step = 0; step < steps; step += 1) {
      try {
        randomAction(document, random, transaction)
      } catch {
        // A refused action is part of the script: it must leave the document unchanged.
      }
    }
    return document
  })
}

/**
 * @param {any} document
 * @param {ReturnType<typeof prng>} random
 * @param {{ origin: string }} transaction
 */
function randomAction(document, random, transaction) {
  const bodies = document.bodies()
  const rows = document.timeline()
  const body = () => random.pick(bodies)
  switch (random.int(12)) {
    case 0:
      return document.append(fakeBox(document.nextId('box'), 1 + random.int(5)), transaction)
    case 1: {
      const target = body().recordId
      return document.append({ id: document.nextId('mv'), op: 'fake.move', target, supersedes: target, params: { by: 1 + random.int(3) } }, transaction)
    }
    case 2: {
      const target = body().recordId
      return document.append({ id: document.nextId('fit'), op: 'fake.fits', target, supersedes: target, params: { radius: 1 + random.int(4) } }, transaction)
    }
    case 3: {
      if (bodies.length < 2) return undefined
      const a = body().recordId
      const b = body().recordId
      if (a === b) return undefined
      return document.append({ id: document.nextId('join'), op: 'fake.merge', name: 'Join', target: a, operands: [b], consumes: [a, b] }, transaction)
    }
    case 4: {
      const row = random.pick(rows.filter((/** @type {any} */ r) => r.record.op === 'fake.box'))
      return row && document.replaceRecord(row.id, { ...row.record, params: { size: 1 + random.int(5) } }, transaction)
    }
    case 5: {
      const row = random.pick(rows)
      return document.setSuppressed(row.id, !row.suppressed, transaction)
    }
    case 6:
      return document.moveStep(random.pick(rows).id, random.int(2) === 0 ? -1 : 1, transaction)
    case 7:
      return document.undo()
    case 8:
      return document.redo()
    case 9:
      return document.deleteBodies([body().id], transaction)
    case 10:
      return document.rollBackTo(random.pick(rows).id, transaction)
    default:
      return document.rollForward(transaction)
  }
}

/** @param {any} document */
function observation(document) {
  return {
    timeline: document.timeline().map((/** @type {any} */ row) => [row.id, row.record, row.origin, row.suppressed, row.active, row.broken]),
    bodies: document.bodies().length,
    file: serializeProject(document),
    state: canonicalJSON(document.mergeState()),
  }
}

const ORDERS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
]

/**
 * Every order, both left-folded (`x ← y ← z`) and nested (`x ← (y ← z)`).
 *
 * @param {number} seed
 */
function mergedEveryWay(seed) {
  /** @type {Array<{ how: string, document: any }>} */
  const results = []
  for (const [x, y, z] of ORDERS) {
    const left = replicasFor(seed)
    left[x].mergeFrom(left[y].mergeState(), MERGE)
    left[x].mergeFrom(left[z].mergeState(), MERGE)
    results.push({ how: `${x}←${y}←${z}`, document: left[x] })

    const nested = replicasFor(seed)
    nested[y].mergeFrom(nested[z].mergeState(), MERGE)
    nested[x].mergeFrom(nested[y].mergeState(), MERGE)
    results.push({ how: `${x}←(${y}←${z})`, document: nested[x] })
  }
  return results
}

describe('model-based property suite: three replicas, every merge order (seeded)', () => {
  const SEEDS = Array.from({ length: 120 }, (unused, index) => index + 1)

  it.each(SEEDS)('seed %i: every order converges, and equals a fresh fold of its own log', (seed) => {
    const results = mergedEveryWay(seed)
    const reference = observation(results[0].document)
    for (const { how, document } of results.slice(1)) {
      expect(observation(document), `seed ${seed}, order ${how} vs ${results[0].how}`).toEqual(reference)
    }
    const merged = results[0].document
    const marker = merged.rollbackAt()
    if (marker === null || (marker >= 1 && marker < merged.entries.length)) {
      const fresh = createDocument({ registry: countingRegistry().registry, foldCache: null })
      fresh.loadEntries(merged.entries, marker, merged.resolution())
      expect(observation(fresh).timeline, `seed ${seed}: a fresh fold of the merged log`).toEqual(reference.timeline)
    }
  })

  it('merging a replica into itself, or merging twice, changes nothing', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const [a, b] = replicasFor(seed)
      a.mergeFrom(b.mergeState(), MERGE)
      const once = observation(a)
      a.mergeFrom(b.mergeState(), MERGE)
      a.mergeFrom(a.mergeState(), MERGE)
      expect(observation(a), `seed ${seed}`).toEqual(once)
    }
  })

  it('three copies where a later edit repairs an earlier conflict still converge (path independence of flags)', () => {
    const base = [fakeBox('plate', 3)]
    const { registry } = countingRegistry()
    const build = () => {
      const a = createDocument({ registry, replica: 'alicea', actions: clone(base) })
      const b = createDocument({ registry, replica: 'bobbbb', actions: clone(base) })
      const c = createDocument({ registry, replica: 'carolc', actions: clone(base) })
      a.append({ id: 'fit', op: 'fake.fits', target: 'plate', supersedes: 'plate', params: { radius: 3 } }, local)
      b.replaceRecord('plate', fakeBox('plate', 1), local) // shrinks: A's fit no longer fits
      // C enlarges after B (a later stamp), which repairs A's fit again.
      c.append(fakeBox('spacer'), local)
      c.replaceRecord('plate', fakeBox('plate', 6), local)
      return [a, b, c]
    }
    const one = build()
    one[0].mergeFrom(one[1].mergeState(), MERGE) // flags `fit` …
    one[0].mergeFrom(one[2].mergeState(), MERGE) // … which then fits again
    const two = build()
    two[1].mergeFrom(two[2].mergeState(), MERGE)
    two[0].mergeFrom(two[1].mergeState(), MERGE)
    expect(observation(one[0])).toEqual(observation(two[0]))
    expect(rowOf(one[0], 'fit').broken).toBeNull()
  })
})
