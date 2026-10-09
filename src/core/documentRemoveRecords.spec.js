// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'

/**
 * `TODO/ai-006` — `removeRecords`, the inverse of `insertAt` that **Undo AI turn** needs.
 *
 * An `ai`-origin write is not on the local undo stack (decision 5), so taking a landed turn
 * back is its own primitive: remove a set of record ids in one atomic re-fold, leave both undo
 * stacks alone, refuse by name when something outside the set still depends on them.
 */

const cube = (/** @type {string} */ id, x = 0) => ({
  id,
  op: 'primitive.cuboid',
  name: id,
  params: { size: [10, 10, 10], center: [x, 0, 5] },
})

describe('removeRecords', () => {
  it('takes a set of records out in one step and re-derives the scene', () => {
    const document = createDocument()
    document.append(cube('keep'), { origin: 'local' })
    document.insertAt(1, [cube('a', 20), cube('b', 40)], { origin: 'ai' })
    expect(document.bodies()).toHaveLength(3)

    const before = document.version
    document.removeRecords(['a', 'b'], { origin: 'ai' })

    expect(document.entries.map((entry) => entry.record.id)).toEqual(['keep'])
    expect(document.bodies()).toHaveLength(1)
    expect(document.version).toBeGreaterThan(before)
  })

  it('leaves the local undo and redo stacks exactly as they were', () => {
    const document = createDocument()
    document.append(cube('keep'), { origin: 'local' })
    document.insertAt(1, [cube('a', 20)], { origin: 'ai' })
    const pending = document.pendingUndo()

    document.removeRecords(['a'], { origin: 'ai' })

    expect(document.pendingUndo()).toBe(pending)
    expect(document.canRedo()).toBe(false)
    document.undo()
    expect(document.entries).toHaveLength(0)
  })

  it('drops the removed rows from the intent and origin lookups', () => {
    const document = createDocument()
    document.insertAt(0, [cube('a')], { origin: 'ai', intent: 'Make a cube' })
    document.removeRecords(['a'], { origin: 'ai' })
    expect(document.intentOf('a')).toBeUndefined()
    expect(document.originOf('a')).toBeUndefined()
  })

  it('moves a rollback marker back by the removed rows that sat before it', () => {
    const document = createDocument()
    document.append(cube('keep'), { origin: 'local' })
    document.insertAt(1, [cube('a', 20)], { origin: 'ai' })
    document.append(cube('later', 60), { origin: 'local' })
    document.rollBackTo('a', { origin: 'local' })
    expect(document.rollbackAt()).toBe(2)

    document.removeRecords(['a'], { origin: 'ai' })

    expect(document.rollbackAt()).toBe(1)
    expect(document.entries.map((entry) => entry.record.id)).toEqual(['keep', 'later'])
  })

  it('refuses, by name and without changing anything, when a record outside the set depends on one inside it', () => {
    const document = createDocument()
    document.insertAt(0, [cube('a'), cube('b', 40)], { origin: 'ai' })
    document.append(
      { id: 'u', op: 'boolean.union', name: 'Union', target: 'a', operands: ['b'], consumes: ['a', 'b'] },
      { origin: 'local' }
    )
    const before = document.entries.slice()

    expect(() => document.removeRecords(['a', 'b'], { origin: 'ai' })).toThrow(/Union/)
    expect(document.entries).toEqual(before)
  })

  it('refuses an unknown id and an empty list rather than guessing', () => {
    const document = createDocument()
    document.append(cube('a'), { origin: 'local' })
    expect(() => document.removeRecords(['nope'], { origin: 'ai' })).toThrow(/nope/)
    expect(() => document.removeRecords([], { origin: 'ai' })).toThrow(/at least one/)
    expect(document.entries).toHaveLength(1)
  })

  it('requires an origin, like every other mutation', () => {
    const document = createDocument()
    document.append(cube('a'), { origin: 'local' })
    // @ts-expect-error — the point of the test
    expect(() => document.removeRecords(['a'], {})).toThrow(/origin/)
  })
})
