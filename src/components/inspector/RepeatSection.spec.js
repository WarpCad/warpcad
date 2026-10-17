// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — DOM test doubles.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import Inspector from './Inspector.vue'
import { piBoltRepeated } from '../../core/__fixtures__/piScenes.js'
import { useDocumentStore } from '../../stores/document.js'
import { useSelectionStore } from '../../stores/selection.js'

enableAutoUnmount(afterEach)

/**
 * A repeat body in the Inspector (`TODO/ui-069`, the controls for `TODO/core-061` decisions 6–8):
 * its source line, **Go to Bolt 1**, **Detach**, read-only Parameters, frozen Position and
 * Rotation with the move refusal in the gizmo's place (`core-061`'s handoff: an edit there used
 * to throw an uncaught page error), **Remove this repeat** on one member, and the question
 * Delete asks about a body the repeats follow.
 */
describe('Inspector — a repeat body (TODO/ui-069)', () => {
  let pinia
  let documentStore
  let selection

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    documentStore = useDocumentStore()
    selection = useSelectionStore()
    documentStore.load(piBoltRepeated().entries.map((entry) => ({ ...entry })))
  })

  const mountInspector = () => mount(Inspector, { global: { plugins: [pinia] } })

  it('says what it repeats, freezes Position and Rotation, and shows the refusal instead of a move', async () => {
    selection.select('rep-1')
    const wrapper = mountInspector()
    await nextTick()
    expect(wrapper.get('[data-testid="inspector-repeat-source"]').text()).toBe(
      "Repeats Bolt 1 on Raspberry Pi 1's hole2, hole3 and hole4. Edit Bolt 1 and every repeat follows.",
    )
    for (const axis of ['x', 'y', 'z']) {
      expect(wrapper.get(`[data-testid="inspector-position-${axis}"]`).attributes('readonly')).toBeDefined()
      expect(wrapper.get(`[data-testid="inspector-rotation-${axis}"]`).attributes('readonly')).toBeDefined()
    }
    expect(wrapper.get('[data-testid="inspector-transform-note"]').text()).toMatch(
      /^Move Bolt 1 or Raspberry Pi 1; the repeats follow them\./,
    )
    // A typed value commits nothing and throws nothing.
    const before = documentStore.raw.entries.length
    const field = wrapper.get('[data-testid="inspector-position-x"]')
    await field.trigger('focus')
    field.element.value = '99'
    await field.trigger('blur')
    expect(documentStore.raw.entries.length).toBe(before)
    expect(wrapper.find('[data-testid="inspector-transform-error"]').exists()).toBe(false)
  })

  it('Parameters are the source’s, read-only, with a note pointing at the source', async () => {
    selection.select('rep-1')
    const wrapper = mountInspector()
    await nextTick()
    expect(wrapper.get('[data-testid="inspector-params"]').attributes('data-editable')).toBe('false')
    expect(wrapper.get('[data-testid="inspector-params-repeat-note"]').text()).toMatch(/^These are Bolt 1's\./)
  })

  it('Go to Bolt 1 selects the source', async () => {
    selection.select('rep-1')
    const wrapper = mountInspector()
    await nextTick()
    await wrapper.get('[data-testid="repeat-goto-source"]').trigger('click')
    expect(selection.ids).toEqual(['bolt-1'])
  })

  it('Detach turns the repeat into three bodies — one Undo step — and selects them', async () => {
    selection.select('rep-1')
    const wrapper = mountInspector()
    await nextTick()
    await wrapper.get('[data-testid="repeat-detach"]').trigger('click')
    expect(documentStore.bodies.some((body) => body.id === 'rep-1')).toBe(false)
    expect(selection.ids).toHaveLength(3)
    expect(documentStore.undo().ok).toBe(true)
    expect(documentStore.bodies.some((body) => body.id === 'rep-1')).toBe(true)
  })

  it('drilled into one member, the button reads Remove this repeat and removes just that one', async () => {
    selection.select('rep-1')
    selection.drillInto('hole3')
    const wrapper = mountInspector()
    await nextTick()
    expect(wrapper.get('[data-testid="inspector-repeat-member"]').text()).toMatch(/^The repeat on hole3/)
    expect(wrapper.find('[data-testid="repeat-detach"]').exists()).toBe(false)
    const button = wrapper.get('[data-testid="inspector-remove-part"]')
    expect(button.text()).toBe('Remove this repeat')
    await button.trigger('click')
    expect(documentStore.raw.recordOf('rep-1').params.targets).toEqual(['hole2', 'hole4'])
  })

  it('Delete on the source asks first; Leave broken deletes it and keeps the repeat row broken', async () => {
    selection.select('bolt-1')
    const wrapper = mountInspector()
    await nextTick()
    await wrapper.get('[data-testid="inspector-delete"]').trigger('click')
    expect(wrapper.get('[data-testid="delete-repeats-question"]').text()).toBe(
      'Bolt 1 ×3 follows Bolt 1. Delete the repeats too, or leave them broken?',
    )
    expect(wrapper.find('[data-testid="inspector-delete-error"]').exists()).toBe(false)
    await wrapper.get('[data-testid="delete-repeats-leave-broken"]').trigger('click')
    expect(documentStore.bodies.some((body) => body.id === 'bolt-1')).toBe(false)
    expect(documentStore.raw.brokenSteps().map((step) => step.id)).toContain('rep-1')
  })
})
