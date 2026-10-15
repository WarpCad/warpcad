// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — test doubles.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import NameField from './NameField.vue'
import { useDocumentStore } from '../../stores/document.js'

enableAutoUnmount(afterEach)

/**
 * `TODO/ui-056` — the Inspector's inline name field. Pinned here: the commit/revert key
 * contract, blank → generated name with a helper line, the 60-char cap, the non-blocking
 * duplicate hint, and that an unchanged commit is not an Undo step. Reachability and the
 * phone keyboard path are `e2e/rename-part.e2e.js`.
 */
describe('NameField (TODO/ui-056)', () => {
  let pinia
  let doc

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    doc = useDocumentStore()
    doc.append({ id: 'bolt-a', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 12 } })
    doc.append({ id: 'bolt-b', op: 'hardware.bolt', name: 'Bolt 2', params: { spec: 'm10 hex', length: 12 } })
  })

  const mountField = (bodyId = 'bolt-a') => mount(NameField, { props: { bodyId }, global: { plugins: [pinia] } })
  const nameOf = (id) => doc.bodies.find((body) => body.id === id)?.name

  async function startEdit(wrapper) {
    await wrapper.get('[data-testid="inspector-name-edit"]').trigger('click')
    return wrapper.get('[data-testid="inspector-name-input"]')
  }

  it('shows the name as text with an always-visible pencil, and no input until edited', () => {
    const wrapper = mountField()
    expect(wrapper.get('[data-testid="inspector-name"]').text()).toBe('Bolt 1')
    expect(wrapper.get('[data-testid="inspector-name-edit"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="inspector-name-input"]').exists()).toBe(false)
  })

  it('tapping the name itself starts editing, pre-filled', async () => {
    const wrapper = mountField()
    await wrapper.get('[data-testid="inspector-name"]').trigger('click')
    expect(wrapper.get('[data-testid="inspector-name-input"]').element.value).toBe('Bolt 1')
  })

  it('Enter commits one rename record and the name shows at once', async () => {
    const wrapper = mountField()
    const input = await startEdit(wrapper)
    await input.setValue('Pi camera bolt')
    await input.trigger('keydown', { key: 'Enter' })
    expect(nameOf('bolt-a')).toBe('Pi camera bolt')
    expect(doc.raw.records.filter((r) => JSON.parse(JSON.stringify(r)).op === 'style.rename')).toHaveLength(1)
    await nextTick()
    expect(wrapper.find('[data-testid="inspector-name-input"]').exists()).toBe(false)
  })

  it('blur commits', async () => {
    const wrapper = mountField()
    const input = await startEdit(wrapper)
    await input.setValue('Screen bolt')
    await input.trigger('blur')
    expect(nameOf('bolt-a')).toBe('Screen bolt')
  })

  it('Escape reverts, appends nothing, and does not bubble to window listeners', async () => {
    let reached = false
    const onKey = () => {
      reached = true
    }
    window.addEventListener('keydown', onKey)
    try {
      const wrapper = mountField()
      const input = await startEdit(wrapper)
      await input.setValue('Never mind')
      await input.trigger('keydown', { key: 'Escape' })
      await nextTick()
      expect(nameOf('bolt-a')).toBe('Bolt 1')
      expect(wrapper.get('[data-testid="inspector-name"]').text()).toBe('Bolt 1')
      expect(reached).toBe(false)
      // …and the blur that follows the field disappearing must not commit the draft.
      expect(nameOf('bolt-a')).toBe('Bolt 1')
    } finally {
      window.removeEventListener('keydown', onKey)
    }
  })

  it('an unchanged commit is not a mutation', async () => {
    const before = doc.raw.records.length
    const wrapper = mountField()
    const input = await startEdit(wrapper)
    await input.trigger('keydown', { key: 'Enter' })
    expect(doc.raw.records.length).toBe(before)
  })

  it('blank restores the generated name and says so', async () => {
    const wrapper = mountField()
    let input = await startEdit(wrapper)
    await input.setValue('Pi camera bolt')
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    input = await startEdit(wrapper)
    await input.setValue('   ')
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(nameOf('bolt-a')).toBe('Bolt 1')
    expect(wrapper.get('[data-testid="inspector-name-help"]').text()).toMatch(/Bolt 1/)
  })

  it('blank on a never-renamed body appends nothing', async () => {
    const before = doc.raw.records.length
    const wrapper = mountField()
    const input = await startEdit(wrapper)
    await input.setValue('')
    await input.trigger('keydown', { key: 'Enter' })
    expect(doc.raw.records.length).toBe(before)
  })

  it('caps the field at 60 characters', async () => {
    const wrapper = mountField()
    const input = await startEdit(wrapper)
    expect(input.attributes('maxlength')).toBe('60')
  })

  it('a name another object already uses shows a hint and still commits', async () => {
    const wrapper = mountField()
    const input = await startEdit(wrapper)
    await input.setValue('Bolt 2')
    expect(wrapper.get('[data-testid="inspector-name-hint"]').text()).toBe('Another part is already called this')
    await input.trigger('keydown', { key: 'Enter' })
    expect(nameOf('bolt-a')).toBe('Bolt 2')
  })

  it('keeping its own name is not a duplicate', async () => {
    const wrapper = mountField()
    await startEdit(wrapper)
    expect(wrapper.find('[data-testid="inspector-name-hint"]').exists()).toBe(false)
  })

  it('F2 starts editing', async () => {
    const wrapper = mount(NameField, { props: { bodyId: 'bolt-a' }, global: { plugins: [pinia] }, attachTo: document.body })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2' }))
    await nextTick()
    expect(wrapper.find('[data-testid="inspector-name-input"]').exists()).toBe(true)
  })
})
