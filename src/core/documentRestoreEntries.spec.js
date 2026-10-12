// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `document.restoreEntries` (`TODO/ui-062`) — the one stamped fold **Undo merge** writes.
 *
 * Pinned here: it is never a local step; it refuses by name, changing nothing, when a row that
 * stays references one that goes; and because it is stamped from its diff like every other
 * mutator, the copy that took a merge back out still **converges** with the other copy — merging
 * that copy in again does not resurrect the rows Undo merge removed.
 */
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { serializeProject } from './project.js'

const MERGE = { origin: 'merge' }
const ai = { origin: 'ai' }

const cube1 = { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [0, 0, 10] } }
const boxA = { id: 'box-a', op: 'primitive.cuboid', name: 'Box A', params: { size: [10, 10, 10], center: [40, 0, 5] } }
const theirs = { id: 'theirs', op: 'primitive.cuboid', name: 'Theirs', params: { size: [5, 5, 5], center: [-40, 0, 2.5] } }

/** @param {any[]} records */
const clone = (records) => records.map((record) => structuredClone(record))

function pair() {
  return {
    human: createDocument({ replica: 'hhhhhh', actions: clone([cube1, boxA]) }),
    other: createDocument({ replica: 'oooooo', actions: clone([cube1, boxA]) }),
  }
}

describe('document.restoreEntries (TODO/ui-062)', () => {
  it('puts the log back in one fold and leaves both undo stacks alone', () => {
    const { human, other } = pair()
    human.append({ ...structuredClone(boxA), id: 'mine', name: 'Mine', params: { ...boxA.params, center: [80, 0, 5] } }, { origin: 'local' })
    const pending = human.pendingUndo()
    const before = human.entries.slice()
    other.append(structuredClone(theirs), ai)
    human.mergeFrom(other.mergeState(), MERGE)
    expect(human.entries.map((entry) => entry.record.id)).toContain('theirs')

    human.restoreEntries(before, null, MERGE)

    expect(human.entries.map((entry) => entry.record.id)).toEqual(['cube-1', 'box-a', 'mine'])
    expect(human.pendingUndo()).toBe(pending)
    expect(human.canRedo()).toBe(false)
  })

  it('converges: merging the other copy in again does not bring the removed row back', () => {
    const { human, other } = pair()
    const before = human.entries.slice()
    other.append(structuredClone(theirs), ai)
    human.mergeFrom(other.mergeState(), MERGE)
    human.restoreEntries(before, null, MERGE)
    const file = serializeProject(human)

    human.mergeFrom(other.mergeState(), MERGE)

    expect(human.entries.map((entry) => entry.record.id)).toEqual(['cube-1', 'box-a'])
    expect(serializeProject(human)).toBe(file)
    // …and the other copy, merging this one, loses the row too: the tombstone is newer.
    other.mergeFrom(human.mergeState(), MERGE)
    expect(other.entries.map((entry) => entry.record.id)).toEqual(['cube-1', 'box-a'])
  })

  it('refuses by name, changing nothing, when a row that stays depends on one that goes', () => {
    const document = createDocument({ actions: clone([cube1, boxA]) })
    document.append({ id: 'lift', op: 'transform.translate', name: 'Lift', target: 'box-a', supersedes: 'box-a', params: { vector: [0, 0, 5] } }, ai)
    const target = document.entries.filter((entry) => entry.record.id !== 'box-a')
    const version = document.version
    const file = serializeProject(document)

    expect(() => document.restoreEntries(target, null, MERGE)).toThrow(
      'document.restoreEntries: "Lift", added via ai, depends on "box-a" — edit or delete it first'
    )
    expect(serializeProject(document)).toBe(file)
    expect(document.version).toBe(version)
  })

  it('is never a local step', () => {
    const document = createDocument({ actions: clone([cube1]) })
    expect(() => document.restoreEntries(document.entries.slice(), null, { origin: 'local' })).toThrow(/never a local step/)
    expect(() => document.restoreEntries(document.entries.slice(), null, /** @type {any} */ ({}))).toThrow(/origin is required/)
  })
})
