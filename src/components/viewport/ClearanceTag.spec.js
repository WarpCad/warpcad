// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — test doubles.
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

enableAutoUnmount(afterEach)

import { useDocumentStore } from '../../stores/document.js'
import { useHiddenPartVisibilityStore } from '../../stores/hiddenPartVisibility.js'
import ClearanceTag from './ClearanceTag.vue'

/**
 * `TODO/ui-153` item 1: the red ghost a shown clearance draws in the 3D view is named in the view itself,
 * not only on the Objects row, and in plain words.
 */
describe('ClearanceTag (TODO/ui-153)', () => {
  let pinia
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    const doc = useDocumentStore()
    doc.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: {} })
    doc.append({ id: 'c', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } })
  })
  const mountTag = () => mount(ClearanceTag, { global: { plugins: [pinia] } })

  it('draws nothing while no body shows its hidden parts', () => {
    expect(mountTag().find('[data-testid="viewport-clearance-tag"]').exists()).toBe(false)
  })

  it('says the red ghost is room kept clear, not a part, and names the body', async () => {
    const wrapper = mountTag()
    useHiddenPartVisibilityStore().show('pi')
    await nextTick()
    const tag = wrapper.get('[data-testid="viewport-clearance-tag"]')
    expect(tag.text()).toMatch(/not a real part/i)
    expect(tag.text()).toContain('Red area: space kept free around Raspberry Pi B+')
    expect(tag.text()).not.toMatch(/ghost|room kept clear/i)
    expect(tag.text()).toContain('Raspberry Pi B+')
    expect(tag.attributes('role')).toBe('status')
  })

  it('ignores a shown body that has no hidden parts, and goes away when hidden again', async () => {
    const wrapper = mountTag()
    const store = useHiddenPartVisibilityStore()
    store.show('c')
    await nextTick()
    expect(wrapper.find('[data-testid="viewport-clearance-tag"]').exists()).toBe(false)
    store.show('pi')
    await nextTick()
    expect(wrapper.find('[data-testid="viewport-clearance-tag"]').exists()).toBe(true)
    store.hide('pi')
    await nextTick()
    expect(wrapper.find('[data-testid="viewport-clearance-tag"]').exists()).toBe(false)
  })

  it('is pointer-transparent, so it never swallows a tap meant for the canvas', () => {
    useHiddenPartVisibilityStore().show('pi')
    const wrapper = mountTag()
    expect(wrapper.get('[data-testid="viewport-clearance-tag"]').classes()).toContain('clearance-tag')
  })
})
