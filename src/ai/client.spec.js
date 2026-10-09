// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — drives a hand-written fake of `fetch`/`Response`; the module under test is typed.
import { describe, expect, it, vi } from 'vitest'

import {
  ANTHROPIC_API_ORIGIN,
  ANTHROPIC_VERSION,
  FALLBACK_BETA,
  buildRequest,
  createAnthropicClient,
} from './client.js'
import { DEFAULT_MODEL } from './models.js'

/**
 * `TODO/ai-004` — the BYOK provider client, with `fetch` mocked at the boundary
 * (`CLAUDE.md`). Nothing here may reach a network, and the sentinel key must never appear in
 * a thrown message, a yielded error, a request URL or a body.
 */

const KEY = 'sk-ant-api03-SENTINELsentinel_0123456789-abcdef'
const encoder = new TextEncoder()

/** @param {Array<string | Uint8Array>} chunks */
function sseBody(chunks, { fail = null } = {}) {
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        const chunk = chunks[index++]
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
      } else if (fail) {
        controller.error(fail)
      } else {
        controller.close()
      }
    },
  })
}

/** One SSE event frame. */
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

function response({ status = 200, body = '', headers = {}, stream = null } = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => lower[String(name).toLowerCase()] ?? null },
    body: stream,
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body)
    },
    async json() {
      return typeof body === 'string' ? JSON.parse(body) : body
    },
  }
}

const START = frame('message_start', {
  type: 'message_start',
  message: {
    id: 'msg_1',
    model: 'claude-opus-5-5',
    content: [],
    usage: { input_tokens: 1200, cache_read_input_tokens: 800, cache_creation_input_tokens: 300, output_tokens: 1 },
  },
})
const stop = (reason = 'end_turn', extra = {}) =>
  frame('message_delta', { type: 'message_delta', delta: { stop_reason: reason, ...extra }, usage: { output_tokens: 42 } }) +
  frame('message_stop', { type: 'message_stop' })
const textBlock = (index, ...pieces) =>
  frame('content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }) +
  pieces.map((text) => frame('content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text } })).join('') +
  frame('content_block_stop', { type: 'content_block_stop', index })

function makeClient(fetchImpl, options = {}) {
  return createAnthropicClient({
    fetch: fetchImpl,
    getKey: () => KEY,
    getModel: () => DEFAULT_MODEL,
    isOnline: () => true,
    ...options,
  })
}

async function collect(iterable) {
  const events = []
  for await (const event of iterable) events.push(event)
  return events
}

const REQUEST = { system: 'You are a CAD assistant.', messages: [{ role: 'user', content: 'hi' }], tools: [] }

describe('buildRequest — the one place the request body is built', () => {
  const tool = (name) => ({
    name,
    description: `${name} tool`,
    inputSchema: {
      type: 'object',
      properties: { size: { type: 'number', minimum: 1, maximum: 9 } },
      required: ['size'],
      additionalProperties: false,
    },
  })

  it('sets every field decision 9 lists, explicitly', () => {
    const body = buildRequest({ model: 'claude-opus-5-5', ...REQUEST, tools: [tool('b')] })
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      stream: true,
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      tool_choice: { type: 'auto' },
      cache_control: { type: 'ephemeral' },
      fallbacks: 'default',
    })
    expect(body.system).toEqual([{ type: 'text', text: 'You are a CAD assistant.', cache_control: { type: 'ephemeral' } }])
  })

  it('sends tools sorted by name, strict, with the strict-unsupported keywords dropped from the wire', () => {
    const body = buildRequest({ model: 'claude-opus-5-5', ...REQUEST, tools: [tool('zeta'), tool('alpha')] })
    expect(body.tools.map((t) => t.name)).toEqual(['alpha', 'zeta'])
    expect(body.tools[0].strict).toBe(true)
    expect(body.tools[0].input_schema.properties.size).toEqual({ type: 'number' })
    expect(body.tools[0].inputSchema).toBeUndefined()
  })

  it('omits tools and tool_choice together when there are no tools (tool_choice alone is a 400)', () => {
    const body = buildRequest({ model: 'claude-opus-5-5', ...REQUEST })
    expect('tools' in body).toBe(false)
    expect('tool_choice' in body).toBe(false)
  })

  it('is byte-identical for the same inputs, so the cached prefix is stable', () => {
    const a = JSON.stringify(buildRequest({ model: 'claude-opus-5-5', ...REQUEST, tools: [tool('b'), tool('a')] }))
    const b = JSON.stringify(buildRequest({ model: 'claude-opus-5-5', ...REQUEST, tools: [tool('a'), tool('b')] }))
    expect(a).toBe(b)
  })

  it('never puts forced tool_choice or a disabled thinking mode on the wire (both 400 on Opus 5.5)', () => {
    const body = buildRequest({ model: 'claude-opus-5-5', ...REQUEST, tools: [tool('a')] })
    expect(body.tool_choice.type).toBe('auto')
    expect(body.thinking.type).not.toBe('disabled')
    expect(body.thinking.budget_tokens).toBeUndefined()
  })
})

describe('createAnthropicClient construction', () => {
  it('refuses an origin that is not allowlisted, before any request exists', () => {
    expect(() => makeClient(vi.fn(), { apiOrigin: 'https://evil.example' })).toThrow(/refuses the origin/)
  })

  it('needs a fetch implementation', () => {
    expect(() => createAnthropicClient({ fetch: null, getKey: () => KEY, getModel: () => DEFAULT_MODEL })).toThrow(/fetch/)
  })
})

describe('stream() — request', () => {
  it('POSTs to /v1/messages with the key in x-api-key only, and the browser-access and version headers', async () => {
    const fetchImpl = vi.fn(async () => response({ stream: sseBody([START, textBlock(0, 'ok'), stop()]) }))
    await collect(makeClient(fetchImpl).stream(REQUEST))
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${ANTHROPIC_API_ORIGIN}/v1/messages`)
    expect(init.method).toBe('POST')
    expect(init.headers['x-api-key']).toBe(KEY)
    expect(init.headers['anthropic-version']).toBe(ANTHROPIC_VERSION)
    expect(init.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(init.headers['anthropic-beta']).toBe(FALLBACK_BETA)
    expect(url).not.toContain(KEY)
    expect(init.body).not.toContain(KEY)
    expect(JSON.parse(init.body).model).toBe(DEFAULT_MODEL)
  })

  it('reads the model at call time, so changing the ai.model setting applies to the next request', async () => {
    let model = 'claude-opus-5-5'
    const fetchImpl = vi.fn(async () => response({ stream: sseBody([START, stop()]) }))
    const client = makeClient(fetchImpl, { getModel: () => model })
    await collect(client.stream(REQUEST))
    model = 'claude-sonnet-5-5'
    await collect(client.stream(REQUEST))
    expect(fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body).model)).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5'])
  })

  it('yields a no-key error and never calls fetch when no key is stored', async () => {
    const fetchImpl = vi.fn()
    const events = await collect(makeClient(fetchImpl, { getKey: () => null }).stream(REQUEST))
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(events).toEqual([expect.objectContaining({ type: 'error', kind: 'no-key' })])
  })
})

describe('stream() — events', () => {
  it('yields text deltas, then usage, then done', async () => {
    const fetchImpl = vi.fn(async () => response({ stream: sseBody([START, textBlock(0, 'Hel', 'lo'), stop()]) }))
    const events = await collect(makeClient(fetchImpl).stream(REQUEST))
    expect(events.map((e) => e.type)).toEqual(['text', 'text', 'usage', 'done'])
    expect(events.filter((e) => e.type === 'text').map((e) => e.text).join('')).toBe('Hello')
    expect(events.find((e) => e.type === 'usage').usage).toEqual({ input: 1200, cacheRead: 800, cacheWrite: 300, output: 42 })
    const done = events.at(-1)
    expect(done.stopReason).toBe('end_turn')
    expect(done.content).toEqual([{ type: 'text', text: 'Hello' }])
    expect(done.model).toBe('claude-opus-5-5')
  })

  it('assembles a tool call whose input JSON is split mid-token, across chunk boundaries', async () => {
    const toolStart = frame('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'create', input: {} },
    })
    const piece = (partial) =>
      frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: partial } })
    const wire =
      START +
      toolStart +
      piece('') +
      piece('{"op": "primitive.cu') +
      piece('boid", "positionMm": [1.5, -2') +
      piece('0, 3]}') +
      frame('content_block_stop', { type: 'content_block_stop', index: 0 }) +
      stop('tool_use')
    // Re-chunk the whole wire into 7-byte slices so frames, event names and JSON all split.
    const bytes = encoder.encode(wire)
    const chunks = []
    for (let at = 0; at < bytes.length; at += 7) chunks.push(bytes.slice(at, at + 7))
    const fetchImpl = vi.fn(async () => response({ stream: sseBody(chunks) }))
    const events = await collect(makeClient(fetchImpl).stream(REQUEST))
    const call = events.find((e) => e.type === 'tool_call')
    expect(call).toEqual({
      type: 'tool_call',
      id: 'toolu_1',
      name: 'create',
      input: { op: 'primitive.cuboid', positionMm: [1.5, -20, 3] },
    })
    const done = events.at(-1)
    expect(done.stopReason).toBe('tool_use')
    expect(done.content).toEqual([
      { type: 'tool_use', id: 'toolu_1', name: 'create', input: { op: 'primitive.cuboid', positionMm: [1.5, -20, 3] } },
    ])
  })

  it('treats an empty tool input as {}', async () => {
    const wire =
      START +
      frame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't', name: 'describe_scene', input: {} } }) +
      frame('content_block_stop', { type: 'content_block_stop', index: 0 }) +
      stop('tool_use')
    const events = await collect(makeClient(vi.fn(async () => response({ stream: sseBody([wire]) }))).stream(REQUEST))
    expect(events.find((e) => e.type === 'tool_call').input).toEqual({})
  })

  it('does not split a multi-byte character that straddles two chunks', async () => {
    const wire = encoder.encode(START + textBlock(0, 'Ø 6 mm — ok') + stop())
    const cut = wire.indexOf(0xc3) + 1 // between the two bytes of "Ø"
    const fetchImpl = vi.fn(async () => response({ stream: sseBody([wire.slice(0, cut), wire.slice(cut)]) }))
    const events = await collect(makeClient(fetchImpl).stream(REQUEST))
    expect(events.filter((e) => e.type === 'text').map((e) => e.text).join('')).toBe('Ø 6 mm — ok')
  })

  it('handles CRLF framing, comments and ping events', async () => {
    const wire = (START + 'event: ping\ndata: {"type": "ping"}\n\n' + ': keep-alive\n\n' + textBlock(0, 'x') + stop()).replace(/\n/g, '\r\n')
    const events = await collect(makeClient(vi.fn(async () => response({ stream: sseBody([wire]) }))).stream(REQUEST))
    expect(events.filter((e) => e.type === 'text').map((e) => e.text).join('')).toBe('x')
    expect(events.at(-1).type).toBe('done')
  })

  it('keeps thinking blocks (with their signature) in done.content so the agent can echo them back unchanged', async () => {
    const wire =
      START +
      frame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } }) +
      frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIG-1' } }) +
      frame('content_block_stop', { type: 'content_block_stop', index: 0 }) +
      textBlock(1, 'done') +
      stop()
    const events = await collect(makeClient(vi.fn(async () => response({ stream: sseBody([wire]) }))).stream(REQUEST))
    expect(events.at(-1).content).toEqual([
      { type: 'thinking', thinking: '', signature: 'SIG-1' },
      { type: 'text', text: 'done' },
    ])
    expect(events.some((e) => e.type === 'text' && e.text === '')).toBe(false)
  })

  it('reports max_tokens as a done reason, not an error', async () => {
    const events = await collect(makeClient(vi.fn(async () => response({ stream: sseBody([START, textBlock(0, 'cut'), stop('max_tokens')]) }))).stream(REQUEST))
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'max_tokens' })
  })

  it('maps stop_reason refusal to a plain error (after usage), never to done', async () => {
    const wire = START + stop('refusal', { stop_details: { type: 'refusal', category: 'cyber', explanation: 'details that must not be shown' } })
    const events = await collect(makeClient(vi.fn(async () => response({ stream: sseBody([wire]) }))).stream(REQUEST))
    expect(events.map((e) => e.type)).toEqual(['usage', 'error'])
    expect(events.at(-1)).toMatchObject({ kind: 'refusal' })
    expect(events.at(-1).message).toMatch(/declined/i)
    expect(events.at(-1).message).not.toContain('details that must not be shown')
  })

  it('maps an in-stream error event to a fixed message that never quotes the server', async () => {
    const wire =
      START +
      frame('error', { type: 'error', error: { type: 'overloaded_error', message: `Overloaded for ${KEY}` } })
    const events = await collect(makeClient(vi.fn(async () => response({ stream: sseBody([wire]) }))).stream(REQUEST))
    const error = events.at(-1)
    expect(error).toMatchObject({ type: 'error', kind: 'server' })
    expect(JSON.stringify(events)).not.toContain(KEY)
  })

  it('yields an interrupted error if the connection drops mid-stream', async () => {
    const fetchImpl = vi.fn(async () =>
      response({ stream: sseBody([START, textBlock(0, 'part')], { fail: new TypeError(`network error for ${KEY}`) }) }),
    )
    const events = await collect(makeClient(fetchImpl).stream(REQUEST))
    expect(events.at(-1)).toMatchObject({ type: 'error', kind: 'interrupted' })
    expect(JSON.stringify(events)).not.toContain(KEY)
  })

  it('yields a bad-response error for a tool input that is not JSON', async () => {
    const wire =
      START +
      frame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't', name: 'create', input: {} } }) +
      frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"op": ' } }) +
      frame('content_block_stop', { type: 'content_block_stop', index: 0 }) +
      stop('tool_use')
    const events = await collect(makeClient(vi.fn(async () => response({ stream: sseBody([wire]) }))).stream(REQUEST))
    expect(events.at(-1)).toMatchObject({ type: 'error', kind: 'bad-response' })
    expect(events.some((e) => e.type === 'tool_call')).toBe(false)
  })
})

describe('stream() — cancel', () => {
  it('aborting mid-stream stops reading and ends with done/aborted', async () => {
    const controller = new AbortController()
    let pulls = 0
    const body = new ReadableStream({
      pull(c) {
        pulls += 1
        if (pulls === 1) c.enqueue(encoder.encode(START + textBlock(0, 'first')))
        // Never more data: the stream just hangs until the signal fires.
      },
    })
    const fetchImpl = vi.fn((url, init) => {
      init.signal.addEventListener('abort', () => body.cancel().catch(() => {}))
      return Promise.resolve(response({ stream: body }))
    })
    const seen = []
    const run = (async () => {
      for await (const event of makeClient(fetchImpl).stream({ ...REQUEST, signal: controller.signal })) {
        seen.push(event)
        if (event.type === 'text') controller.abort()
      }
    })()
    await run
    expect(seen.at(-1)).toEqual(expect.objectContaining({ type: 'done', stopReason: 'aborted' }))
    expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal)
  })

  it('an already-aborted signal never sends a request', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = vi.fn()
    const events = await collect(makeClient(fetchImpl).stream({ ...REQUEST, signal: controller.signal }))
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(events).toEqual([expect.objectContaining({ type: 'done', stopReason: 'aborted' })])
  })

  it('a fetch rejected by abort is a clean abort, not a network error', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(async () => {
      controller.abort()
      throw new DOMException('The operation was aborted', 'AbortError')
    })
    const events = await collect(makeClient(fetchImpl).stream({ ...REQUEST, signal: controller.signal }))
    expect(events.at(-1)).toMatchObject({ type: 'done', stopReason: 'aborted' })
  })
})

describe('error mapping — each case a distinct plain message, never built from the response body', () => {
  const kindsFor = async (answer, options = {}) => {
    const fetchImpl = vi.fn(async () => answer)
    const events = await collect(makeClient(fetchImpl, options).stream(REQUEST))
    return events.at(-1)
  }
  const poisoned = (status, headers = {}) =>
    response({ status, headers, body: { type: 'error', error: { type: 'x', message: `bad key ${KEY} for org` } } })

  it('401 is a bad key', async () => {
    const error = await kindsFor(poisoned(401))
    expect(error).toMatchObject({ type: 'error', kind: 'bad-key', status: 401 })
    expect(error.message).toMatch(/key/i)
    expect(error.message).not.toContain(KEY)
    expect(error.message).not.toContain('org')
  })

  it('403 is a permission problem, distinct from a bad key', async () => {
    const error = await kindsFor(poisoned(403))
    expect(error.kind).toBe('forbidden')
  })

  it('429 is a rate limit and carries retry-after seconds', async () => {
    const error = await kindsFor(poisoned(429, { 'retry-after': '12' }))
    expect(error).toMatchObject({ kind: 'rate-limit', status: 429, retryAfterSeconds: 12 })
    expect(error.message).toMatch(/rate/i)
  })

  it('5xx and 529 are a server problem', async () => {
    expect((await kindsFor(poisoned(500))).kind).toBe('server')
    expect((await kindsFor(poisoned(529))).kind).toBe('server')
    expect((await kindsFor(poisoned(503))).message).toContain('503')
  })

  it('400 / 404 / 413 are a refused request, with no body text', async () => {
    for (const status of [400, 404, 413]) {
      const error = await kindsFor(poisoned(status))
      expect(error.kind).toBe('bad-request')
      expect(error.message).not.toContain(KEY)
    }
  })

  it('a fetch TypeError while online is a blocked request (CORS / content blocker), distinct from offline', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError(`Failed to fetch (x-api-key: ${KEY})`)
    })
    const events = await collect(makeClient(fetchImpl, { isOnline: () => true }).stream(REQUEST))
    const error = events.at(-1)
    expect(error).toMatchObject({ type: 'error', kind: 'blocked' })
    expect(error.message).toMatch(/CORS|blocked/i)
    expect(error.message).not.toContain(KEY)
  })

  it('a fetch TypeError while the browser reports offline is an offline error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const events = await collect(makeClient(fetchImpl, { isOnline: () => false }).stream(REQUEST))
    expect(events.at(-1)).toMatchObject({ type: 'error', kind: 'offline' })
    expect(events.at(-1).message).toMatch(/offline/i)
  })

  it('the six kinds produce six different messages', async () => {
    const messages = new Set()
    for (const answer of [poisoned(401), poisoned(403), poisoned(429), poisoned(500), poisoned(400)]) {
      messages.add((await kindsFor(answer)).message)
    }
    messages.add((await collect(makeClient(vi.fn(async () => { throw new TypeError('x') }), { isOnline: () => false }).stream(REQUEST))).at(-1).message)
    messages.add((await collect(makeClient(vi.fn(async () => { throw new TypeError('x') }), { isOnline: () => true }).stream(REQUEST))).at(-1).message)
    expect(messages.size).toBe(7)
  })

  it('no event, however it fails, contains the key', async () => {
    const all = []
    for (const status of [400, 401, 403, 404, 429, 500, 529]) all.push(await kindsFor(poisoned(status)))
    expect(JSON.stringify(all)).not.toContain(KEY)
  })
})

describe('test() — a check that spends nothing', () => {
  it('POSTs count_tokens with the chosen model and reports ok', async () => {
    const fetchImpl = vi.fn(async () => response({ body: { input_tokens: 8 } }))
    const result = await makeClient(fetchImpl).test()
    expect(result).toEqual({ ok: true, model: DEFAULT_MODEL })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(`${ANTHROPIC_API_ORIGIN}/v1/messages/count_tokens`)
    expect(init.headers['x-api-key']).toBe(KEY)
    expect(JSON.parse(init.body).model).toBe(DEFAULT_MODEL)
  })

  it('reports the specific failure with the same fixed messages', async () => {
    const fetchImpl = vi.fn(async () => response({ status: 401, body: { error: { message: KEY } } }))
    const result = await makeClient(fetchImpl).test()
    expect(result).toMatchObject({ ok: false, kind: 'bad-key' })
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  it('accepts a candidate key without storing it', async () => {
    const fetchImpl = vi.fn(async () => response({ body: {} }))
    await makeClient(fetchImpl, { getKey: () => null }).test()
    expect(fetchImpl).not.toHaveBeenCalled()
    await makeClient(fetchImpl, { getKey: () => null }).test({ key: 'sk-ant-candidate' })
    expect(fetchImpl.mock.calls[0][1].headers['x-api-key']).toBe('sk-ant-candidate')
  })
})
