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

/**
 * `TODO/ui-094` — part mode: the same field names one part of a Group. Blank keeps the old name,
 * a duplicate is refused in place, Escape reverts, and a commit is one `group.renamePart`.
 */
describe('NameField, naming a part of a group (TODO/ui-094)', () => {
  let pinia
  let doc

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    doc = useDocumentStore()
    const cube = (id, name, x) => ({ id, op: 'primitive.cuboid', name, params: { size: [10, 10, 10], center: [x, 0, 5] } })
    doc.appendAll([
      cube('a', 'Cube 1', 0),
      cube('b', 'Cube 2', 30),
      { id: 'g', op: 'group.assemble', name: 'Group 1', target: 'a', operands: ['b'], consumes: ['a', 'b'], params: { names: ['Cube 1', 'Cube 2'] } },
    ])
  })

  const mountPart = (partName = 'Cube 2') => mount(NameField, { props: { bodyId: 'g', partName }, global: { plugins: [pinia] } })
  const partsOf = () => doc.bodies.find((body) => body.id === 'g')?.partNames
  const renames = () => doc.raw.records.filter((r) => JSON.parse(JSON.stringify(r)).op === 'group.renamePart')

  async function startEdit(wrapper) {
    await wrapper.get('[data-testid="inspector-name-edit"]').trigger('click')
    return wrapper.get('[data-testid="inspector-name-input"]')
  }

  it('shows the part’s name with the pencil, and Enter renames it in place', async () => {
    const wrapper = mountPart()
    expect(wrapper.get('[data-testid="inspector-name"]').text()).toBe('Cube 2')
    const input = await startEdit(wrapper)
    expect(input.element.value).toBe('Cube 2')
    expect(input.attributes('maxlength')).toBe('80')
    await input.setValue('  Lid ')
    await input.trigger('keydown', { key: 'Enter' })
    expect(partsOf()).toEqual(['Cube 1', 'Lid'])
    expect(renames()).toHaveLength(1)
  })

  it('blur commits', async () => {
    const wrapper = mountPart()
    const input = await startEdit(wrapper)
    await input.setValue('Lid')
    await input.trigger('blur')
    expect(partsOf()).toEqual(['Cube 1', 'Lid'])
  })

  it('Escape reverts, writes nothing and is swallowed', async () => {
    const wrapper = mountPart()
    const input = await startEdit(wrapper)
    await input.setValue('Lid')
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    input.element.dispatchEvent(event)
    await nextTick()
    expect(event.defaultPrevented).toBe(true)
    expect(partsOf()).toEqual(['Cube 1', 'Cube 2'])
    expect(wrapper.find('[data-testid="inspector-name-input"]').exists()).toBe(false)
  })

  it('blank keeps the old name, writes nothing, and says a part needs a name', async () => {
    const wrapper = mountPart()
    const input = await startEdit(wrapper)
    await input.setValue('   ')
    await input.trigger('keydown', { key: 'Enter' })
    expect(partsOf()).toEqual(['Cube 1', 'Cube 2'])
    expect(renames()).toHaveLength(0)
    expect(wrapper.get('[data-testid="inspector-name-help"]').text()).toBe('A part needs a name')
  })

  it('a duplicate is refused in the helper line, with the field left open on what was typed', async () => {
    const wrapper = mountPart()
    const input = await startEdit(wrapper)
    await input.setValue('Cube 1')
    await input.trigger('keydown', { key: 'Enter' })
    expect(renames()).toHaveLength(0)
    expect(wrapper.get('[data-testid="inspector-name-help"]').text()).toBe('This group already has a part called Cube 1 — "Cube 1 1" is free')
    expect(wrapper.get('[data-testid="inspector-name-input"]').element.value).toBe('Cube 1')
  })

  it('an unchanged name writes nothing', async () => {
    const wrapper = mountPart()
    const input = await startEdit(wrapper)
    await input.trigger('keydown', { key: 'Enter' })
    expect(renames()).toHaveLength(0)
  })
})
