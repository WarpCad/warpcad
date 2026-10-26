// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useDocumentStore } from './document.js'
import { useObjectListStore } from './objectList.js'
import { useSelectionStore } from './selection.js'
import { useSketchEditorStore } from './sketchEditor.js'

/**
 * `TODO/ui-089` in the Objects list: what each row's eye shows (shown, hidden, or *some parts
 * hidden* on a body row), what a tap on it does, the count line's `N hidden`, and the `H`
 * shortcut's "toggle the selection". Everything goes through the document store's
 * `setViewHidden` / `showAll`, so rule 5 (a hidden thing leaves the selection) is the store's
 * and is only re-checked here through the shortcut.
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
  documentStore.appendAll([structuredClone(cube), structuredClone(split), structuredClone(cylinder)])
  return { documentStore, objects: useObjectListStore(), selection: useSelectionStore() }
}

/** @param {ReturnType<typeof useObjectListStore>} objects @param {string} id */
const rowOf = (objects, id) => /** @type {import('./objectList.js').ObjectRow} */ (objects.rows.find((row) => row.id === id))

/** @param {import('./objectList.js').ObjectRow} row @param {string} name */
const partOf = (row, name) => /** @type {import('./objectList.js').PartRow} */ (row.parts.find((part) => part.name === name))

describe('the Objects list\'s eye (TODO/ui-089)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('every row starts shown, and nothing is counted hidden', () => {
    const { objects } = setup()
    expect(rowOf(objects, 'cube-1').eye).toBe('shown')
    expect(rowOf(objects, 'cube-1').viewHidden).toBe(false)
    expect(partOf(rowOf(objects, 'cube-1'), 'Cube 1 A')).toMatchObject({ viewHidden: false, drawn: true })
    expect(objects.hiddenCount).toBe(0)
  })

  it('a part\'s eye hides only that part, and the body row reads "some parts hidden"', () => {
    const { objects } = setup()
    objects.togglePartVisibility('cube-1', 'Cube 1 A')
    const row = rowOf(objects, 'cube-1')
    expect(row.eye).toBe('mixed')
    expect(row.viewHidden).toBe(false)
    expect(partOf(row, 'Cube 1 A')).toMatchObject({ viewHidden: true, drawn: false })
    expect(partOf(row, 'Cube 1 B')).toMatchObject({ viewHidden: false, drawn: true })
    expect(objects.hiddenCount).toBe(1)
    objects.togglePartVisibility('cube-1', 'Cube 1 A')
    expect(rowOf(objects, 'cube-1').eye).toBe('shown')
  })

  it('a shown body\'s eye hides it; a hidden one\'s shows it, each part back to its own switch', () => {
    const { objects } = setup()
    objects.toggleBodyVisibility('cube-1')
    objects.togglePartVisibility('cube-1', 'Cube 1 A')
    let row = rowOf(objects, 'cube-1')
    expect(row.eye).toBe('hidden')
    expect(row.viewHidden).toBe(true)
    // Every part is out of the view with its body; each keeps its own switch.
    expect(partOf(row, 'Cube 1 B')).toMatchObject({ viewHidden: false, drawn: false })
    expect(objects.hiddenCount).toBe(1)
    objects.toggleBodyVisibility('cube-1')
    row = rowOf(objects, 'cube-1')
    expect(row.eye).toBe('mixed')
    expect(partOf(row, 'Cube 1 A').viewHidden).toBe(true)
  })

  it('in the mixed state the body\'s eye shows every part, and leaves the body shown', () => {
    const { objects } = setup()
    objects.togglePartVisibility('cube-1', 'Cube 1 A')
    objects.togglePartVisibility('cube-1', 'Cube 1 B')
    objects.toggleBodyVisibility('cube-1')
    const row = rowOf(objects, 'cube-1')
    expect(row.eye).toBe('shown')
    expect(row.parts.every((part) => part.drawn)).toBe(true)
  })

  it('counts a hidden body once and each hidden part of a shown body once; Show all clears them', () => {
    const { objects } = setup()
    objects.togglePartVisibility('cube-1', 'Cube 1 A')
    objects.toggleBodyVisibility('cyl-1')
    expect(objects.hiddenCount).toBe(2)
    objects.showAll()
    expect(objects.hiddenCount).toBe(0)
    expect(objects.rows.every((row) => row.eye === 'shown')).toBe(true)
  })

  it('does nothing while the list is read-only (a sketch being edited)', () => {
    const { objects } = setup()
    useSketchEditorStore().active = true
    expect(objects.toggleBodyVisibility('cube-1')).toBe(false)
    expect(objects.togglePartVisibility('cube-1', 'Cube 1 A')).toBe(false)
    expect(objects.toggleSelectionVisibility()).toBe(false)
    useSketchEditorStore().active = false
    expect(objects.hiddenCount).toBe(0)
  })
})

describe('the H shortcut\'s toggle of the selection (TODO/ui-089)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('hides the selected bodies, which leave the selection', () => {
    const { objects, selection } = setup()
    selection.selectMany(['cube-1', 'cyl-1'])
    expect(objects.toggleSelectionVisibility()).toBe(true)
    expect(rowOf(objects, 'cube-1').eye).toBe('hidden')
    expect(rowOf(objects, 'cyl-1').eye).toBe('hidden')
    expect(selection.count).toBe(0)
  })

  it('hides only the drilled part when the selection is addressed at one', () => {
    const { objects, selection } = setup()
    selection.select('cube-1')
    selection.drillInto('Cube 1 A')
    objects.toggleSelectionVisibility()
    const row = rowOf(objects, 'cube-1')
    expect(row.eye).toBe('mixed')
    expect(partOf(row, 'Cube 1 A').viewHidden).toBe(true)
  })

  it('shows a hidden body ticked back in from the list', () => {
    const { objects, selection } = setup()
    objects.toggleBodyVisibility('cyl-1')
    selection.select('cyl-1')
    objects.toggleSelectionVisibility()
    expect(rowOf(objects, 'cyl-1').eye).toBe('shown')
    expect(selection.ids).toEqual(['cyl-1'])
  })

  it('is a no-op with nothing selected', () => {
    const { objects } = setup()
    expect(objects.toggleSelectionVisibility()).toBe(false)
  })
})
