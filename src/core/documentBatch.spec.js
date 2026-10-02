// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `document.batch`: several appends, measured one after another, as **one** undo
 * step (`TODO/ui-044`).
 *
 * `appendAll` already makes several records one step, but only when every record
 * can be written down before any is committed. A param edit cannot: its move-back
 * is measured against the body the rebuilt record produces. `batch` lets the
 * build call the ordinary `append` as often as it needs, reading the live
 * document between calls, then folds whatever local steps it pushed into one.
 * And it is atomic, which `appendAll`'s fast path is not: a throw part-way puts
 * the document, both stacks and the marker back exactly as they were.
 */
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { boundsOf } from './kernel/group.js'
import { moveToRecord } from './transform.js'

const CUBE = { id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [0, 0, 10] } }
const SPHERE = { id: 'sphere', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 10, center: [60, 0, 5] } }

/** @param {import('./document.js').WarpDocument} doc */
function state(doc) {
  return {
    bodies: doc.bodies().map((body) => ({
      id: body.id,
      bounds: boundsOf(body.geometry).map((corner) => corner.map((mm) => Math.round(mm * 1e6) / 1e6)),
    })),
    records: doc.records.map((record) => record.id),
    rollbackAt: doc.rollbackAt(),
    undo: doc.pendingUndo()?.label,
    redo: doc.pendingRedo()?.label,
  }
}

/**
 * An edit of the cube's size, then a move back to x = 30: `ui-044`'s shape.
 *
 * @param {import('./document.js').WarpDocument} doc
 */
function editAndMoveBack(doc) {
  doc.append(
    { id: doc.nextId('cube-edit'), op: 'primitive.cuboid', supersedes: doc.currentIdOf('cube'), params: { size: [8, 8, 8], center: [0, 0, 4] } },
    { origin: 'local' }
  )
  doc.append(moveToRecord(doc, 'cube', [30, 0, 4]), { origin: 'local' })
}

for (const restorableSteps of [50, 0]) {
  describe(`document.batch (TODO/ui-044), restorableSteps: ${restorableSteps}`, () => {
    function seeded() {
      const doc = createDocument({ restorableSteps })
      doc.append(CUBE, { origin: 'local' })
      doc.append(moveToRecord(doc, 'cube', [30, 0, 10]), { origin: 'local' })
      doc.append(SPHERE, { origin: 'local' })
      return doc
    }

    it('merges every step the build pushed into one, labelled by its first record', () => {
      const doc = seeded()
      const before = state(doc)

      doc.batch(editAndMoveBack)

      expect(doc.pendingUndo()?.label).toBe('Edit Cube 1')
      expect(doc.pendingUndo()?.records).toHaveLength(2)
      const edited = state(doc)
      expect(edited.bodies[0].bounds).toEqual([
        [26, -4, 0],
        [34, 4, 8],
      ])

      doc.undo()
      expect(state(doc)).toEqual({ ...before, redo: 'Edit Cube 1' })

      doc.redo()
      expect(state(doc)).toEqual(edited)
    })

    it('takes an explicit label over the first record’s', () => {
      const doc = seeded()
      doc.batch(editAndMoveBack, { label: 'Resize Cube 1' })
      expect(doc.pendingUndo()?.label).toBe('Resize Cube 1')
    })

    it('is atomic: a throw part-way leaves the document, both stacks and the marker as they were', () => {
      const doc = seeded()
      doc.undo()
      const before = state(doc)
      const version = doc.version

      expect(() =>
        doc.batch((d) => {
          editAndMoveBack(d)
          throw new Error('the third record would not fold')
        })
      ).toThrow('the third record would not fold')

      expect(state(doc)).toEqual(before)
      // Moved on, never back: a cache keyed by version must not mistake the
      // restored state for one it saw in the middle of the batch.
      expect(doc.version).toBeGreaterThan(version)
      // And the stacks still work from here.
      doc.redo()
      expect(doc.pendingUndo()?.label).toBe('Place Sphere 1')
    })

    it('while rolled back, inserts at the marker as one step, and one Undo takes it all out', () => {
      const doc = seeded()
      doc.rollBackTo(/** @type {string} */ (doc.currentIdOf('cube')), { origin: 'local' })
      const before = state(doc)

      doc.batch(editAndMoveBack)

      expect(doc.pendingUndo()?.label).toBe('Edit Cube 1')
      expect(doc.rollbackAt()).toBe(/** @type {number} */ (before.rollbackAt) + 2)
      const edited = state(doc)

      doc.undo()
      expect(state(doc)).toEqual({ ...before, redo: 'Edit Cube 1' })
      doc.redo()
      expect(state(doc)).toEqual(edited)
    })

    it('a build that appends nothing leaves the stacks alone', () => {
      const doc = seeded()
      const before = state(doc)
      doc.batch(() => {})
      expect(state(doc)).toEqual(before)
    })
  })
}
