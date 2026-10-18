// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `TODO/ai-024`: the glue between the link and the **Browser agents** chip. What the link reports
 * (registered, refused, the tab's visibility) must reach the chip's words and the diagnostic, and
 * the diagnostic must be readable by an agent without opening the Assistant: a
 * `<meta name="warpcad-webmcp">` and one `console.info` per change.
 *
 * `startWebMcp` runs once per page, so each test loads a fresh copy of the module graph (Pinia
 * included, so the store and the active Pinia belong to the same copy).
 */

/** @returns {{ registerTool: (tool: any, options?: { signal?: AbortSignal }) => Promise<void>, names: Set<string> }} */
function fakeApi({ refuseAll = false } = {}) {
  const names = new Set()
  return {
    names,
    async registerTool(tool, options = {}) {
      if (refuseAll || names.has(tool.name)) throw new DOMException(`Duplicate tool name: ${tool.name}`, 'InvalidStateError')
      names.add(tool.name)
      options.signal?.addEventListener('abort', () => names.delete(tool.name))
    },
  }
}

const preference = { load: async () => true, save: async () => ({ persisted: true }) }

/** @param {unknown} api What `document.modelContext` reads as (`undefined`: not there). */
function setDocumentApi(api) {
  Object.defineProperty(document, 'modelContext', { configurable: true, get: () => api })
}

/** @param {'hidden' | 'visible'} state */
function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

async function load() {
  vi.resetModules()
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const webMcp = await import('./useWebMcp.js')
  const { useAiChatStore } = await import('../stores/aiChat.js')
  return { ...webMcp, chat: useAiChatStore() }
}

const meta = () => document.querySelector('meta[name="warpcad-webmcp"]')?.getAttribute('content')

/** @type {import('vitest').MockInstance} */
let info

beforeEach(() => {
  document.head.innerHTML = ''
  setVisibility('visible')
  setDocumentApi(undefined)
  info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
})

afterEach(() => {
  info.mockRestore()
})

describe('startWebMcp → the chip and the diagnostic', () => {
  it('offers document.modelContext as navigator.modelContext too, for agents that only probe navigator (ai-024)', async () => {
    const api = fakeApi()
    const { startWebMcp } = await load()
    setDocumentApi(api)
    /** @type {any} */
    const env = { document, navigator: {} }
    await startWebMcp({ env, preference })
    expect(env.navigator.modelContext).toBe(api)
  })

  it('registered: the chip counts the tools and the diagnostic says api=document', async () => {
    const api = fakeApi()
    const { startWebMcp, chat } = await load()
    setDocumentApi(api)
    await startWebMcp({ env: { document }, preference })
    expect(chat.webMcp).toBe('on')
    expect(chat.webMcpTools).toBeGreaterThan(10)
    expect(chat.webMcpLabel).toBe(`Browser agents · on — ${chat.webMcpTools} tools`)
    expect(chat.webMcpDiagnostic).toBe(`api=document; enabled=on; visible=yes; registered=${chat.webMcpTools}; failed=[]`)
    expect(meta()).toBe(chat.webMcpDiagnostic)
    expect(info).toHaveBeenLastCalledWith(`WarpCad WebMCP: ${chat.webMcpDiagnostic}`)
  })

  it('a tab hidden at load: on, nothing registered, and the chip says why', async () => {
    setVisibility('hidden')
    const api = fakeApi()
    const { startWebMcp, chat } = await load()
    setDocumentApi(api)
    await startWebMcp({ env: { document }, preference })
    expect(api.names.size).toBe(0)
    expect(chat.webMcp).toBe('on')
    expect(chat.webMcpLabel).toBe('Browser agents · on, but the tab is hidden')
    expect(chat.webMcpDiagnostic).toBe('api=document; enabled=on; visible=no; registered=0; failed=[]')
    expect(meta()).toBe(chat.webMcpDiagnostic)

    // Brought to the front: registered, and the chip and the meta follow.
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(chat.webMcpTools).toBeGreaterThan(10))
    await vi.waitFor(() => expect(meta()).toBe(`api=document; enabled=on; visible=yes; registered=${chat.webMcpTools}; failed=[]`))
    expect(chat.webMcpLabel).toBe(`Browser agents · on — ${chat.webMcpTools} tools`)
  })

  it('every registration refused: the chip says registration failed, and the line under it says why', async () => {
    const api = fakeApi({ refuseAll: true })
    const { startWebMcp, chat } = await load()
    setDocumentApi(api)
    await startWebMcp({ env: { document }, preference })
    expect(chat.webMcpTools).toBe(0)
    expect(chat.webMcpLabel).toBe('Browser agents · on — registration failed')
    expect(chat.webMcpDiagnostic).toMatch(/^api=document; enabled=on; visible=yes; registered=0; failed=\[\w+,/)
    expect(chat.webMcpFailureText).toMatch(/^The browser refused all \d+ of WarpCad’s tools/)
  })

  it('logs once per change, not once per read', async () => {
    const { startWebMcp, chat } = await load()
    setDocumentApi(fakeApi())
    await startWebMcp({ env: { document }, preference })
    const calls = info.mock.calls.length
    void chat.webMcpDiagnostic
    void chat.webMcpDiagnostic
    expect(info.mock.calls.length).toBe(calls)
    const lines = info.mock.calls.map((call) => call[0])
    expect(new Set(lines).size).toBe(lines.length)
  })

  it('an older Chrome’s navigator.modelContext: api=navigator', async () => {
    const api = fakeApi()
    const { startWebMcp, chat } = await load()
    await startWebMcp({ env: { document, navigator: { modelContext: api } }, preference })
    expect(chat.webMcpDiagnostic).toMatch(/^api=navigator; enabled=on; visible=yes; registered=\d+; failed=\[\]$/)
    expect(api.names.size).toBe(chat.webMcpTools)
  })

  it('no WebMCP: no chip, and the diagnostic still says api=none, once', async () => {
    const { startWebMcp, chat } = await load()
    await startWebMcp({ env: { document, navigator: {} } })
    expect(chat.webMcp).toBe('unavailable')
    expect(chat.webMcpLabel).toBe('')
    expect(chat.webMcpDiagnostic).toBe('api=none; enabled=off; visible=yes; registered=0; failed=[]')
    expect(meta()).toBe(chat.webMcpDiagnostic)
    expect(info).toHaveBeenCalledTimes(1)
  })
})
