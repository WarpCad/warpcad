// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — test doubles.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useAiChatStore } from '../stores/aiChat.js'
import { useDocumentStore } from '../stores/document.js'
import { useSelectionStore } from '../stores/selection.js'
import { setAgentDependencies, useAgent } from './useAgent.js'

/**
 * `TODO/ai-006` — the chat's wiring over the real stores and a scripted provider (no network, no
 * key): send lands a turn and refreshes the viewport's inputs, Stop keeps nothing, Undo AI turn
 * takes exactly the last turn back and is switched off by anything newer.
 */

const CUBE = { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 20] } }

/** @param {Array<{ text?: string, calls?: any[], gate?: Promise<void> }>} script */
function scripted(script) {
  let index = 0
  return {
    async *stream(request) {
      const step = script[index++]
      if (step.gate) await step.gate
      if (request.signal?.aborted) {
        yield { type: 'done', stopReason: 'aborted', content: [], model: 'scripted' }
        return
      }
      const content = []
      if (step.text) {
        content.push({ type: 'text', text: step.text })
        yield { type: 'text', text: step.text }
      }
      for (const [k, call] of (step.calls ?? []).entries()) {
        const id = `toolu_${index}_${k}`
        content.push({ type: 'tool_use', id, name: call.name, input: call.input })
        yield { type: 'tool_call', id, name: call.name, input: call.input }
      }
      yield { type: 'usage', usage: { input: 10, cacheRead: 0, cacheWrite: 0, output: 5 } }
      yield { type: 'done', stopReason: (step.calls ?? []).length > 0 ? 'tool_use' : 'end_turn', content, model: 'scripted' }
    },
  }
}

describe('useAgent (TODO/ai-006)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => setAgentDependencies(null))

  it('send runs a turn: the body lands, the document store refreshes, rows and usage are recorded', async () => {
    setAgentDependencies({ client: scripted([{ text: 'On it.', calls: [{ name: 'create', input: CUBE }] }, { text: 'Done.' }]) })
    const chat = useAiChatStore()
    chat.draft = 'a 20 mm cube'

    await useAgent().send()

    expect(useDocumentStore().bodies).toHaveLength(1)
    expect(chat.draft).toBe('')
    expect(chat.running).toBe(false)
    expect(chat.items.map((i) => i.kind)).toEqual(['user', 'assistant', 'tool', 'assistant'])
    expect(chat.items[2]).toMatchObject({ status: 'ok', bodyIds: [useDocumentStore().bodies[0].id] })
    expect(chat.usage.output).toBe(10)
    expect(chat.canUndoTurn).toBe(true)
  })

  it('refuses an empty send and a second send while running', async () => {
    let release
    const gate = new Promise((resolve) => (release = resolve))
    setAgentDependencies({ client: scripted([{ gate, text: 'ok' }]) })
    const chat = useAiChatStore()
    expect(chat.canSend).toBe(false)
    chat.draft = 'hello'
    const first = useAgent().send()
    expect(chat.running).toBe(true)
    chat.draft = 'again'
    expect(chat.canSend).toBe(false)
    release()
    await first
    expect(chat.canSend).toBe(true)
  })

  it('Stop keeps nothing from the turn and offers no Undo', async () => {
    let release
    const gate = new Promise((resolve) => (release = resolve))
    setAgentDependencies({ client: scripted([{ gate, calls: [{ name: 'create', input: CUBE }] }]) })
    const chat = useAiChatStore()
    chat.draft = 'a cube'
    const agent = useAgent()
    const turn = agent.send()
    agent.stop()
    release()
    await turn

    expect(useDocumentStore().bodies).toHaveLength(0)
    expect(chat.canUndoTurn).toBe(false)
    expect(chat.items.at(-1)).toMatchObject({ kind: 'notice', level: 'cancelled' })
  })

  it('Undo AI turn takes the last turn out, and only that turn', async () => {
    setAgentDependencies({
      client: scripted([
        { calls: [{ name: 'create', input: CUBE }] },
        { text: 'First.' },
        { calls: [{ name: 'create', input: { ...CUBE, positionMm: [60, 0, 0] } }] },
        { text: 'Second.' },
      ]),
    })
    const chat = useAiChatStore()
    const agent = useAgent()
    chat.draft = 'one'
    await agent.send()
    chat.draft = 'two'
    await agent.send()
    expect(useDocumentStore().bodies).toHaveLength(2)

    agent.undoTurn()

    expect(useDocumentStore().bodies).toHaveLength(1)
    expect(chat.canUndoTurn).toBe(false)
    expect(chat.items.at(-1)).toMatchObject({ kind: 'notice' })
  })

  it('a local edit after the turn switches Undo AI turn off', async () => {
    setAgentDependencies({ client: scripted([{ calls: [{ name: 'create', input: CUBE }] }, { text: 'Done.' }]) })
    const chat = useAiChatStore()
    chat.draft = 'a cube'
    await useAgent().send()
    expect(chat.canUndoTurn).toBe(true)

    useDocumentStore().append({ id: 'mine', op: 'primitive.cuboid', name: 'Mine', params: { size: [5, 5, 5], center: [90, 0, 3] } })

    expect(chat.canUndoTurn).toBe(false)
    useAgent().undoTurn()
    expect(useDocumentStore().bodies).toHaveLength(2)
  })

  it('selectBodies selects only bodies that exist on screen, so a row from a discarded turn is inert', async () => {
    setAgentDependencies({ client: scripted([{ calls: [{ name: 'create', input: CUBE }] }, { text: 'Done.' }]) })
    const chat = useAiChatStore()
    chat.draft = 'a cube'
    const agent = useAgent()
    await agent.send()
    const [id] = chat.items.find((i) => i.kind === 'tool').bodyIds

    agent.selectBodies(['no-such-body'])
    expect(useSelectionStore().ids).toEqual([])
    agent.selectBodies([id])
    expect(useSelectionStore().ids).toEqual([id])
  })
})
