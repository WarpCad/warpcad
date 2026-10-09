// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Runs the assistant for the chat panel (`TODO/ai-006`): glue between the agent loop
 * (`src/ai/agent.js`, `ai-005`), the key and client (`stores/assistant.js`, `ai-004`), the live
 * document and the chat store. No geometry and no HTML here — a turn is the agent's, the
 * rendering is the panel's.
 *
 * - {@link useAgent}`().send()` runs one turn from the draft and attached images. The agent
 *   builds on a fork and lands once; this refreshes the document store afterwards so the viewport
 *   and History answer.
 * - `stop()` aborts the turn; the agent discards its fork, so the project is as it was.
 * - `undoTurn()` takes the last landed turn back out via the document's `removeRecords`, as an
 *   `ai`-origin write that never touches the local undo stack.
 *
 * The agent context is one per page (it carries the earlier turns the next turn reads); the
 * provider is looked up per call, so a changed key or model applies at once.
 *
 * @module composables/useAgent
 */

import { createAgentContext, runTurn } from '../ai/agent.js'
import { downscaleToImagePart } from '../ai/image.js'
import { useAiChatStore } from '../stores/aiChat.js'
import { useAssistantStore } from '../stores/assistant.js'
import { useDocumentStore } from '../stores/document.js'
import { useProjectSettingsStore } from '../stores/projectSettings.js'
import { useSelectionStore } from '../stores/selection.js'

/**
 * @typedef {object} AgentDependencies
 * @property {Pick<import('../ai/client.js').AiClient, 'stream'>} [client] A scripted provider
 *   (specs); default: the Assistant store's real one.
 */

/** @type {AgentDependencies | null} */
let dependencies = null

/**
 * Replace the boundary — for tests, which must never reach a network. `null` restores it.
 *
 * @param {AgentDependencies | null} next
 */
export function setAgentDependencies(next) {
  dependencies = next
  context = null
  controller = null
}

/** @type {import('../ai/agent.js').AgentContext | null} */
let context = null
/** @type {AbortController | null} */
let controller = null

/**
 * @returns {import('../ai/agent.js').AgentContext}
 */
function agentContext() {
  if (context !== null) return context
  const chat = useAiChatStore()
  const assistant = useAssistantStore()
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  const project = useProjectSettingsStore()
  /** @param {string} id */
  const nameOf = (id) => documentStore.bodies.find((body) => body.id === id)?.name
  context = createAgentContext({
    client: {
      stream: (request) => (dependencies?.client ?? assistant.client()).stream(request),
    },
    document: documentStore.raw,
    selection: {
      ids: () => [...selection.ids],
      select: (ids) => selection.selectMany(ids),
    },
    standingInstructions: () => ({ text: documentStore.standingInstructions, trusted: project.trusted }),
    onEvent: (event) => {
      if (event.type === 'tool_call') chat.step += 1
      if (event.type === 'usage') {
        const total = chat.usage
        chat.usage = {
          input: total.input + event.usage.input,
          cacheRead: total.cacheRead + event.usage.cacheRead,
          cacheWrite: total.cacheWrite + event.usage.cacheWrite,
          output: total.output + event.usage.output,
        }
      }
      chat.dispatch(event, nameOf)
    },
  })
  return context
}

/**
 * @returns {{
 *   send: () => Promise<void>,
 *   stop: () => void,
 *   undoTurn: () => void,
 *   attach: (file: Blob & { name?: string }) => Promise<void>,
 *   selectBodies: (ids: readonly string[]) => void,
 * }}
 */
export function useAgent() {
  const chat = useAiChatStore()
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()

  async function send() {
    if (!chat.canSend) return
    const userMessage = chat.draft.trim()
    const attached = chat.attachments
    chat.draft = ''
    chat.attachments = []
    chat.push({ kind: 'user', text: userMessage, images: attached.length })
    chat.running = true
    chat.step = 0
    chat.usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
    controller = new AbortController()
    try {
      const outcome = await runTurn({
        userMessage: userMessage === '' ? 'Please look at the attached image.' : userMessage,
        images: attached.map((a) => a.part),
        ctx: agentContext(),
        signal: controller.signal,
      })
      // The agent wrote to the raw document; the store's mirrors (bodies, History, the viewport's
      // inputs) are only refreshed by the store itself.
      documentStore.refresh()
      chat.landedVersion = outcome.status === 'done' && outcome.recordIds.length > 0 ? documentStore.raw.version : null
    } finally {
      chat.running = false
      controller = null
    }
  }

  function stop() {
    controller?.abort()
  }

  function undoTurn() {
    if (!chat.canUndoTurn) return
    const ctx = agentContext()
    const turn = ctx.aiTurns.at(-1)
    if (turn === undefined) return
    documentStore.raw.removeRecords(turn.recordIds, { origin: 'ai' })
    ctx.aiTurns.pop()
    chat.landedVersion = null
    selection.selectMany([])
    documentStore.refresh()
    chat.push({ kind: 'notice', level: 'info', message: 'Took the last AI turn back. The project is as it was before it.' })
  }

  /** @param {Blob & { name?: string }} file */
  async function attach(file) {
    chat.attachError = ''
    try {
      const part = await downscaleToImagePart(file)
      chat.addAttachment({
        name: file.name ?? 'image',
        dataUrl: `data:${part.source.media_type};base64,${part.source.data}`,
        part,
      })
    } catch {
      chat.attachError = 'That file could not be read as an image. Try a PNG, JPEG or WebP.'
    }
  }

  /** @param {readonly string[]} ids */
  function selectBodies(ids) {
    const live = ids
      .map((id) => documentStore.raw.currentIdOf(id) ?? id)
      .filter((id) => documentStore.bodies.some((body) => body.id === id))
    if (live.length > 0) selection.selectMany(live)
  }

  return { send, stop, undoTurn, attach, selectBodies }
}
