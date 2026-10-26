// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { parseProject, serializeProject } from '../core/project.js'
import { useDocumentStore } from './document.js'
import { useSelectionStore } from './selection.js'

/**
 * `TODO/ui-089` on the store: thin wrappers over core's `setViewHidden` / `showAll` (a `local`
 * change, never an undo step), the summaries the Objects list and the viewport read, and rule
 * 5 — hiding something that is selected takes it out of the selection.
 */

const cube = { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 90, 40], center: [0, 0, 20] } }
const split = {
  id: 'cube-1-split',
  op: 'modify.splitWithJoint',
  target: 'cube-1',
  supersedes: 'cube-1',
  params: { axis: 'y', offsetMm: 45, joint: 'none', clearanceMm: 0.2, names: ['Cube 1 A', 'Cube 1 B'] },
}
const cylinder = { id: 'cyl-1', op: 'primitive.cuboid', name: 'Cylinder 1', params: { size: [10, 10, 10], center: [60, 0, 5] } }

function setup() {
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  documentStore.appendAll([structuredClone(cube), structuredClone(split), structuredClone(cylinder)])
  return { documentStore, selection }
}

/** @param {ReturnType<typeof useDocumentStore>} documentStore @param {string} id */
const summaryOf = (documentStore, id) => documentStore.bodies.find((body) => body.id === id)

describe('the document store\'s Hide / Show (TODO/ui-089)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('hides a part and a body, reflected in the summaries, as a version bump that is not an undo step', () => {
    const { documentStore } = setup()
    const undoLabel = documentStore.undoLabel
    const version = documentStore.version
    documentStore.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: true })
    documentStore.setViewHidden('cyl-1', { hidden: true })
    expect(summaryOf(documentStore, 'cube-1')).toMatchObject({ viewHiddenParts: ['Cube 1 A'] })
    expect(summaryOf(documentStore, 'cube-1')).not.toHaveProperty('viewHidden')
    expect(summaryOf(documentStore, 'cyl-1')).toMatchObject({ viewHidden: true })
    expect(documentStore.version).toBe(version + 2)
    expect(documentStore.undoLabel).toBe(undoLabel)
  })

  it('Show all brings everything back in one change', () => {
    const { documentStore } = setup()
    documentStore.setViewHidden('cube-1', { hidden: true })
    documentStore.setViewHidden('cyl-1', { hidden: true })
    const version = documentStore.version
    documentStore.showAll()
    expect(documentStore.version).toBe(version + 1)
    for (const body of documentStore.bodies) {
      expect(body).not.toHaveProperty('viewHidden')
      expect(body).not.toHaveProperty('viewHiddenParts')
    }
  })

  it('hiding a selected body takes it out of the selection and leaves the rest, addresses included', () => {
    const { documentStore, selection } = setup()
    selection.selectMany(['cube-1', 'cyl-1'])
    selection.selectPart('cube-1', 'Cube 1 B', true)
    expect(selection.ids).toEqual(['cube-1', 'cyl-1'])
    expect(selection.partOf('cube-1')).toBe('Cube 1 B')
    documentStore.setViewHidden('cyl-1', { hidden: true })
    expect(selection.ids).toEqual(['cube-1'])
    expect(selection.partOf('cube-1')).toBe('Cube 1 B')
  })

  it('hiding the part a selected body is drilled into drops that body; hiding another part does not', () => {
    const { documentStore, selection } = setup()
    selection.select('cube-1')
    selection.drillInto('Cube 1 A')
    documentStore.setViewHidden('cube-1', { subPart: 'Cube 1 B', hidden: true })
    expect(selection.subPart).toEqual({ bodyId: 'cube-1', partName: 'Cube 1 A' })
    documentStore.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: true })
    expect(selection.ids).toEqual([])
    // The hidden body forgets the address: ticking its row again selects it whole.
    selection.toggle('cube-1')
    expect(selection.subPart).toBeNull()
  })

  it('the Objects list can still select a hidden body (rule 5), and showing never changes the selection', () => {
    const { documentStore, selection } = setup()
    documentStore.setViewHidden('cyl-1', { hidden: true })
    selection.toggle('cyl-1')
    expect(selection.ids).toEqual(['cyl-1'])
    documentStore.setViewHidden('cyl-1', { hidden: false })
    expect(selection.ids).toEqual(['cyl-1'])
  })

  it('a load carries what was hidden, and a reload of the saved text keeps it', () => {
    const { documentStore } = setup()
    documentStore.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: true })
    const parsed = parseProject(serializeProject(documentStore.raw))
    setActivePinia(createPinia())
    const reopened = useDocumentStore()
    reopened.load(parsed.entries, parsed.rollbackAt, parsed.resolution, {
      ...(parsed.merge === undefined ? {} : { merge: parsed.merge }),
      ...(parsed.viewHidden === undefined ? {} : { viewHidden: parsed.viewHidden }),
    })
    expect(summaryOf(reopened, 'cube-1')).toMatchObject({ viewHiddenParts: ['Cube 1 A'] })
  })
})
