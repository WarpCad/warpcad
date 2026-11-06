// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { BRIDGE_EVENT } from './protocol.js'
import { createPreviewTransport, newPreviewTabId, PREVIEW_DISCONNECT } from './previewTransport.js'

/** A stand-in EventSource: the test pushes messages and errors by hand. */
class FakeEventSource {
  /** @param {string} url */
  constructor(url) {
    this.url = url
    /** @type {((event: { data: string }) => void) | null} */
    this.onmessage = null
    /** @type {(() => void) | null} */
    this.onerror = null
    /** @type {(() => void) | null} */
    this.onopen = null
    this.closed = false
    FakeEventSource.instances.push(this)
  }

  close() {
    this.closed = true
  }

  open() {
    this.onopen?.()
  }

  /** @param {unknown} data */
  push(data) {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) })
  }
}
/** @type {FakeEventSource[]} */
FakeEventSource.instances = []

/** @returns {{ calls: { url: string, init: any }[], fetchImpl: (url: string, init: any) => Promise<unknown> }} */
function recorder() {
  /** @type {{ url: string, init: any }[]} */
  const calls = []
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      return { ok: true }
    },
  }
}

describe('the preview tab transport', () => {
  it('opens one stream per tab, named by its id, on the preview origin', () => {
    FakeEventSource.instances.length = 0
    const { fetchImpl } = recorder()
    createPreviewTransport({ tabId: 'tab-abc12345', origin: 'http://localhost:4173', EventSourceImpl: FakeEventSource, fetchImpl })
    expect(FakeEventSource.instances[0].url).toBe('http://localhost:4173/__warpcad_bridge/events?tab=tab-abc12345')
  })

  it('delivers each host message to the bridge event handlers, and ignores malformed frames', () => {
    FakeEventSource.instances.length = 0
    const { fetchImpl } = recorder()
    const transport = createPreviewTransport({ tabId: 'tab-abc12345', EventSourceImpl: FakeEventSource, fetchImpl })
    /** @type {unknown[]} */
    const seen = []
    transport.on(BRIDGE_EVENT, (data) => seen.push(data))
    const stream = FakeEventSource.instances[0]
    stream.push({ type: 'status', access: 'off', expiresAt: null, connection: 'idle', reason: '' })
    stream.push('not json')
    stream.push({ type: 'call', id: 1, name: 'create', input: {} })
    expect(seen).toEqual([
      { type: 'status', access: 'off', expiresAt: null, connection: 'idle', reason: '' },
      { type: 'call', id: 1, name: 'create', input: {} },
    ])
  })

  it('reports one drop, closes the stream and never reconnects', () => {
    FakeEventSource.instances.length = 0
    const { fetchImpl } = recorder()
    const transport = createPreviewTransport({ tabId: 'tab-abc12345', EventSourceImpl: FakeEventSource, fetchImpl })
    let drops = 0
    transport.on(PREVIEW_DISCONNECT, () => {
      drops += 1
    })
    const stream = FakeEventSource.instances[0]
    stream.onerror?.()
    stream.onerror?.()
    expect(drops).toBe(1)
    expect(stream.closed).toBe(true)
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it('holds posts until the stream is open, so the host already knows the tab when they land', () => {
    FakeEventSource.instances.length = 0
    const { calls, fetchImpl } = recorder()
    const transport = createPreviewTransport({ tabId: 'tab-abc12345', origin: 'http://localhost:4173', EventSourceImpl: FakeEventSource, fetchImpl })
    transport.send(BRIDGE_EVENT, { type: 'hello' })
    transport.send(BRIDGE_EVENT, { type: 'access', lease: 'tab' })
    expect(calls).toHaveLength(0)
    FakeEventSource.instances[0].open()
    expect(calls.map((call) => JSON.parse(call.init.body))).toEqual([{ type: 'hello' }, { type: 'access', lease: 'tab' }])
  })

  it('posts a bridge message as JSON to the tab’s message route, and sends nothing after a drop', () => {
    FakeEventSource.instances.length = 0
    const { calls, fetchImpl } = recorder()
    const transport = createPreviewTransport({ tabId: 'tab-abc12345', origin: 'http://localhost:4173', EventSourceImpl: FakeEventSource, fetchImpl })
    FakeEventSource.instances[0].open()
    transport.send(BRIDGE_EVENT, { type: 'hello' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('http://localhost:4173/__warpcad_bridge/message?tab=tab-abc12345')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers['content-type']).toBe('application/json')
    expect(JSON.parse(calls[0].init.body)).toEqual({ type: 'hello' })

    transport.send('some-other-event', { type: 'hello' })
    expect(calls).toHaveLength(1)

    FakeEventSource.instances[0].onerror?.()
    transport.send(BRIDGE_EVENT, { type: 'access', lease: 'tab' })
    expect(calls).toHaveLength(1)
  })

  it('makes a tab id of 32 hex characters from getRandomValues, which every origin has', () => {
    const id = newPreviewTabId({ getRandomValues: (/** @type {Uint8Array} */ bytes) => bytes.fill(0xab) })
    expect(id).toBe('ab'.repeat(16))
    expect(newPreviewTabId(/** @type {any} */ (globalThis.crypto))).toMatch(/^[0-9a-f]{32}$/)
  })
})
