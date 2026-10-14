// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives hand-written fakes of the key store and `fetch`; the module under test is typed.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { serializeProject } from '../core/project.js'
import { createAiKeyStore } from '../storage/aiKey.js'
import { useAiChatStore } from './aiChat.js'
import { useDocumentStore } from './document.js'
import { setAssistantDependencies, useAssistantStore } from './assistant.js'
import { useSettingsStore } from './settings.js'

/**
 * `TODO/ai-004` — the Assistant's UI state and orchestration. The key itself is **not** on
 * this store (module-local, non-reactive, like `hosted.js`'s token), and the headline spec
 * here serialises everything a dev-tools panel, an autosave, a project file or a log could
 * read and greps it for the sentinel key (`docs/decisions/ai-partner.md` decision 8).
 */

const KEY = 'sk-ant-api03-SENTINELsentinel_0123456789-abcdef'

function fakeCredentials({ failWrite = false } = {}) {
  const data = new Map()
  return {
    data,
    read: async (key) => data.get(key) ?? null,
    write: async (key, record) => {
      if (failWrite) throw new Error('QuotaExceededError')
      data.set(key, { ...record })
    },
    clear: async (key) => void data.delete(key),
    close() {},
  }
}

function okResponse() {
  return { ok: true, status: 200, headers: { get: () => null }, body: null, json: async () => ({ input_tokens: 8 }), text: async () => '{}' }
}

function errResponse(status) {
  return { ok: false, status, headers: { get: () => null }, body: null, json: async () => ({ error: { message: KEY } }), text: async () => KEY }
}

function install({ credentials = fakeCredentials(), fetchImpl = vi.fn(async () => okResponse()) } = {}) {
  const keyStore = createAiKeyStore({ credentials })
  setAssistantDependencies({ keyStore, fetch: fetchImpl, isOnline: () => true })
  return { credentials, fetchImpl, keyStore }
}

describe('the assistant store', () => {
  let localStorageSpy
  beforeEach(() => {
    localStorageSpy = { data: new Map(), setItem: vi.fn(function (k, v) { this.data.set(k, String(v)) }), getItem: vi.fn(function (k) { return this.data.get(k) ?? null }) }
    vi.stubGlobal('localStorage', localStorageSpy)
    setActivePinia(createPinia())
  })
  afterEach(() => {
    setAssistantDependencies(null)
    vi.unstubAllGlobals()
  })

  describe('scripted mode (TODO/ai-010)', () => {
    const transcript = { name: 'unit', tools: {}, turns: [{ text: 'Hello from the script.' }] }
    afterEach(() => {
      delete globalThis.__WARPCAD_SCRIPTED__
    })

    it('a transcript on the global puts the store in scripted mode: connected, labelled, and client() is the script', async () => {
      globalThis.__WARPCAD_SCRIPTED__ = transcript
      install()
      const assistant = useAssistantStore()
      await assistant.start()
      expect(assistant.scripted).toBe(true)
      expect(assistant.hasKey).toBe(true)
      expect(assistant.dotState).toBe('ok')
      expect(assistant.modelName).toBe('Scripted')
      expect(assistant.statusText).toContain('no model, no key')
      assistant.open()
      expect(assistant.view).toBe('chat')
      const events = []
      for await (const event of assistant.client().stream({ system: '', messages: [] })) events.push(event)
      expect(events.filter((event) => event.type === 'text').map((event) => event.text).join('')).toBe('Hello from the script.')
      expect(await assistant.test()).toEqual({ ok: true })
    })

    it('never reads, writes or forgets the real key, and never touches the network', async () => {
      globalThis.__WARPCAD_SCRIPTED__ = transcript
      const { credentials, fetchImpl } = install()
      await createAiKeyStore({ credentials }).save(KEY)
      const read = vi.spyOn(credentials, 'read')
      const write = vi.spyOn(credentials, 'write')
      const clear = vi.spyOn(credentials, 'clear')
      const assistant = useAssistantStore()
      await assistant.start()
      await assistant.saveKey('sk-ant-api03-another-0123456789')
      await assistant.forget()
      for await (const event of assistant.client().stream({ system: '', messages: [] })) void event
      expect(read).not.toHaveBeenCalled()
      expect(write).not.toHaveBeenCalled()
      expect(clear).not.toHaveBeenCalled()
      expect(fetchImpl).not.toHaveBeenCalled()
      // The developer's real key is still there.
      expect(JSON.stringify([...credentials.data.entries()])).toContain(KEY)
    })

    it('without a transcript the store is not scripted', async () => {
      install()
      const assistant = useAssistantStore()
      await assistant.start()
      expect(assistant.scripted).toBe(false)
      expect(assistant.modelName).not.toBe('Scripted')
    })
  })

  it('starts with no key: the dot is none, and opening goes to the key sheet, not the chat', async () => {
    install()
    const assistant = useAssistantStore()
    await assistant.start()
    expect(assistant.hasKey).toBe(false)
    expect(assistant.dotState).toBe('none')
    assistant.open()
    expect(assistant.view).toBe('key')
  })

  it('TODO/ai-020: with no key and Claude Code connected, the panel says Claude Code is editing, not "paste a key"', async () => {
    install()
    const assistant = useAssistantStore()
    await assistant.start()
    useAiChatStore().bridge = 'connected'
    expect(assistant.hasKey).toBe(false)
    expect(assistant.claudeCodeOnly).toBe(true)
    expect(assistant.statusText).toMatch(/Claude Code is editing/)
    expect(assistant.statusText).not.toMatch(/key/i)
    expect(assistant.dotState).toBe('ok')
    assistant.openKeySheet()
    assistant.doneWithKeySheet()
    expect(assistant.view).toBe('chat')
  })

  it('TODO/ai-020: not connected, or holding a key, nothing changes', async () => {
    install()
    const assistant = useAssistantStore()
    await assistant.start()
    for (const state of ['idle', 'waiting', 'disconnected', 'unavailable']) {
      useAiChatStore().bridge = state
      expect(assistant.claudeCodeOnly).toBe(false)
      expect(assistant.statusText).toBe('No key — paste one to connect')
    }
    useAiChatStore().bridge = 'connected'
    await assistant.saveKey(KEY)
    expect(assistant.claudeCodeOnly).toBe(false)
    expect(assistant.statusText).toMatch(/connected — /i)
  })

  it('with a stored key, start() restores it (a reload) and opening goes to the minimal connected state', async () => {
    const { credentials } = install()
    await createAiKeyStore({ credentials }).save(KEY)
    const assistant = useAssistantStore()
    await assistant.start()
    expect(assistant.hasKey).toBe(true)
    expect(assistant.persisted).toBe(true)
    expect(assistant.dotState).toBe('saved')
    assistant.open()
    expect(assistant.view).toBe('chat')
  })

  it('start() is idempotent', async () => {
    install()
    const assistant = useAssistantStore()
    await Promise.all([assistant.start(), assistant.start()])
    expect(assistant.hasKey).toBe(false)
  })

  it('saveKey stores the key, then tests it: ok turns the dot solid and names the model', async () => {
    const { fetchImpl, credentials } = install()
    const assistant = useAssistantStore()
    await assistant.start()
    const result = await assistant.saveKey(`  ${KEY}\n`)
    expect(result.ok).toBe(true)
    expect(assistant.hasKey).toBe(true)
    expect(assistant.status).toBe('ok')
    expect(assistant.dotState).toBe('ok')
    expect(assistant.statusText).toMatch(/connected/i)
    expect(credentials.data.get('ai-anthropic').key).toBe(KEY)
    expect(fetchImpl.mock.calls[0][1].headers['x-api-key']).toBe(KEY)
  })

  it('a failed test keeps the key stored but shows the specific failure and a failed dot', async () => {
    install({ fetchImpl: vi.fn(async () => errResponse(401)) })
    const assistant = useAssistantStore()
    await assistant.start()
    const result = await assistant.saveKey(KEY)
    expect(result).toMatchObject({ ok: false, kind: 'bad-key' })
    expect(assistant.hasKey).toBe(true)
    expect(assistant.dotState).toBe('failed')
    expect(assistant.statusText).toMatch(/key/i)
    expect(assistant.statusText).not.toContain(KEY)
  })

  it('test() with a stored key re-runs the check', async () => {
    const { fetchImpl } = install()
    const assistant = useAssistantStore()
    await assistant.start()
    await assistant.saveKey(KEY)
    fetchImpl.mockResolvedValueOnce(errResponse(429))
    expect(await assistant.test()).toMatchObject({ ok: false, kind: 'rate-limit' })
    expect(assistant.status).toBe('failed')
    expect(await assistant.test()).toMatchObject({ ok: true })
    expect(assistant.status).toBe('ok')
  })

  it('test() with no key says so without a request', async () => {
    const { fetchImpl } = install()
    const assistant = useAssistantStore()
    await assistant.start()
    expect(await assistant.test()).toMatchObject({ ok: false, kind: 'no-key' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('shows a visible session-only note when storage refuses the write, and still works this session', async () => {
    install({ credentials: fakeCredentials({ failWrite: true }) })
    const assistant = useAssistantStore()
    await assistant.start()
    const result = await assistant.saveKey(KEY)
    expect(result.ok).toBe(true)
    expect(assistant.hasKey).toBe(true)
    expect(assistant.persisted).toBe(false)
    expect(assistant.storageNote).toMatch(/this session only|private/i)
  })

  it('has no storage note while the key is persisted', async () => {
    install()
    const assistant = useAssistantStore()
    await assistant.start()
    await assistant.saveKey(KEY)
    expect(assistant.storageNote).toBe('')
  })

  it('forget deletes the key everywhere and goes back to the key form', async () => {
    const { credentials } = install()
    const assistant = useAssistantStore()
    await assistant.start()
    await assistant.saveKey(KEY)
    await assistant.forget()
    expect(assistant.hasKey).toBe(false)
    expect(assistant.dotState).toBe('none')
    expect(credentials.data.size).toBe(0)
    expect(assistant.view).toBe('key')
    // A reload finds nothing.
    setActivePinia(createPinia())
    await useAssistantStore().start()
    expect(useAssistantStore().hasKey).toBe(false)
  })

  it('the one ai.model setting: default Opus 5.5, persisted, validated, and read by the client at call time', async () => {
    const { fetchImpl } = install()
    const settings = useSettingsStore()
    expect(settings.aiModel).toBe('claude-opus-5-5')
    const assistant = useAssistantStore()
    await assistant.start()
    await assistant.saveKey(KEY)
    settings.setAiModel('claude-sonnet-5-5')
    expect(localStorageSpy.setItem).toHaveBeenCalledWith('warpcad.ai.model', 'claude-sonnet-5-5')
    await assistant.test()
    expect(JSON.parse(fetchImpl.mock.calls.at(-1)[1].body).model).toBe('claude-sonnet-5-5')
    settings.setAiModel('gpt-nonsense')
    expect(settings.aiModel).toBe('claude-sonnet-5-5')
  })

  it('a stored unknown model id falls back to the default', () => {
    localStorageSpy.data.set('warpcad.ai.model', 'claude-haiku-4-5')
    setActivePinia(createPinia())
    expect(useSettingsStore().aiModel).toBe('claude-opus-5-5')
  })

  it('exposes a provider client for the agent that reads the key from the closure, never handing it out', async () => {
    const { fetchImpl } = install()
    const assistant = useAssistantStore()
    await assistant.start()
    await assistant.saveKey(KEY)
    const client = assistant.client()
    expect(typeof client.stream).toBe('function')
    expect(JSON.stringify(Object.keys(client))).not.toContain(KEY)
    fetchImpl.mockClear()
    fetchImpl.mockResolvedValueOnce({ ...okResponse(), body: new ReadableStream({ start(c) { c.close() } }) })
    for await (const event of client.stream({ system: 's', messages: [{ role: 'user', content: 'x' }], tools: [] })) void event
    expect(fetchImpl.mock.calls[0][1].headers['x-api-key']).toBe(KEY)
  })

  it('THE LEAK SPEC: the key is in no store state, getter, project file, localStorage write, message or log line', async () => {
    const logs = []
    for (const level of ['log', 'info', 'warn', 'error', 'debug']) vi.spyOn(console, level).mockImplementation((...args) => logs.push(args.map(String).join(' ')))
    const { credentials } = install({ fetchImpl: vi.fn(async () => errResponse(401)) })
    const assistant = useAssistantStore()
    await assistant.start()
    await assistant.saveKey(KEY)
    await assistant.test()
    assistant.open()

    const readable = (store) =>
      Object.keys(store)
        .map((k) => {
          try {
            return `${k}=${JSON.stringify(store[k])}`
          } catch {
            return `${k}=<unserialisable>`
          }
        })
        .join('|')

    const documentStore = useDocumentStore()
    const surfaces = {
      assistantState: JSON.stringify(assistant.$state),
      assistantEverything: readable(assistant),
      settings: readable(useSettingsStore()),
      projectFile: serializeProject(documentStore.raw),
      localStorage: JSON.stringify([...localStorageSpy.data.entries()]),
      localStorageWrites: JSON.stringify(localStorageSpy.setItem.mock.calls),
      messages: [assistant.statusText, assistant.storageNote, assistant.message].join('\n'),
      logs: logs.join('\n'),
      url: String(globalThis.location?.href ?? ''),
    }
    for (const [name, text] of Object.entries(surfaces)) expect(text, `the key leaked into ${name}`).not.toContain(KEY)
    // The one place it IS: the credential store's own record.
    expect(JSON.stringify([...credentials.data.entries()])).toContain(KEY)
  })
})
