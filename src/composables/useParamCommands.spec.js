import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { boundsOf } from '../core/kernel/group.js'
import { moveToRecord, positionOf, rotateToRecord } from '../core/transform.js'
import { useDocumentStore } from '../stores/document.js'
import { useParamCommands } from './useParamCommands.js'

/**
 * One Inspector param edit is **one** Undo step (`TODO/ui-044`).
 *
 * A param edit on a moved or turned body is a rebuilt creation record plus a
 * rotate-back and a move-back (see `useParamCommands.js`'s module doc). Committed
 * as separate appends, that was two or three Undo steps, and one press of Undo
 * left the body at its creation spot with the new params: a state the user never
 * made. These assert what the user sees after one Undo (geometry bounds and
 * volume-bearing size, every body), not how many times something was called.
 */
describe('useParamCommands (TODO/ui-044)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** A Sphere, then a Cylinder dropped away from the origin: `ui-044`'s own step 1. */
  function seed() {
    const doc = useDocumentStore()
    doc.append(
      { id: 'sphere-1', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 30, center: [80, 0, 15] } },
      { origin: 'local' }
    )
    doc.append(
      {
        id: 'cylinder-2',
        op: 'primitive.cylinder',
        name: 'Cylinder 1',
        params: { diameter: 40, height: 50, center: [-43, 10, 25], segments: 32 },
      },
      { origin: 'local' }
    )
    return doc
  }

  /**
   * Every body's id and rounded bounds, the whole scene.
   *
   * @param {ReturnType<typeof useDocumentStore>} doc
   */
  function snapshot(doc) {
    return doc.raw
      .bodies()
      .map((body) => ({
        id: body.id,
        bounds: boundsOf(body.geometry).map((corner) => corner.map((mm) => Math.round(mm * 1000) / 1000)),
      }))
  }

  it('a param edit on a moved body is one undo step, and one Undo returns the moved body at its old size', () => {
    const doc = seed()
    doc.append(moveToRecord(doc.raw, 'cylinder-2', [33, 10, 25]), { origin: 'local' })
    const moved = snapshot(doc)

    useParamCommands().setParam('cylinder-2', 'diameter', 12)

    // The edit took, and the body stayed where it had been moved to.
    const [cx, cy, cz] = positionOf(doc.raw, 'cylinder-2')
    expect(cx).toBeCloseTo(33, 6)
    expect(cy).toBeCloseTo(10, 6)
    expect(cz).toBeCloseTo(25, 6)
    expect(doc.raw.pendingUndo()?.label).toBe('Edit Cylinder 1')

    doc.undo()

    expect(snapshot(doc)).toEqual(moved)
    // The move itself is the next step back, not a remainder of the edit.
    expect(doc.raw.pendingUndo()?.label).toBe('Move Cylinder 1')
  })

  it('a param edit on a moved and turned body is one undo step too', () => {
    const doc = seed()
    doc.append(moveToRecord(doc.raw, 'cylinder-2', [33, 10, 25]), { origin: 'local' })
    doc.append(rotateToRecord(doc.raw, 'cylinder-2', [30, 0, 0]), { origin: 'local' })
    const posed = snapshot(doc)
    const posedLabel = doc.raw.pendingUndo()?.label

    useParamCommands().setParam('cylinder-2', 'height', 20)
    expect(doc.raw.pendingUndo()?.label).toBe('Edit Cylinder 1')

    doc.undo()

    expect(snapshot(doc)).toEqual(posed)
    expect(doc.raw.pendingUndo()?.label).toBe(posedLabel)

    // And Redo puts the whole edit back in one press, pose included.
    doc.redo()
    const [cx, cy] = positionOf(doc.raw, 'cylinder-2')
    expect(cx).toBeCloseTo(33, 6)
    expect(cy).toBeCloseTo(10, 6)
    expect(doc.raw.pendingUndo()?.label).toBe('Edit Cylinder 1')
  })

  it('a value the kernel rejects throws and leaves the document and both stacks exactly as they were', () => {
    const doc = seed()
    doc.append(moveToRecord(doc.raw, 'cylinder-2', [33, 10, 25]), { origin: 'local' })
    const before = snapshot(doc)
    const entries = doc.raw.entries.length

    expect(() => useParamCommands().setParam('cylinder-2', 'diameter', 0)).toThrow()

    expect(snapshot(doc)).toEqual(before)
    expect(doc.raw.entries.length).toBe(entries)
    expect(doc.raw.pendingUndo()?.label).toBe('Move Cylinder 1')
  })
})
