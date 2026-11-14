// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — test doubles.
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { resetOverlayStack } from '../../composables/useOverlayStack.js'
import FormulaInsertList from './FormulaInsertList.vue'

enableAutoUnmount(afterEach)

/** `TODO/ui-116`: inline from tablet width, a non-modal `BaseSheet` at phone width. */
function phone(matches) {
  window.matchMedia = vi.fn((query) => ({ matches, media: query, addEventListener: () => {}, removeEventListener: () => {} }))
}
const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => resetOverlayStack())

describe('FormulaInsertList frame', () => {
  it('is an inline group above phone width', async () => {
    phone(false)
    const wrapper = mount(FormulaInsertList, { attachTo: document.body })
    await nextTick()
    expect(wrapper.get('[data-testid="formula-insert-list"]').attributes('role')).toBe('group')
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('is a non-modal sheet at phone width and Escape asks to close it', async () => {
    phone(true)
    const wrapper = mount(FormulaInsertList, { attachTo: document.body })
    await nextTick()
    const sheet = document.body.querySelector('[data-testid="formula-insert-list"]')
    expect(sheet.getAttribute('role')).toBe('dialog')
    expect(sheet.getAttribute('data-modal')).toBe('false')
    escape()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
