// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — test doubles.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import Inspector from './Inspector.vue'
import { useVariableCommands } from '../../composables/useVariableCommands.js'
import { useDocumentStore } from '../../stores/document.js'
import { useSelectionStore } from '../../stores/selection.js'

enableAutoUnmount(afterEach)

/**
 * `TODO/ui-059` at component level: which controls the Inspector shows for a bound or
 * bindable field, and that a bound field is never an editor. The real, assembled flow —
 * a person on `/` at three viewports — is `e2e/variables.e2e.js`.
 */
describe('Inspector — variables (TODO/ui-059)', () => {
  let pinia
  let doc
  let selection
  let commands

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    doc = useDocumentStore()
    selection = useSelectionStore()
    commands = useVariableCommands()
    doc.append({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 4 } }, { origin: 'local' })
    doc.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 20, 30], center: [60, 0, 5] } }, { origin: 'local' })
  })

  const mountInspector = () => mount(Inspector, { global: { plugins: [pinia] } })

  it('with nothing selected the Variables section is there, empty, with its + control', () => {
    const wrapper = mountInspector()
    expect(wrapper.find('[data-testid="inspector-variables"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="variable-add"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="variables-empty"]').text()).toMatch(/No variables yet/)
  })

  it('a bindable field has a bind control; a number-only vector offers one per component', async () => {
    selection.select('cube-1')
    const wrapper = mountInspector()
    await nextTick()
    for (const axis of ['x', 'y', 'z']) expect(wrapper.find(`[data-testid="param-bind-size-${axis}"]`).exists()).toBe(true)
  })

  it('a choice param gets a bind control beside its dropdown', async () => {
    selection.select('pi-1')
    const wrapper = mountInspector()
    await nextTick()
    expect(wrapper.find('[data-testid="inspector-param-model"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="param-bind-model"]').exists()).toBe(true)
  })

  it('a bound field is a chip with the variable name and its read-only value — no editor', async () => {
    commands.bindToNew('pi-1', 'model', {
      name: 'piModel',
      kind: 'enum',
      value: 4,
      options: [{ value: 4, label: 'Pi 4' }, { value: 5, label: 'Pi 5' }],
    })
    selection.select('pi-1')
    const wrapper = mountInspector()
    await nextTick()
    const chip = wrapper.get('[data-testid="param-chip-model"]')
    expect(chip.attributes('data-variable')).toBe('piModel')
    expect(chip.get('[data-testid="param-chip-value"]').text()).toBe('Pi 4')
    expect(wrapper.find('[data-testid="inspector-param-model"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="param-bind-model"]').exists()).toBe(false)
    // The rest of the Pi's params are still ordinary fields.
    expect(wrapper.find('[data-testid="param-bind-clearance"]').exists()).toBe(true)
  })

  it('one component bound keeps the other two editable, each with its own bind control', async () => {
    commands.define({ name: 'wall', kind: 'number', value: 10, unit: 'mm' })
    commands.bind('cube-1', 'size.0', 'wall')
    selection.select('cube-1')
    const wrapper = mountInspector()
    await nextTick()
    expect(wrapper.get('[data-testid="param-chip-size-x"]').attributes('data-variable')).toBe('wall')
    expect(wrapper.find('[data-testid="inspector-param-size-x"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="inspector-param-size-y"]').element.value).toBe('20')
    expect(wrapper.find('[data-testid="param-bind-size-x"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="param-bind-size-y"]').exists()).toBe(true)
  })

  it('a field that is text, not a number or a choice, has no bind control', async () => {
    doc.append({ id: 'label-1', op: 'text.label', name: 'Label 1', params: { text: 'HELLO', size: 8, strokeWidth: 1.5, height: 2 } }, { origin: 'local' })
    selection.select('label-1')
    const wrapper = mountInspector()
    await nextTick()
    expect(wrapper.find('[data-testid="inspector-param-text"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="param-bind-text"]').exists()).toBe(false)
  })

  it('the bind popover offers New variable first, then only variables of the right kind', async () => {
    commands.define({ name: 'wall', kind: 'number', value: 10, unit: 'mm' })
    commands.define({ name: 'flag', kind: 'boolean', value: true })
    selection.select('cube-1')
    const wrapper = mountInspector()
    await nextTick()
    await wrapper.get('[data-testid="param-bind-size-y"]').trigger('click')
    const popover = wrapper.get('[data-testid="param-bind-popover"]')
    const labels = popover.findAll('button').map((node) => node.attributes('data-testid'))
    expect(labels[0]).toBe('param-bind-new')
    expect(labels).toContain('param-bind-option-wall')
    expect(labels).not.toContain('param-bind-option-flag')
  })

  it('New variable from this value creates it seeded with the field value, binds it, and shows the chip', async () => {
    selection.select('cube-1')
    const wrapper = mountInspector()
    await nextTick()
    await wrapper.get('[data-testid="param-bind-size-y"]').trigger('click')
    await wrapper.get('[data-testid="param-bind-new"]').trigger('click')
    const name = wrapper.get('[data-testid="param-bind-new-name"]')
    expect(name.element.value).toBe('sizeY')
    await name.setValue('depth')
    await wrapper.get('[data-testid="param-bind-new-create"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="param-chip-size-y"]').attributes('data-variable')).toBe('depth')
    expect(wrapper.get('[data-testid="variable-row-depth"]').attributes('data-value')).toBe('20')
    expect(wrapper.get('[data-testid="variable-used-depth"]').text()).toBe('used by 1')
  })

  it("a refusal from core is shown as-is in the popover, and nothing is written", async () => {
    commands.define({ name: 'tiny', kind: 'number', value: 1, unit: 'mm' })
    selection.select('cube-1')
    const before = doc.raw.entries.length
    const wrapper = mountInspector()
    await nextTick()
    await wrapper.get('[data-testid="param-bind-size-y"]').trigger('click')
    await wrapper.get('[data-testid="param-bind-new"]').trigger('click')
    await wrapper.get('[data-testid="param-bind-new-name"]').setValue('tiny')
    await wrapper.get('[data-testid="param-bind-new-create"]').trigger('click')
    expect(wrapper.get('[data-testid="param-bind-error"]').text()).toMatch(/already defined/)
    expect(doc.raw.entries.length).toBe(before)
  })

  it('Unbind puts the current literal back', async () => {
    commands.define({ name: 'wall', kind: 'number', value: 10, unit: 'mm' })
    commands.bind('cube-1', 'size.0', 'wall')
    selection.select('cube-1')
    const wrapper = mountInspector()
    await nextTick()
    await wrapper.get('[data-testid="param-chip-size-x"] [data-testid="param-chip-toggle"]').trigger('click')
    await wrapper.get('[data-testid="param-chip-unbind"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="param-chip-size-x"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="inspector-param-size-x"]').element.value).toBe('10')
  })

  it('changing a value in the panel updates every bound chip and states the blast radius', async () => {
    commands.define({ name: 'wall', kind: 'number', value: 10, unit: 'mm' })
    commands.bind('cube-1', 'size.0', 'wall')
    selection.select('cube-1')
    const wrapper = mountInspector()
    await nextTick()
    const input = wrapper.get('[data-testid="variable-value-wall"]')
    await input.setValue('14')
    await input.trigger('blur')
    await nextTick()
    expect(wrapper.get('[data-testid="param-chip-size-x"] [data-testid="param-chip-value"]').text()).toBe('14')
    expect(wrapper.get('[data-testid="variable-announcement"]').text()).toBe('wall 10 mm → 14 mm — 1 parameter on 1 part changed')
  })

  it('a body with no condition offers Only when a variable… once a choice variable exists', async () => {
    selection.select('cube-1')
    const wrapper = mountInspector()
    await nextTick()
    expect(wrapper.find('[data-testid="inspector-condition"]').exists()).toBe(false)
    commands.bindToNew('pi-1', 'model', { name: 'piModel', kind: 'enum', value: 4, options: [{ value: 4, label: 'Pi 4' }, { value: 5, label: 'Pi 5' }] })
    await nextTick()
    await wrapper.get('[data-testid="inspector-condition-add"]').trigger('click')
    await wrapper.get('[data-testid="inspector-condition-option-4"]').setValue(true)
    await wrapper.get('[data-testid="inspector-condition-save"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="inspector-condition-text"]').text()).toMatch(/piModel is Pi 4/)
  })
})
