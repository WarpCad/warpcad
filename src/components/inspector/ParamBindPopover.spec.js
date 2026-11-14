// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — test doubles.
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { resetOverlayStack } from '../../composables/useOverlayStack.js'
import { useVariablesUiStore } from '../../stores/variablesUi.js'
import ParamBindPopover from './ParamBindPopover.vue'

enableAutoUnmount(afterEach)

/**
 * `TODO/ui-116`: the bind list is inline in its field from tablet width and a non-modal
 * `BaseSheet` at phone width. The flow itself is `VariableBinding.spec.js` and `e2e/variables.e2e.js`.
 */
function phone(matches) {
  window.matchMedia = vi.fn((query) => ({ matches, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
}

const props = { recordId: 'r1', path: 'size.0', bindSlot: { kind: 'number', unit: 'mm' }, label: 'Width', value: 10 }
const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => resetOverlayStack())

describe('ParamBindPopover frame', () => {
  it('is inline in the field above phone width: no dialog, inside the wrapper', async () => {
    phone(false)
    const wrapper = mount(ParamBindPopover, { props, attachTo: document.body })
    await nextTick()
    expect(wrapper.find('[data-testid="param-bind-popover"]').exists()).toBe(true)
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('is a non-modal bottom sheet at phone width, and Escape closes it', async () => {
    phone(true)
    const ui = useVariablesUiStore()
    ui.popoverKey = 'size.0'
    mount(ParamBindPopover, { props, attachTo: document.body })
    await nextTick()
    const sheet = document.body.querySelector('[data-testid="param-bind-popover"]')
    expect(sheet.getAttribute('role')).toBe('dialog')
    expect(sheet.getAttribute('data-modal')).toBe('false')
    expect(document.body.querySelector('[data-testid="param-bind-popover-backdrop"]')).toBeNull()
    escape()
    expect(ui.popoverKey).toBe('')
  })
})
