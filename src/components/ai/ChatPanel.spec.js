// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — DOM test doubles.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import ChatPanel from './ChatPanel.vue'
import { useAiChatStore } from '../../stores/aiChat.js'
import { useAssistantStore } from '../../stores/assistant.js'

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
