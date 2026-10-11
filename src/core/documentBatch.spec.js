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

    describe('a record step and a revision in one batch (TODO/core-056)', () => {
      const CUBE2 = { id: 'cube2', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [10, 10, 10], center: [-40, 0, 5] } }

      /**
       * @param {import('./document.js').WarpDocument} doc
       * @param {number} diameter
       */
      function resizeSphere(doc, diameter) {
        const current = /** @type {any} */ (doc.recordOf('sphere'))
        doc.reviseRecords([{ id: 'sphere', record: { ...current, params: { ...current.params, diameter } } }], { origin: 'local' })
      }

      /** @param {import('./document.js').WarpDocument} doc */
      function appendThenRevise(doc) {
        doc.append(CUBE2, { origin: 'local' })
        resizeSphere(doc, 20)
      }

      it('is one Undo step: both are back after one undo, both return on redo, and again after undo-after-redo', () => {
        const doc = seeded()
        const depth = doc.pendingUndo()
        const before = state(doc)

        doc.batch(appendThenRevise)
        const after = state(doc)
        expect(after.records).toContain('cube2')
        expect(after).not.toEqual({ ...before, undo: after.undo })
        expect(doc.pendingUndo()?.label).toBe('Place Cube 2')

        doc.undo()
        expect(state(doc)).toEqual({ ...before, redo: 'Place Cube 2' })
        expect(doc.pendingUndo()).toBe(depth)
        expect(doc.recordOf('cube2')).toBeUndefined()

        doc.redo()
        expect(state(doc)).toEqual(after)

        doc.undo()
        expect(state(doc)).toEqual({ ...before, redo: 'Place Cube 2' })
        doc.redo()
        expect(state(doc)).toEqual(after)
      })

      it('revise then append merges the same way', () => {
        const doc = seeded()
        const before = state(doc)
        doc.batch((d) => {
          resizeSphere(d, 20)
          d.append(CUBE2, { origin: 'local' })
        })
        const after = state(doc)
        expect(doc.pendingUndo()?.label).toMatch(/Edit step/)
        doc.undo()
        expect(state(doc)).toEqual({ ...before, redo: after.undo })
        doc.redo()
        expect(state(doc)).toEqual(after)
      })

      it('a batch of only one revision is that revision, one step', () => {
        const doc = seeded()
        const before = state(doc)
        doc.batch((d) => resizeSphere(d, 20), { label: 'Resize' })
        expect(doc.pendingUndo()?.label).toBe('Resize')
        const after = state(doc)
        doc.undo()
        expect(state(doc)).toEqual({ ...before, redo: 'Resize' })
        doc.redo()
        expect(state(doc)).toEqual(after)
      })

      it('a batch of two revisions is one step', () => {
        const doc = seeded()
        const before = state(doc)
        doc.batch((d) => {
          resizeSphere(d, 20)
          resizeSphere(d, 30)
        })
        const after = state(doc)
        expect(after.bodies.find((body) => body.id === 'sphere')?.bounds).toEqual([
          [45, -15, -10],
          [75, 15, 20],
        ])
        doc.undo()
        expect(state(doc)).toEqual({ ...before, redo: after.undo })
        expect(doc.canUndo()).toBe(true)
        doc.redo()
        expect(state(doc)).toEqual(after)
        doc.undo()
        doc.redo()
        expect(state(doc)).toEqual(after)
      })

      it('undo and redo still work after an unrelated remote record arrived (the re-fold path)', () => {
        const doc = seeded()
        const before = state(doc)
        doc.batch(appendThenRevise)
        const after = state(doc)

        doc.append({ id: 'remote-box', op: 'primitive.cuboid', name: 'Remote', params: { size: [5, 5, 5], center: [0, 80, 2.5] } }, { origin: 'remote' })
        doc.undo()
        expect(doc.records.map((record) => record.id)).toEqual([...before.records, 'remote-box'])
        expect(doc.recordOf('cube2')).toBeUndefined()
        expect(/** @type {any} */ (doc.recordOf('sphere')).params.diameter).toBe(10)

        doc.append({ id: 'remote-box-2', op: 'primitive.cuboid', name: 'Remote 2', params: { size: [5, 5, 5], center: [0, 90, 2.5] } }, { origin: 'remote' })
        doc.redo()
        expect(doc.recordOf('cube2')).toBeDefined()
        expect(/** @type {any} */ (doc.recordOf('sphere')).params.diameter).toBe(20)
        expect(doc.records.map((record) => record.id)).toEqual(expect.arrayContaining(after.records))
        expect(doc.records.at(-1)?.id).not.toBe('cube2')
      })

      it('an Undo a later remote record depends on is refused, naming it, and changes nothing', () => {
        const doc = seeded()
        doc.batch(appendThenRevise)
        doc.append(moveToRecord(doc, 'cube2', [-40, 20, 5]), { origin: 'remote' })
        const snapshot = state(doc)
        const version = doc.version

        expect(() => doc.undo()).toThrow(/depends on/)
        expect(state(doc)).toEqual(snapshot)
        expect(doc.version).toBeGreaterThanOrEqual(version)
        expect(/** @type {any} */ (doc.recordOf('sphere')).params.diameter).toBe(20)
        expect(doc.pendingUndo()?.label).toBe('Place Cube 2')
        expect(doc.pendingRedo()).toBeUndefined()
      })

      it('is atomic when the revision is refused: nothing changes, including derived indexes', () => {
        const doc = seeded()
        doc.undo()
        const before = state(doc)
        const bodiesBefore = doc.bodies().length
        const currentCube = doc.currentIdOf('cube')

        expect(() =>
          doc.batch((d) => {
            d.append(CUBE2, { origin: 'local' })
            d.reviseRecords([{ id: 'no-such-step', record: CUBE2 }], { origin: 'local' })
          })
        ).toThrow(/no step "no-such-step"/)

        expect(state(doc)).toEqual(before)
        expect(doc.recordOf('cube2')).toBeUndefined()
        expect(doc.currentIdOf('cube2')).toBeUndefined()
        expect(doc.bodies()).toHaveLength(bodiesBefore)
        expect(doc.currentIdOf('cube')).toBe(currentCube)
        // The redo stack and the next append still behave.
        doc.redo()
        expect(doc.pendingUndo()?.label).toBe('Place Sphere 1')
        doc.append(CUBE2, { origin: 'local' })
        expect(doc.recordOf('cube2')).toBeDefined()
      })

      it('while rolled back, inserts at the marker and one Undo takes both out; redo puts both back', () => {
        const doc = seeded()
        doc.rollBackTo(/** @type {string} */ (doc.currentIdOf('cube')), { origin: 'local' })
        const before = state(doc)
        doc.batch((d) => {
          d.append(CUBE2, { origin: 'local' })
          const current = /** @type {any} */ (d.recordOf('cube'))
          d.reviseRecords([{ id: 'cube', record: { ...current, params: { ...current.params, size: [12, 12, 12] } } }], { origin: 'local' })
        })
        const after = state(doc)
        expect(after.rollbackAt).not.toBe(before.rollbackAt)
        doc.undo()
        expect(state(doc)).toEqual({ ...before, redo: after.undo })
        doc.redo()
        expect(state(doc)).toEqual(after)
      })
    })
  })
}
