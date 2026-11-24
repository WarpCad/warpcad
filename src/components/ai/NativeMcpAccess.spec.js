// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — DOM test doubles.
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { useAiChatStore } from '../../stores/aiChat.js'
import NativeMcpAccess from './NativeMcpAccess.vue'
import StarterCopy from './StarterCopy.vue'

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
  chat.nativeMcp = { native: true, lan: false, url: 'http://127.0.0.1:5184/mcp', lanUrl: '', token: '', lanError: '', loopbackNeedsToken: false, ...nativeMcp }
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

/**
 * `TODO/ai-042`: on iOS and Android the host requires the token from a loopback client too. The
 * sheet then shows the token beside this device's loopback address, with a `claude mcp add` line
 * that carries the header, even while the Wi-Fi switch is off. On a Mac nothing changes.
 */
describe('the token on this device (loopback)', () => {
  const TOKEN = 'cd'.repeat(32)
  /** @param {any} wrapper @param {string} testid */
  const copied = (wrapper, testid) => wrapper.findAllComponents(StarterCopy).find((c) => c.props('testid') === testid)?.props('text')

  it('shows the loopback address, the token and a command with the Authorization header when the host requires it', () => {
    const wrapper = mountSheet({ loopbackNeedsToken: true, token: TOKEN })
    const row = wrapper.find('[data-testid="ai-connect-loopback-row"]')
    expect(row.exists()).toBe(true)
    expect(row.find('[data-testid="ai-connect-loopback-url"]').text()).toBe('http://127.0.0.1:5184/mcp')
    expect(row.find('[data-testid="ai-connect-loopback-token"]').text()).toBe(TOKEN)
    expect(row.text()).toMatch(/needs this token/)
    expect(copied(wrapper, 'ai-connect-copy-loopback-token')).toBe(TOKEN)
    expect(copied(wrapper, 'ai-connect-copy-loopback-cmd')).toBe(`claude mcp add --transport http warpcad http://127.0.0.1:5184/mcp --header "Authorization: Bearer ${TOKEN}"`)
    // The Wi-Fi half is still off: its address, token and command stay hidden.
    for (const id of ['ai-connect-lan-url', 'ai-connect-token', 'ai-connect-copy-cmd']) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists(), id).toBe(false)
    }
  })

  it('shows nothing new when the host trusts loopback (Mac and Windows)', () => {
    const wrapper = mountSheet({ loopbackNeedsToken: false, lan: true, lanUrl: 'http://192.168.1.20:5184/mcp', token: TOKEN })
    expect(wrapper.find('[data-testid="ai-connect-loopback-row"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ai-connect-token"]').text()).toBe(TOKEN)
  })

  it('shows nothing while the server is closed, even under the mobile rule', () => {
    const wrapper = mountSheet({ loopbackNeedsToken: true, url: '', token: '' })
    expect(wrapper.find('[data-testid="ai-connect-loopback-row"]').exists()).toBe(false)
  })
})
