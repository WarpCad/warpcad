// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — test doubles.
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

enableAutoUnmount(afterEach)

import { useDocumentStore } from '../../stores/document.js'
import { useHoverHighlightStore } from '../../stores/hoverHighlight.js'
import { useSelectionStore } from '../../stores/selection.js'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'
import ObjectList from './ObjectList.vue'
import ViewHiddenNote from './ViewHiddenNote.vue'

/**
 * `TODO/ui-089` at component level: the eye on every body row and part row of the Objects
 * list and the Inspector's Parts list, its three states on a body row, the dimmed row with no
 * text chip, the count line's `N hidden · Show all`, and the Inspector's "Hidden in the view ·
 * Show" note. The reachability half (the real root view, three viewports, three engines) is
 * `e2e/object-visibility.e2e.js`.
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

const eyeOf = (wrapper, testId) => wrapper.get(`[data-testid="${testId}"]`)

describe('ObjectList — Hide and show (TODO/ui-089)', () => {
  let pinia
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    useDocumentStore().appendAll([structuredClone(cube), structuredClone(split), structuredClone(cylinder)])
  })

  const mountList = (props = {}) => mount(ObjectList, { props, global: { plugins: [pinia] } })

  it('puts an eye on every body row, between the name and the chevron, labelled Hide <name>', () => {
    const wrapper = mountList()
    const eye = eyeOf(wrapper, 'objects-eye-cube-1')
    expect(eye.element.tagName).toBe('BUTTON')
    expect(eye.attributes('aria-label')).toBe('Hide Cube 1')
    expect(eye.attributes('data-eye')).toBe('shown')
    expect(eyeOf(wrapper, 'objects-eye-cyl-1').attributes('aria-label')).toBe('Hide Cylinder 1')
    const line = wrapper.get('[data-testid="objects-line-cube-1"]').element
    const order = [...line.children].map((child) => child.getAttribute('data-testid'))
    expect(order.indexOf('objects-row-cube-1')).toBeLessThan(order.indexOf('objects-eye-cube-1'))
    expect(order.indexOf('objects-eye-cube-1')).toBeLessThan(order.indexOf('objects-expand-cube-1'))
  })

  it('a tap hides the body: the row dims, the eye turns to Show, no "hidden" chip, and the selection is untouched', async () => {
    const selection = useSelectionStore()
    selection.select('cube-1')
    const wrapper = mountList()
    await eyeOf(wrapper, 'objects-eye-cyl-1').trigger('click')
    const eye = eyeOf(wrapper, 'objects-eye-cyl-1')
    expect(eye.attributes('data-eye')).toBe('hidden')
    expect(eye.attributes('aria-label')).toBe('Show Cylinder 1')
    expect(wrapper.get('[data-testid="objects-item-cyl-1"]').attributes('data-view-hidden')).toBe('true')
    expect(wrapper.get('[data-testid="objects-item-cyl-1"]').text()).not.toMatch(/hidden/i)
    // The eye is its own button: it did not select the row it sits on.
    expect(selection.ids).toEqual(['cube-1'])
    await eyeOf(wrapper, 'objects-eye-cyl-1').trigger('click')
    expect(eyeOf(wrapper, 'objects-eye-cyl-1').attributes('data-eye')).toBe('shown')
    expect(wrapper.get('[data-testid="objects-item-cyl-1"]').attributes('data-view-hidden')).toBe('false')
  })

  it('the count line gains "· N hidden · Show all" only while something is hidden; Show all clears it', async () => {
    const wrapper = mountList()
    expect(wrapper.get('[data-testid="objects-count"]').text()).toBe('2 objects')
    expect(wrapper.find('[data-testid="objects-show-all"]').exists()).toBe(false)
    await eyeOf(wrapper, 'objects-eye-cyl-1').trigger('click')
    expect(wrapper.get('[data-testid="objects-count"]').text()).toBe('2 objects · 1 hidden · Show all')
    await wrapper.get('[data-testid="objects-show-all"]').trigger('click')
    expect(wrapper.get('[data-testid="objects-count"]').text()).toBe('2 objects')
    expect(eyeOf(wrapper, 'objects-eye-cyl-1').attributes('data-eye')).toBe('shown')
  })

  it('a part row\'s eye hides that part alone, and the body\'s eye reads "some parts hidden" and shows them all', async () => {
    const wrapper = mountList()
    await wrapper.get('[data-testid="objects-expand-cube-1"]').trigger('click')
    const partEye = eyeOf(wrapper, 'objects-part-eye-cube-1-Cube 1 A')
    expect(partEye.attributes('aria-label')).toBe('Hide Cube 1 A')
    await partEye.trigger('click')
    expect(eyeOf(wrapper, 'objects-part-eye-cube-1-Cube 1 A').attributes('aria-label')).toBe('Show Cube 1 A')
    expect(wrapper.get('[data-testid="objects-part-item-cube-1-Cube 1 A"]').attributes('data-view-hidden')).toBe('true')
    // The recipe's own `hidden` chip keeps its one meaning: a user hide adds none.
    expect(wrapper.find('[data-testid="objects-part-hidden-cube-1-Cube 1 A"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="objects-part-item-cube-1-Cube 1 B"]').attributes('data-view-hidden')).toBe('false')
    expect(eyeOf(wrapper, 'objects-eye-cube-1').attributes('data-eye')).toBe('mixed')
    expect(wrapper.get('[data-testid="objects-count"]').text()).toBe('2 objects · 1 hidden · Show all')
    await eyeOf(wrapper, 'objects-eye-cube-1').trigger('click')
    expect(eyeOf(wrapper, 'objects-eye-cube-1').attributes('data-eye')).toBe('shown')
    expect(eyeOf(wrapper, 'objects-part-eye-cube-1-Cube 1 A').attributes('aria-label')).toBe('Hide Cube 1 A')
  })

  it('the parts of a hidden body dim with it, each eye still showing the part\'s own switch', async () => {
    const wrapper = mountList()
    await wrapper.get('[data-testid="objects-expand-cube-1"]').trigger('click')
    await eyeOf(wrapper, 'objects-eye-cube-1').trigger('click')
    expect(wrapper.get('[data-testid="objects-part-item-cube-1-Cube 1 B"]').attributes('data-view-hidden')).toBe('true')
    expect(eyeOf(wrapper, 'objects-part-eye-cube-1-Cube 1 B').attributes('aria-label')).toBe('Hide Cube 1 B')
  })

  it('a hovered row of something hidden still writes the hover — the viewport is what draws nothing', async () => {
    const wrapper = mountList()
    await eyeOf(wrapper, 'objects-eye-cyl-1').trigger('click')
    await wrapper.get('[data-testid="objects-line-cyl-1"]').trigger('pointermove', { pointerType: 'mouse' })
    expect(useHoverHighlightStore().target).toEqual({ bodyId: 'cyl-1', partName: null })
  })

  it('every eye is disabled while the list is read-only (a sketch being edited)', async () => {
    useSketchEditorStore().active = true
    const wrapper = mountList()
    await nextTick()
    expect(eyeOf(wrapper, 'objects-eye-cube-1').attributes('disabled')).toBeDefined()
  })

  it('the Inspector\'s Parts list carries the same eye, under inspector-part-eye-<part>', async () => {
    const wrapper = mountList({ mode: 'parts', bodyId: 'cube-1' })
    const eye = eyeOf(wrapper, 'inspector-part-eye-Cube 1 B')
    expect(eye.attributes('aria-label')).toBe('Hide Cube 1 B')
    await eye.trigger('click')
    expect(eyeOf(wrapper, 'inspector-part-eye-Cube 1 B').attributes('aria-label')).toBe('Show Cube 1 B')
    expect(wrapper.get('[data-testid="inspector-part-item-Cube 1 B"]').attributes('data-view-hidden')).toBe('true')
  })
})

describe('ViewHiddenNote — "Hidden in the view · Show" (TODO/ui-089)', () => {
  let pinia
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    useDocumentStore().appendAll([structuredClone(cube), structuredClone(split), structuredClone(cylinder)])
  })

  const mountNote = (body) => mount(ViewHiddenNote, { props: { body }, global: { plugins: [pinia] } })

  it('says nothing for a shown body', () => {
    expect(mountNote({ id: 'cyl-1', name: 'Cylinder 1' }).find('[data-testid="inspector-view-hidden"]').exists()).toBe(false)
  })

  it('names a hidden body, and its Show brings it back', async () => {
    useDocumentStore().setViewHidden('cyl-1', { hidden: true })
    const wrapper = mountNote({ id: 'cyl-1', name: 'Cylinder 1' })
    expect(wrapper.get('[data-testid="inspector-view-hidden"]').text()).toBe('Hidden in the view · Show')
    await wrapper.get('[data-testid="inspector-view-hidden-show"]').trigger('click')
    expect(useDocumentStore().bodies.find((body) => body.id === 'cyl-1')).not.toHaveProperty('viewHidden')
    expect(wrapper.find('[data-testid="inspector-view-hidden"]').exists()).toBe(false)
  })

  it('shows for a drilled part that is hidden, and Show brings back that part and its body', async () => {
    const documentStore = useDocumentStore()
    documentStore.setViewHidden('cube-1', { hidden: true })
    documentStore.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: true })
    const body = { id: 'cube-1', name: 'Cube 1 A', subPart: { groupName: 'Cube 1', partName: 'Cube 1 A' } }
    const wrapper = mountNote(body)
    expect(wrapper.find('[data-testid="inspector-view-hidden"]').exists()).toBe(true)
    await wrapper.get('[data-testid="inspector-view-hidden-show"]').trigger('click')
    const summary = documentStore.bodies.find((candidate) => candidate.id === 'cube-1')
    expect(summary).not.toHaveProperty('viewHidden')
    expect(summary).not.toHaveProperty('viewHiddenParts')
  })

  it('says nothing for a drilled part that is drawn, though a sibling is hidden', () => {
    useDocumentStore().setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: true })
    const body = { id: 'cube-1', name: 'Cube 1 B', subPart: { groupName: 'Cube 1', partName: 'Cube 1 B' } }
    expect(mountNote(body).find('[data-testid="inspector-view-hidden"]').exists()).toBe(false)
  })
})
