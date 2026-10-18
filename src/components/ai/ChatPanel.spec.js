// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — DOM test doubles.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import ChatPanel from './ChatPanel.vue'
import { useAiChatStore } from '../../stores/aiChat.js'
import { BROWSER_AGENT_NO_KEY, useAssistantStore } from '../../stores/assistant.js'

enableAutoUnmount(afterEach)

/**
 * `TODO/ui-071`: while the live bridge is `connected` the Assistant shows only its header (the
 * bridge chip) and **Undo AI turn**; the chat body is hidden, not unmounted.
 */

const BODY_IDS = ['assistant-connection', 'ai-transcript', 'ai-composer']

/** @param {import('@vue/test-utils').VueWrapper} wrapper @param {string} id */
function hidden(wrapper, id) {
  const node = wrapper.find(`[data-testid="${id}"]`)
  if (!node.exists()) return false
  for (let el = node.element; el && el !== wrapper.element; el = el.parentElement) {
    if (el.style.display === 'none') return true
  }
  return false
}

function mountPanel(bridge) {
  setActivePinia(createPinia())
  const chat = useAiChatStore()
  const assistant = useAssistantStore()
  chat.bridge = bridge
  assistant.view = 'chat'
  return mount(ChatPanel)
}

describe('ChatPanel while an MCP agent is connected (ui-071)', () => {
  beforeEach(() => {})

  it('hides the connection lines, transcript and composer, but keeps them mounted', () => {
    const wrapper = mountPanel('connected')
    for (const id of BODY_IDS) expect(hidden(wrapper, id), id).toBe(true)
    expect(wrapper.find('[data-testid="ai-bridge-chip"]').text()).toBe('MCP agent · connected')
    expect(wrapper.find('[data-testid="ai-undo-turn"]').exists()).toBe(true)
    expect(wrapper.attributes('data-linked')).toBe('true')
  })

  it.each(['idle', 'off', 'enabled', 'disconnected'])('shows the full chat when the bridge is %s', (bridge) => {
    const wrapper = mountPanel(bridge)
    for (const id of BODY_IDS) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists(), id).toBe(true)
      expect(hidden(wrapper, id), id).toBe(false)
    }
    expect(wrapper.attributes('data-linked')).toBe('false')
  })

  it('brings the chat back when the bridge disconnects', async () => {
    const wrapper = mountPanel('connected')
    useAiChatStore().bridge = 'disconnected'
    await nextTick()
    for (const id of BODY_IDS) expect(hidden(wrapper, id), id).toBe(false)
  })
})

describe('ChatPanel with Browser agents and no key (ai-024)', () => {
  /** @param {Partial<{ bridge: string, webMcp: 'on' | 'off', webMcpVisible: boolean, webMcpTools: number }>} state */
  function mountKeyless(state) {
    setActivePinia(createPinia())
    const chat = useAiChatStore()
    const assistant = useAssistantStore()
    chat.bridge = state.bridge ?? 'unavailable'
    chat.webMcpApi = 'document'
    chat.webMcp = state.webMcp ?? 'on'
    chat.webMcpVisible = state.webMcpVisible ?? true
    chat.webMcpTools = state.webMcpTools ?? 27
    assistant.view = 'chat'
    return mount(ChatPanel)
  }

  it('the header and the disabled composer say the same true thing, from one string', () => {
    const wrapper = mountKeyless({})
    const header = wrapper.find('[data-testid="assistant-connection-text"]').text()
    const reason = wrapper.find('[data-testid="ai-composer-reason"]').text()
    expect(header).toBe(BROWSER_AGENT_NO_KEY)
    expect(reason).toBe(header)
    expect(header).not.toMatch(/optional/)
    expect(header.length).toBeLessThanOrEqual(120)
  })

  it('the chip counts the tools and carries the diagnostic', () => {
    const wrapper = mountKeyless({})
    const chip = wrapper.find('[data-testid="ai-webmcp-switch"]')
    expect(chip.text()).toBe('Browser agents · on — 27 tools')
    expect(chip.attributes('data-webmcp')).toBe('api=document; enabled=on; visible=yes; registered=27; failed=[]')
  })

  it('a hidden tab: the chip says so rather than a bare on', () => {
    const wrapper = mountKeyless({ webMcpVisible: false, webMcpTools: 0 })
    const chip = wrapper.find('[data-testid="ai-webmcp-switch"]')
    expect(chip.text()).toBe('Browser agents · on, but the tab is hidden')
    expect(chip.attributes('data-webmcp')).toBe('api=document; enabled=on; visible=no; registered=0; failed=[]')
    expect(chip.attributes('aria-checked')).toBe('true')
  })

  it('switched off: the composer gives the same reason as the header', () => {
    const wrapper = mountKeyless({ webMcp: 'off', webMcpTools: 0 })
    const header = wrapper.find('[data-testid="assistant-connection-text"]').text()
    expect(header).toMatch(/Browser agents are off/)
    expect(wrapper.find('[data-testid="ai-composer-reason"]').text()).toBe(header)
  })
})
