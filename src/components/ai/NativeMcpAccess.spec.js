// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — DOM test doubles.
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

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

  // TODO/ai-043 (Gate 1 F1): "it did not work" on the iPad, with nothing recorded about the screen.
  it('when the host refuses the switch, the reason shows as an alert and no address, token or command does', () => {
    const reason = 'This device’s traffic goes through a VPN (utun3), so WarpCad will not open its MCP port there and Allow devices on this Wi-Fi is off.'
    const wrapper = mountSheet({ lan: false, lanError: reason })
    const error = wrapper.find('[data-testid="ai-connect-lan-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toBe(reason)
    expect(error.attributes('role')).toBe('alert')
    expect(error.classes()).toContain('lan__error')
    for (const id of ['ai-connect-lan-url', 'ai-connect-token', 'ai-connect-copy-cmd', 'ai-connect-rotate']) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists(), id).toBe(false)
    }
  })

  it('the switch reads what the host answered, not the tap, when the host refuses it', async () => {
    const wrapper = mountSheet()
    const chat = useAiChatStore()
    const input = wrapper.find('[data-testid="ai-connect-lan"]')
    await input.setValue(true)
    // The host answers: the Wi-Fi half stayed off, and why.
    chat.nativeMcp = { ...chat.nativeMcp, lan: false, lanUrl: '', token: '', lanError: 'WarpCad found no Wi-Fi address on this device.' }
    await nextTick()
    expect(/** @type {HTMLInputElement} */ (input.element).checked).toBe(false)
  })
})
