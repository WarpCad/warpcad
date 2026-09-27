// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'

import AlignToOrigin from './AlignToOrigin.vue'
import { useDocumentStore } from '../../stores/document.js'
import { useSelectionStore } from '../../stores/selection.js'

enableAutoUnmount(afterEach)

/**
 * The Inspector's Align-to-origin row (`TODO/ui-050`), tested at the component
 * level — the precondition/absent gating and the shortcut's one-record claim.
 * The actual translate arithmetic is `src/core/transform.js`'s own contract,
 * covered exhaustively in `transform.spec.js`; this file only has to prove the
 * component wires selection state and a tap to that function correctly.
 */
describe('AlignToOrigin (TODO/ui-050)', () => {
  /** @type {ReturnType<typeof useDocumentStore>} */
  let documentStore
  /** @type {ReturnType<typeof useSelectionStore>} */
  let selection

  beforeEach(() => {
    setActivePinia(createPinia())
    documentStore = useDocumentStore()
    selection = useSelectionStore()
  })

  function placeCube(id = 'cube-1') {
    documentStore.append(
      { id, op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40], center: [12, -7, 33] } },
      { origin: 'local' },
    )
  }

  function placePi(id = 'pi-1') {
    documentStore.append(
      { id, op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: { model: 4 } },
      { origin: 'local' },
    )
    documentStore.append(
      { id: `${id}-move`, op: 'transform.translate', target: id, supersedes: id, params: { vector: [50, -30, 25], rotation: [0, 0, 0] } },
      { origin: 'local' },
    )
  }

  it('is absent (not disabled) with nothing selected', () => {
    placeCube()
    const wrapper = mount(AlignToOrigin)
    expect(wrapper.find('[data-testid="align-origin-row"]').exists()).toBe(false)
  })

  it('is absent with two or more selected', () => {
    placeCube('cube-1')
    placeCube('cube-2')
    selection.selectMany(['cube-1', 'cube-2'])
    const wrapper = mount(AlignToOrigin)
    expect(wrapper.find('[data-testid="align-origin-row"]').exists()).toBe(false)
  })

  it('is absent at sub-part depth — the Transform section is frozen there', () => {
    placePi()
    selection.select('pi-1')
    selection.drillInto('mb')
    const wrapper = mount(AlignToOrigin)
    expect(wrapper.find('[data-testid="align-origin-row"]').exists()).toBe(false)
  })

  it('is present with exactly one whole body selected', () => {
    placeCube()
    selection.select('cube-1')
    const wrapper = mount(AlignToOrigin)
    expect(wrapper.find('[data-testid="align-origin-row"]').exists()).toBe(true)
  })

  it('hides the Reference select for a bare solid with no named parts', () => {
    placeCube()
    selection.select('cube-1')
    const wrapper = mount(AlignToOrigin)
    expect(wrapper.find('[data-testid="align-origin-reference"]').exists()).toBe(false)
  })

  it('shows the Reference select, with one option per visible part, for a group', () => {
    placePi()
    selection.select('pi-1')
    const wrapper = mount(AlignToOrigin)
    const select = wrapper.find('[data-testid="align-origin-reference"]')
    expect(select.exists()).toBe(true)
    const options = select.findAll('option').map((option) => option.attributes('value'))
    expect(options).toContain('mb')
    expect(options).not.toContain('clearance-ethernet')
  })

  it('the shortcut commits exactly one record, not three', async () => {
    placeCube()
    selection.select('cube-1')
    const wrapper = mount(AlignToOrigin)
    const before = documentStore.raw.records.length

    await wrapper.find('[data-testid="align-origin-drop"]').trigger('click')

    expect(documentStore.raw.records.length).toBe(before + 1)
    const record = documentStore.raw.records[documentStore.raw.records.length - 1]
    expect(record.op).toBe('transform.translate')
    expect(record.params?.alignedTo).toBe(true)
  })

  it('an axis/mode tap commits one record scoped to that axis only', async () => {
    placeCube()
    selection.select('cube-1')
    const wrapper = mount(AlignToOrigin)
    const before = documentStore.raw.records.length

    await wrapper.find('[data-testid="align-origin-z-min"]').trigger('click')

    expect(documentStore.raw.records.length).toBe(before + 1)
    const record = documentStore.raw.records[documentStore.raw.records.length - 1]
    expect(record.params?.vector[0]).toBe(0)
    expect(record.params?.vector[1]).toBe(0)
    expect(record.params?.vector[2]).not.toBe(0)
  })

  it('a no-op tap appends nothing', async () => {
    placeCube('cube-1') // center z = 33, size 40 -> min z already... not aligned yet
    selection.select('cube-1')
    const wrapper = mount(AlignToOrigin)
    await wrapper.find('[data-testid="align-origin-z-min"]').trigger('click')
    const afterFirst = documentStore.raw.records.length

    await wrapper.find('[data-testid="align-origin-z-min"]').trigger('click')
    expect(documentStore.raw.records.length).toBe(afterFirst)
  })
})
