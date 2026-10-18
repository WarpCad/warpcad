// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — DOM test doubles.
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { useAiChatStore } from '../../stores/aiChat.js'
import { useAssistantStore } from '../../stores/assistant.js'
import { useHelpStore } from '../../stores/help.js'
import ConnectClaudeCode from './ConnectClaudeCode.vue'

enableAutoUnmount(afterEach)

/**
 * `TODO/ai-024`: the **Live MCP access** dialog on a copy that cannot use it (the hosted app) is
 * not a dead end that says "run npm run dev": it says what the dialog is for, points at **Browser
 * agents** (the switch and its page) and at the file route. On the dev host it names the endpoint
 * an MCP client connects to, so an agent can check it has the right address.
 */

const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)

/** @param {{ bridge: string, webMcp?: 'unavailable' | 'on' | 'off' }} state */
async function openDialog(state) {
  const chat = useAiChatStore()
  chat.bridge = state.bridge
  chat.webMcp = state.webMcp ?? 'unavailable'
  const wrapper = mount(ConnectClaudeCode, { attachTo: document.body })
  useAssistantStore().openConnect()
  await nextTick()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('Live MCP access on the hosted app', () => {
  it('says what the dialog is for and that this copy uses Browser agents instead, with no npm run dev instruction', async () => {
    await openDialog({ bridge: 'unavailable', webMcp: 'on' })
    const hosted = q('ai-connect-hosted')
    expect(hosted).not.toBeNull()
    expect(hosted.textContent).toMatch(/Browser agents/)
    expect(hosted.textContent).toMatch(/project file/)
    expect(hosted.textContent).not.toMatch(/Start WarpCad with npm run dev/)
    expect(q('ai-connect-unavailable')).toBeNull()
    // Nothing to enable here.
    expect(q('ai-connect-enable')).toBeNull()
    expect(q('ai-connect-endpoint')).toBeNull()
  })

  it('takes you to the Browser agents switch when this browser has one', async () => {
    await openDialog({ bridge: 'unavailable', webMcp: 'off' })
    q('ai-connect-browser-agents').click()
    await nextTick()
    expect(useAssistantStore().view).toBe('chat')
  })

  it('without WebMCP there is no switch to show, so it says how to get one instead', async () => {
    await openDialog({ bridge: 'unavailable', webMcp: 'unavailable' })
    expect(q('ai-connect-browser-agents')).toBeNull()
    expect(q('ai-connect-hosted').textContent).toMatch(/doesn’t offer WebMCP/)
  })

  it('links the Browser agents page and the three ways in', async () => {
    await openDialog({ bridge: 'unavailable' })
    const help = useHelpStore()
    q('ai-connect-webmcp-help').click()
    expect(help.page).toBe('webmcp')
    q('ai-connect-mcp-help').click()
    expect(help.page).toBe('mcp')
    expect(help.anchor).toBe('three-ways-in')
  })
})

describe('Live MCP access on the dev host', () => {
  it('names the endpoint address and port a local MCP client connects to', async () => {
    await openDialog({ bridge: 'idle' })
    const endpoint = q('ai-connect-endpoint')
    expect(endpoint).not.toBeNull()
    const expected = `http://127.0.0.1${window.location.port ? `:${window.location.port}` : ''}/mcp`
    expect(endpoint.textContent).toContain(expected)
    expect(endpoint.getAttribute('data-endpoint')).toBe(expected)
    expect(q('ai-connect-hosted')).toBeNull()
    expect(q('ai-connect-enable')).not.toBeNull()
  })
})
