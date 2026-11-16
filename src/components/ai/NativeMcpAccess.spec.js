// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — DOM test doubles.
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useAiChatStore } from '../../stores/aiChat.js'
import NativeMcpAccess from './NativeMcpAccess.vue'

enableAutoUnmount(afterEach)

/**
 * `TODO/ai-036` item 3: the native app's server is plain HTTP, so the address and the token cross
 * the Wi-Fi unencrypted. The sheet says so under the switch, before the user turns it on.
 */

beforeEach(() => {
  setActivePinia(createPinia())
})

/** @param {Partial<ReturnType<typeof useAiChatStore>['nativeMcp']>} nativeMcp */
function mountSheet(nativeMcp = {}) {
  const chat = useAiChatStore()
  chat.nativeMcp = { native: true, lan: false, url: 'http://127.0.0.1:5184/mcp', lanUrl: '', token: '', lanError: '', ...nativeMcp }
  return mount(NativeMcpAccess, { props: { enabled: true, lease: 'unlimited' } })
}

describe('Allow devices on this Wi-Fi', () => {
  it('says the address and token are sent unencrypted, so only on a network you trust, while the switch is still off', () => {
    const wrapper = mountSheet()
    const warning = wrapper.find('[data-testid="ai-connect-lan-unencrypted"]')
    expect(warning.exists()).toBe(true)
    expect(warning.text()).toMatch(/unencrypted/)
    expect(warning.text()).toMatch(/network you trust/)
    expect(warning.text()).toMatch(/not a café or conference/)
  })

  it('keeps saying it once the switch is on and the token shows', () => {
    const wrapper = mountSheet({ lan: true, lanUrl: 'http://192.168.1.20:5184/mcp', token: 'ab'.repeat(32) })
    expect(wrapper.find('[data-testid="ai-connect-token"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="ai-connect-lan-unencrypted"]').text()).toMatch(/unencrypted/)
  })
})
