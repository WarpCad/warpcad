// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createToolRegistry } from '../tools/index.js'
import { SCRIPTED_CHUNK_CHARS, createScriptedClient, schemaHash, staleProblems, stampTranscript } from './scripted.js'

/**
 * `TODO/ai-010` — the scripted provider: deterministic replay, chunked text like the real
 * client, abort, placeholders, and a stale transcript failing with "re-record". The recorded
 * fixtures, and the airfoil fixture played through the real agent loop and document, are in
 * `scripts/ai-fixtures.spec.js` (they read files, which `src/` specs do not: `src/shims.d.ts`).
 */

/** @param {import('../client.js').AiClient} client @param {any} [request] */
async function drain(client, request = { system: '', messages: [] }) {
  /** @type {any[]} */
  const events = []
  for await (const event of client.stream(request)) events.push(event)
  return events
}

/** A registry whose `create` schema differs from the real one. */
const changedRegistry = () => {
  const real = createToolRegistry()
  return {
    definitions: (/** @type {any} */ transport) =>
      real.definitions(transport).map((definition) => (definition.name === 'create' ? { ...definition, inputSchema: { ...definition.inputSchema, description: 'changed' } } : definition)),
  }
}

/** @type {import('./scripted.js').ScriptedTranscript} */
const SMALL = stampTranscript({
  name: 'small',
  tools: {},
  turns: [
    { text: 'Placing a cube now, and then checking that it fits the bed.', calls: [{ name: 'create', input: { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [10, 10, 10] } } }] },
    { text: 'Done.' },
  ],
})

describe('createScriptedClient — replay', () => {
  it('replays the same events for the same transcript, every time', async () => {
    const first = await drain(createScriptedClient(SMALL))
    const second = await drain(createScriptedClient(SMALL))
    expect(second).toEqual(first)
    expect(first.at(-1)).toMatchObject({ type: 'done', stopReason: 'tool_use', model: 'scripted' })
  })

  it('streams text in chunks that split words, like the real client, and the chunks add up', async () => {
    const events = await drain(createScriptedClient(SMALL))
    const chunks = events.filter((event) => event.type === 'text').map((event) => event.text)
    expect(chunks.length).toBeGreaterThan(3)
    expect(chunks.every((chunk) => chunk.length <= SCRIPTED_CHUNK_CHARS)).toBe(true)
    expect(chunks.join('')).toBe(SMALL.turns[0].text)
    // At least one boundary falls mid-word: the property a naive per-sentence mock lacks.
    expect(chunks.slice(0, -1).some((chunk) => !chunk.endsWith(' '))).toBe(true)
  })

  it('answers each stream() call with the next turn, then says it ran out', async () => {
    const client = createScriptedClient(SMALL)
    await drain(client)
    const last = await drain(client)
    expect(last.at(-1)).toMatchObject({ type: 'done', stopReason: 'end_turn' })
    const beyond = await drain(client)
    expect(beyond).toEqual([expect.objectContaining({ type: 'error', kind: 'bad-response', message: expect.stringMatching(/no more replies/) })])
  })

  it('reports the tool call with the content the agent keeps for the next request', async () => {
    const events = await drain(createScriptedClient(SMALL))
    const call = events.find((event) => event.type === 'tool_call')
    const done = events.find((event) => event.type === 'done')
    expect(call).toMatchObject({ name: 'create', input: { op: 'primitive.cuboid' } })
    expect(done.content.map((/** @type {any} */ block) => block.type)).toEqual(['text', 'tool_use'])
    expect(done.content[1].id).toBe(call.id)
  })

  it('stops at an aborted signal with the stop reason the agent reads as a cancel', async () => {
    const controller = new AbortController()
    controller.abort()
    const events = await drain(createScriptedClient(SMALL), { system: '', messages: [], signal: controller.signal })
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'aborted', content: [], model: 'scripted' })
    expect(events.some((event) => event.type === 'tool_call')).toBe(false)
  })

  it('answers Test without a key or a network', async () => {
    expect(await createScriptedClient(SMALL).test()).toEqual({ ok: true, model: 'scripted' })
  })
})

describe('placeholders — ids the app issued, not the script', () => {
  const calls = [
    { name: 'check_printability', input: { ids: '$all:sketch,cuboid', buildVolumeMm: [1, 1, 1] } },
    { name: 'operate', input: { op: 'modify.enlarge', operands: [{ id: '$last:cuboid' }], params: {} } },
  ]
  /** @type {import('./scripted.js').ScriptedTranscript} */
  const transcript = stampTranscript({ name: 'ids', tools: {}, turns: [{ calls: [calls[0]] }, { calls: [calls[1]] }] })
  const conversation = { system: '', messages: [{ role: 'user', content: 'ids sketch-1 cuboid-2 cuboid-3 sketch-1 group-4' }] }

  it('$all gives every id of those kinds once, in first-seen order', async () => {
    const events = await drain(createScriptedClient(transcript), conversation)
    expect(events.find((event) => event.type === 'tool_call').input.ids).toEqual(['sketch-1', 'cuboid-2', 'cuboid-3'])
  })

  it('$last gives the newest id of that kind', async () => {
    const client = createScriptedClient(transcript)
    await drain(client, conversation)
    const events = await drain(client, conversation)
    expect(events.find((event) => event.type === 'tool_call').input.operands[0].id).toBe('cuboid-3')
  })

  it('leaves the placeholder alone when there is no such id, so the tool says so', async () => {
    const events = await drain(createScriptedClient(transcript), { system: '', messages: [] })
    expect(events.find((event) => event.type === 'tool_call').input.ids).toEqual([])
  })
})

describe('a stale transcript fails with "re-record", not with a green run', () => {
  it('names the tool whose schema changed, and plays nothing', async () => {
    expect(staleProblems(SMALL)).toEqual([])
    const events = await drain(createScriptedClient(SMALL, { registry: changedRegistry() }))
    expect(events).toEqual([expect.objectContaining({ type: 'error', kind: 'bad-request', message: expect.stringMatching(/stale.*schema of "create" changed.*Re-record/s) })])
  })

  it('refuses a tool that no longer exists', () => {
    const gone = { name: 'gone', tools: { vanished: 'x' }, turns: [{ calls: [{ name: 'vanished', input: {} }] }] }
    expect(staleProblems(gone)).toEqual(['the tool "vanished" no longer exists'])
  })

  it('refuses a call nobody stamped', () => {
    const unstamped = { name: 'u', tools: {}, turns: [{ calls: [{ name: 'create', input: {} }] }] }
    expect(staleProblems(unstamped)).toEqual(['the tool "create" has no stamp'])
  })

  it('hashes a schema the same whatever order its keys are in, and differently when it changes', () => {
    expect(schemaHash({ a: 1, b: { c: 2, d: 3 } })).toBe(schemaHash({ b: { d: 3, c: 2 }, a: 1 }))
    expect(schemaHash({ a: 1 })).not.toBe(schemaHash({ a: 2 }))
  })
})
