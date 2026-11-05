// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `TODO/ui-094`: the store side of renaming a part — what holds the part by name outside the
 * document (the selection, the eye, the Align reference) follows it on commit, Undo and Redo.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useAlignReferenceStore } from './alignReference.js'
import { useDocumentStore } from './document.js'
import { useSelectionStore } from './selection.js'

const cuboid = (/** @type {string} */ id, /** @type {string} */ name, /** @type {number[]} */ center) => ({
  id,
  op: 'primitive.cuboid',
  name,
  params: { size: [10, 10, 10], center },
})

function setup() {
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  documentStore.appendAll([
    cuboid('a', 'Cube 1', [0, 0, 5]),
    cuboid('b', 'Cube 2', [30, 0, 5]),
    cuboid('c', 'Cube 3', [60, 0, 5]),
    { id: 'g', op: 'group.assemble', name: 'Group 1', target: 'a', operands: ['b', 'c'], consumes: ['a', 'b', 'c'], params: { names: ['Cube 1', 'Cube 2', 'Cube 3'] } },
  ])
  return { documentStore, selection }
}

/** @param {ReturnType<typeof useDocumentStore>} documentStore */
const partNamesOf = (documentStore) => documentStore.bodies.find((body) => body.id === 'g')?.partNames

describe('the document store’s renamePart (TODO/ui-094)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps the selection drilled into the renamed part through the commit, Undo and Redo', () => {
    const { documentStore, selection } = setup()
    selection.selectPart('g', 'Cube 2')
    documentStore.renamePart('g', 'Cube 2', 'Lid')
    expect(partNamesOf(documentStore)).toEqual(['Cube 1', 'Lid', 'Cube 3'])
    expect(selection.subPart).toEqual({ bodyId: 'g', partName: 'Lid' })
    expect(documentStore.undoLabel).toBe('Rename Cube 2 to Lid on Group 1')

    documentStore.undo()
    expect(partNamesOf(documentStore)).toEqual(['Cube 1', 'Cube 2', 'Cube 3'])
    expect(selection.subPart).toEqual({ bodyId: 'g', partName: 'Cube 2' })

    documentStore.redo()
    expect(partNamesOf(documentStore)).toEqual(['Cube 1', 'Lid', 'Cube 3'])
    expect(selection.subPart).toEqual({ bodyId: 'g', partName: 'Lid' })
  })

  it('an eye-hidden part stays hidden under its new name, and back under its old one on Undo', () => {
    const { documentStore } = setup()
    documentStore.setViewHidden('g', { subPart: 'Cube 3', hidden: true })
    documentStore.renamePart('g', 'Cube 3', 'Clearance')
    const summary = () => documentStore.bodies.find((body) => body.id === 'g')
    expect(summary()?.viewHiddenParts).toEqual(['Clearance'])
    documentStore.undo()
    expect(summary()?.viewHiddenParts).toEqual(['Cube 3'])
    documentStore.redo()
    expect(summary()?.viewHiddenParts).toEqual(['Clearance'])
  })

  it('the Align reference follows the part', () => {
    const { documentStore } = setup()
    const align = useAlignReferenceStore()
    align.set('g', 'Cube 1')
    documentStore.renamePart('g', 'Cube 1', 'Base')
    expect(align.get('g')).toBe('Base')
    documentStore.undo()
    expect(align.get('g')).toBe('Cube 1')
  })

  it('a refusal changes nothing, the selection included', () => {
    const { documentStore, selection } = setup()
    selection.selectPart('g', 'Cube 2')
    expect(() => documentStore.renamePart('g', 'Cube 2', 'Cube 1')).toThrow(/already has a part called Cube 1/)
    expect(partNamesOf(documentStore)).toEqual(['Cube 1', 'Cube 2', 'Cube 3'])
    expect(selection.subPart).toEqual({ bodyId: 'g', partName: 'Cube 2' })
  })
})
