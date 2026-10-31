// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives teleported DOM through `document.body` queries.
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useDocumentStore } from '../../stores/document.js'
import { useProjectSettingsStore } from '../../stores/projectSettings.js'
import DescriptionHint from './DescriptionHint.vue'

enableAutoUnmount(afterEach)

/** `TODO/ui-091` — the sender's one-line hint in the Share sheet and Save as gist…. */

beforeEach(() => setActivePinia(createPinia()))

describe('DescriptionHint', () => {
  it('with no description invites one and offers Add…', () => {
    const wrapper = mount(DescriptionHint)
    expect(wrapper.get('[data-testid="description-hint-text"]').text()).toBe('Add a description for the people you are sending this to')
    expect(wrapper.get('[data-testid="description-hint-edit"]').text()).toBe('Add…')
  })

  it('with a description shows its first line as plain text and offers Edit…', () => {
    useDocumentStore().setDescription('Fan duct for a **120 mm** fan.\n\nSecond paragraph.')
    const wrapper = mount(DescriptionHint)
    expect(wrapper.get('[data-testid="description-hint-text"]').text()).toBe('People who open this will see: Fan duct for a 120 mm fan.')
    expect(wrapper.get('[data-testid="description-hint-edit"]').text()).toBe('Edit…')
  })

  it('Edit… and Add… emit edit and open Project settings', async () => {
    const settings = useProjectSettingsStore()
    const wrapper = mount(DescriptionHint)
    expect(settings.isOpen).toBe(false)
    await wrapper.get('[data-testid="description-hint-edit"]').trigger('click')
    expect(wrapper.emitted('edit')).toHaveLength(1)
    expect(settings.isOpen).toBe(true)
  })

  it('shows hostile first-line text as inert characters', () => {
    useDocumentStore().setDescription('<img src=x onerror=alert(1)> [x](javascript:alert(1)) @octocat ‮evil')
    const wrapper = mount(DescriptionHint)
    expect(wrapper.find('img, a, [onerror]').exists()).toBe(false)
    const text = wrapper.get('[data-testid="description-hint-line"]').text()
    expect(text).toContain('<img src=x onerror=alert(1)>')
    expect(text).toContain('[x](javascript:alert(1))')
    expect(text).not.toContain('‮')
  })
})
