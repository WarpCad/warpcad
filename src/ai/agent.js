// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The agent loop (`TODO/ai-005`, `docs/decisions/ai-partner.md` decisions 5 and 7).
 * Framework-free: no Vue, no DOM, no network of its own — the provider client (`ai-004`) is
 * handed in, and `ai-006`'s `useAgent` composable is the only expected caller in the app.
 *
 * ## One turn
 *
 * {@link runTurn} takes the user's message and works through tool calls until the model stops
 * calling tools (the job is done, or it ends the turn with a question), a cap stops it, the
 * user presses Stop, or something fails.
 *
 * 1. **Fork** (decision 5). A throwaway document is seeded with `foldableEntry` copies of the
 *    live entries, the rollback marker, the resolution and the standing instructions, and it
 *    shares the live `foldCache` — the same seeding the History preview does, so it costs a
 *    cache-hit fold. Every tool runs against the fork with origin `ai`; the live document is
 *    not touched while the turn runs.
 * 2. **Loop.** Each request sends the frozen {@link SYSTEM_PROMPT} as `system` and the tool
 *    definitions as `toStrictWire(inputSchema)` (strict mode drops `minimum`/`maxItems`/…; the
 *    registry still enforces them locally). Text streams out as `text` events. Each
 *    `tool_call` runs through `ToolRegistry.run` — the **only** place caps are counted
 *    (`createTurn()`, one per turn) — and the result goes back to the model wrapped by
 *    `documentDataBlock` (document text is data, decision 7), with `is_error` on a failure so
 *    the model reads the document's own `ReplayRejection` sentence and can fix its call. A
 *    result carrying an `image` (`capture_view`, `ai-007`) goes back as two blocks — the JSON
 *    without the image, then the PNG as an image block (`imagePart`) — so the model sees the
 *    picture and the base64 never sits in the JSON it reads.
 * 3. **Stop.** A result carrying `stop: true` ends the turn (steps, records, three failures in
 *    a row, wall clock), and so does a reply cut off at the output limit — the outcome says
 *    which, never a silent truncation. The wall clock is also checked before each model
 *    request, since a slow reply is not a tool call. `signal` is checked before every model
 *    request and before every tool call: tools are synchronous, so a Stop pressed while one
 *    runs is honoured the moment it returns, within the same step.
 * 4. **Land, or discard.** On success the fork's new records (those not in the seed, in log
 *    order) land on the live document as **one** atomic change —
 *    `document.batch(() => document.insertAt(rollbackAt ?? entries.length, records, { origin:
 *    'ai', intent }))`, the `applySteps` pattern, because `appendAll`'s fast path is not
 *    atomic (`ai-002`'s note). `intent` is a map by record id copied from the fork's entries,
 *    so every record keeps its own call's rationale (`ai-003`'s note). A turn record is pushed
 *    on {@link AgentContext.aiTurns} for **Undo AI turn**. On Stop, a cap, or an error the fork
 *    is dropped: the live document was never written, so its serialised NDJSON is
 *    byte-identical, and the outcome says so.
 *
 * ## What a turn is told
 *
 * The new user message carries, in order: the project's standing instructions
 * (`standingInstructionsBlock`, trusted or quoted as data — `ai-003`), the scene at the start
 * of the turn (as `document_data`, summarised after N bodies — `context.js`), any attached
 * images, then the request. Earlier turns come first, compacted by `assembleMessages`.
 * `ctx.request` on the tool context is the request, so every record carries its intent.
 *
 * ## Not here
 *
 * - **Removing a landed turn.** {@link AgentContext.aiTurns} records `{ turnId, recordIds,
 *   version }` for each landed turn. Taking one back needs decision 5's "remove a set of
 *   record ids atomically" hook in `src/core/document.js`, which does not exist yet; it ships
 *   with the **Undo AI turn** control (`ai-006`), whose precondition ("nothing newer by the
 *   user") the recorded `version` lets it check.
 * - **Pausing the human.** Decision 5 has the viewport show the fork in preview mode while a
 *   turn runs, so the user does not edit underneath it (`ai-006`). As a backstop, a turn whose
 *   live document changed while it ran is refused rather than landed over the change.
 * - **Mid-conversation `system` messages.** Decision 7 allows them for operator notes; this
 *   loop sends none. A stopped turn ends without another model call, and the next turn learns
 *   of it from `assembleMessages`' compacted line in the user message.
 *
 * @module ai/agent
 */

import { ReplayRejection, createDocument, foldableEntry } from '../core/document.js'
import { assembleMessages, compactToolResult, summariseScene } from './context.js'
import { documentDataBlock, standingInstructionsBlock } from './documentData.js'
import { imagePart } from './image.js'
import { SYSTEM_PROMPT } from './prompt.js'
import { LIMITS, createToolRegistry, createTurn, toStrictWire } from './tools/index.js'
import { sceneSummary } from './tools/read.js'

/** @typedef {import('../core/document.js').WarpDocument} WarpDocument */
/** @typedef {import('./client.js').AiClient} AiClient */
/** @typedef {import('./client.js').AiEvent} AiEvent */
/** @typedef {import('./client.js').TokenUsage} TokenUsage */
/** @typedef {import('./context.js').TurnLog} TurnLog */

/** The sentence every discarded turn ends with. */
const NOTHING_KEPT = 'Nothing from this turn was kept — the project is as it was before you asked.'

/**
 * An event for the transcript (`ai-006`). `text`, `tool_call` and `usage` are the provider's own
 * events passed through; the rest are the loop's.
 *
 * @typedef {Extract<AiEvent, { type: 'text' | 'tool_call' | 'usage' }>
 *   | { type: 'tool_result', id: string, name: string, result: Record<string, any>, isError: boolean }
 *   | { type: 'notice', kind: 'stopped' | 'cancelled' | 'failed', message: string }
 *   | { type: 'turn_end', outcome: TurnOutcome }} AgentEvent
 */

/**
 * A landed turn, for **Undo AI turn** (decision 5's AI-turn stack, in memory only).
 *
 * @typedef {object} AiTurn
 * @property {string} turnId
 * @property {string[]} recordIds What landed, in log order.
 * @property {number} version The live document's `version` right after landing: when it still
 *   matches, nothing has changed since the turn.
 */

/**
 * How a turn ended.
 *
 * @typedef {object} TurnOutcome
 * @property {'done' | 'stopped' | 'cancelled' | 'failed' | 'busy'} status `done` includes a
 *   turn that only answered or asked a question (no records). `busy`: refused because
 *   another turn is running; nothing was started.
 * @property {string | null} turnId `null` for `busy`.
 * @property {string} text The model's text from its last reply.
 * @property {string[]} recordIds What landed on the live document; empty unless `done`.
 * @property {string} [message] What the transcript says for a turn that did not finish.
 * @property {string} [limit] Which cap stopped it: a `Limits` key, or `maxTokens`.
 * @property {TokenUsage} usage Summed over the turn's requests.
 * @property {number} steps Tool calls begun.
 */

/**
 * The agent's state across turns. Built by {@link createAgentContext}.
 *
 * @typedef {object} AgentContext
 * @property {Pick<AiClient, 'stream'>} client The provider (`ai-004`, or a scripted one).
 * @property {WarpDocument} document The **live** document (raw, not a reactive proxy). It
 *   must use the op registry {@link AgentContext.registry} names.
 * @property {import('./tools/index.js').ToolRegistry} tools
 * @property {Readonly<Record<string, import('../core/kernel/registry.js').RegistryEntry>> | undefined} registry
 *   The op registry the fork is built on; `undefined` for the real one.
 * @property {import('./tools/index.js').ToolSelection | undefined} selection Browser selection.
 * @property {import('./tools/capture.js').ToolCapture | undefined} capture Browser only: the
 *   viewport's offscreen capture (`ai-007`). Read per turn; absent, `capture_view` is not offered.
 * @property {() => { text: string, trusted: boolean }} standingInstructions Read per turn.
 * @property {(event: AgentEvent) => void} onEvent
 * @property {() => number} now
 * @property {import('./tools/limits.js').Limits} limits
 * @property {TurnLog[]} turns Every finished turn, oldest first, for the next turn's context.
 * @property {AiTurn[]} aiTurns Landed turns, oldest first.
 * @property {boolean} running A turn is in progress; a second {@link runTurn} is refused.
 * @property {number} turnCount
 */

/**
 * Set up an agent over a live document.
 *
 * @param {object} options
 * @param {Pick<AiClient, 'stream'>} options.client
 * @param {WarpDocument} options.document The live document, raw.
 * @param {Readonly<Record<string, import('../core/kernel/registry.js').RegistryEntry>>} [options.registry]
 *   The op registry, when not the real one (a spec's fake).
 * @param {import('./tools/index.js').ToolRegistry} [options.tools] Built over `registry` by default.
 * @param {import('./tools/index.js').ToolSelection} [options.selection]
 * @param {import('./tools/capture.js').ToolCapture} [options.capture]
 * @param {() => { text: string, trusted: boolean }} [options.standingInstructions] The app passes
 *   the document's text with `useProjectSettingsStore().trusted`. Default: the document's own
 *   text, **untrusted** — the safe reading when nobody has said otherwise.
 * @param {(event: AgentEvent) => void} [options.onEvent]
 * @param {() => number} [options.now]
 * @param {import('./tools/limits.js').Limits} [options.limits] {@link LIMITS} by default.
 * @returns {AgentContext}
 */
export function createAgentContext(options) {
  const { client, document, registry } = options
  return {
    client,
    document,
    registry,
    tools: options.tools ?? createToolRegistry(registry ? { registry } : {}),
    selection: options.selection,
    capture: options.capture,
    standingInstructions: options.standingInstructions ?? (() => ({ text: document.standingInstructions(), trusted: false })),
    onEvent: options.onEvent ?? (() => {}),
    now: options.now ?? Date.now,
    limits: options.limits ?? LIMITS,
    turns: [],
    aiTurns: [],
    running: false,
    turnCount: 0,
  }
}

/**
 * A throwaway copy of the live document for one turn to build on (decision 5, step 1).
 *
 * @param {WarpDocument} live
 * @param {AgentContext['registry']} registry
 * @returns {WarpDocument}
 */
function forkOf(live, registry) {
  const fork = createDocument({
    ...(registry ? { registry } : {}),
    foldCache: live.foldCache,
    resolution: live.resolution(),
  })
  // `tolerateAll`: the fork mirrors the live fold, including any row the live document is
  // already carrying broken; it is not the place to discover that.
  fork.loadEntries(live.entries.map(foldableEntry), live.rollbackAt(), live.resolution(), {
    tolerateAll: true,
    standingInstructions: live.standingInstructions(),
  })
  return fork
}

/**
 * @param {number} ms
 * @returns {string}
 */
function minutes(ms) {
  const count = Math.max(1, Math.round(ms / 60000))
  return `${count} minute${count === 1 ? '' : 's'}`
}

/**
 * Read one streamed reply to its end.
 *
 * @param {AsyncIterable<AiEvent>} stream
 * @param {(event: AgentEvent) => void} emit
 * @param {TokenUsage} usage Added to in place.
 * @returns {Promise<{ kind: 'done', stopReason: string, content: any[], text: string, calls: Array<{ id: string, name: string, input: any }> } | { kind: 'error', message: string }>}
 */
async function readReply(stream, emit, usage) {
  let text = ''
  /** @type {Array<{ id: string, name: string, input: any }>} */
  const calls = []
  /** @type {Extract<AiEvent, { type: 'done' }> | null} */
  let done = null
  for await (const event of stream) {
    if (event.type === 'text') {
      text += event.text
      emit(event)
    } else if (event.type === 'tool_call') {
      calls.push({ id: event.id, name: event.name, input: event.input })
      emit(event)
    } else if (event.type === 'usage') {
      usage.input += event.usage.input
      usage.cacheRead += event.usage.cacheRead
      usage.cacheWrite += event.usage.cacheWrite
      usage.output += event.usage.output
      emit(event)
    } else if (event.type === 'done') {
      done = event
    } else if (event.type === 'error') {
      return { kind: 'error', message: event.message }
    }
  }
  if (done === null) return { kind: 'error', message: 'The reply ended before it finished.' }
  // The client hands back the full content blocks (thinking with signatures), which go back
  // unchanged. Only a provider that sends none gets them rebuilt from the events.
  const content =
    done.content.length > 0 || done.stopReason === 'aborted'
      ? done.content
      : [
          ...(text === '' ? [] : [{ type: 'text', text }]),
          ...calls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.input })),
        ]
  return { kind: 'done', stopReason: done.stopReason, content, text, calls }
}

/**
 * The new user message: standing instructions, the scene, images, then the request.
 *
 * @param {AgentContext} ctx
 * @param {WarpDocument} fork
 * @param {string} userMessage
 * @param {readonly any[]} images Image blocks from `src/ai/image.js`'s `imagePart`.
 * @returns {any[]}
 */
function userContentFor(ctx, fork, userMessage, images) {
  /** @type {any[]} */
  const content = []
  const instructions = standingInstructionsBlock(ctx.standingInstructions())
  if (instructions !== '') content.push({ type: 'text', text: instructions })
  content.push({
    type: 'text',
    text: `The scene at the start of this turn, read from the project:\n${documentDataBlock('scene', summariseScene(sceneSummary(fork)))}`,
  })
  for (const image of images) {
    if (image?.type !== 'image') throw new Error('runTurn: an attached image must be an image block (src/ai/image.js imagePart)')
    content.push(image)
  }
  content.push({ type: 'text', text: userMessage })
  return content
}

/**
 * A tool result as `tool_result` content: the JSON as `document_data`, and — for a result with
 * an `image` (`capture_view`) — the picture as an image block after it.
 *
 * @param {string} name
 * @param {Record<string, any>} result
 * @returns {string | any[]}
 */
function toolResultContent(name, result) {
  const image = result.image
  if (!image || typeof image.data !== 'string' || typeof image.mediaType !== 'string') {
    return documentDataBlock('tool_result', compactToolResult(name, result))
  }
  const { image: _image, ...rest } = result
  return [{ type: 'text', text: documentDataBlock('tool_result', compactToolResult(name, rest)) }, imagePart(image.data, image.mediaType)]
}

/**
 * Run one turn. Never throws for anything the model, the provider or a tool does: every ending
 * is a {@link TurnOutcome}, also sent as the last event (`turn_end`).
 *
 * @param {object} args
 * @param {string} args.userMessage
 * @param {readonly any[]} [args.images] Image blocks (`imagePart`).
 * @param {AgentContext} args.ctx
 * @param {AbortSignal} [args.signal] Stop.
 * @returns {Promise<TurnOutcome>}
 */
export async function runTurn({ userMessage, images = [], ctx, signal }) {
  if (ctx.running) {
    return {
      status: 'busy',
      turnId: null,
      text: '',
      recordIds: [],
      message: 'A turn is already running. Wait for it to finish, or press Stop.',
      usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
      steps: 0,
    }
  }
  ctx.running = true
  try {
    return await turnBody({ userMessage, images, ctx, signal })
  } finally {
    ctx.running = false
  }
}

/**
 * @param {{ userMessage: string, images: readonly any[], ctx: AgentContext, signal: AbortSignal | undefined }} args
 * @returns {Promise<TurnOutcome>}
 */
async function turnBody({ userMessage, images, ctx, signal }) {
  ctx.turnCount += 1
  const turnId = `ai-turn-${ctx.turnCount}`
  const live = ctx.document
  const emit = ctx.onEvent
  /** @type {TokenUsage} */
  const usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
  const turn = createTurn({ now: ctx.now, limits: ctx.limits })
  let text = ''

  /**
   * @param {TurnOutcome['status']} status
   * @param {{ message?: string, limit?: string, recordIds?: string[], messages?: any[] }} [extra]
   * @returns {TurnOutcome}
   */
  const finish = (status, extra = {}) => {
    const recordIds = extra.recordIds ?? []
    /** @type {TurnOutcome} */
    const outcome = {
      status,
      turnId,
      text,
      recordIds,
      ...(extra.message === undefined ? {} : { message: extra.message }),
      ...(extra.limit === undefined ? {} : { limit: extra.limit }),
      usage,
      steps: turn.stats.steps,
    }
    ctx.turns.push({
      request: userMessage,
      status: /** @type {TurnLog['status']} */ (status),
      recordIds,
      ...(extra.messages ? { messages: extra.messages } : {}),
    })
    if (status !== 'done' && extra.message !== undefined) {
      emit({ type: 'notice', kind: /** @type {'stopped' | 'cancelled' | 'failed'} */ (status), message: extra.message })
    }
    emit({ type: 'turn_end', outcome })
    return outcome
  }
  const cancelled = () => finish('cancelled', { message: `Stopped. ${NOTHING_KEPT}` })
  /** @param {string} reason */
  const failed = (reason) => finish('failed', { message: `${reason} ${NOTHING_KEPT}` })
  /** @param {string} limit @param {string} reason */
  const stopped = (limit, reason) => finish('stopped', { limit, message: `${reason} ${NOTHING_KEPT}` })

  if (signal?.aborted) return cancelled()

  const startVersion = live.version
  const seed = new Set(live.entries.map((entry) => entry.record))
  /** @type {WarpDocument} */
  let fork
  /** @type {any[]} */
  let messages
  /** @type {any[]} */
  let userContent
  try {
    fork = forkOf(live, ctx.registry)
    userContent = userContentFor(ctx, fork, userMessage, images)
    messages = assembleMessages(ctx.turns, userContent)
  } catch (error) {
    return failed(error instanceof Error && /^runTurn:/.test(error.message) ? error.message : 'The assistant could not read the project.')
  }
  const turnStart = messages.length - 1
  /** @type {import('./tools/index.js').ToolContext} */
  const toolCtx = {
    document: fork,
    origin: 'ai',
    turn,
    request: userMessage,
    ...(ctx.selection ? { selection: ctx.selection } : {}),
    ...(ctx.capture ? { capture: ctx.capture } : {}),
  }
  const tools = ctx.tools
    .definitions('ai')
    // No viewport to render with (WebGL never started): never offer a tool that fails every time.
    .filter((definition) => definition.name !== 'capture_view' || toolCtx.capture !== undefined)
    .map((definition) => ({ ...definition, inputSchema: toStrictWire(definition.inputSchema) }))

  try {
    for (;;) {
      if (signal?.aborted) return cancelled()
      if (turn.stats.elapsedMs > ctx.limits.turnMs) {
        return stopped('turnMs', `This turn has run for more than ${minutes(ctx.limits.turnMs)}, so it has stopped.`)
      }

      const reply = await readReply(ctx.client.stream({ system: SYSTEM_PROMPT, messages, tools, signal }), emit, usage)
      if (reply.kind === 'error') return failed(reply.message)
      if (reply.stopReason === 'aborted' || signal?.aborted) return cancelled()
      text = reply.text
      messages.push({ role: 'assistant', content: reply.content })
      if (reply.stopReason === 'max_tokens') {
        return stopped('maxTokens', 'The reply was cut off at the output limit, so this turn has stopped.')
      }
      if (reply.calls.length === 0) break

      /** @type {any[]} */
      const results = []
      for (const call of reply.calls) {
        if (signal?.aborted) return cancelled()
        const result = ctx.tools.run(toolCtx, call.name, call.input)
        const isError = result.error !== undefined
        emit({ type: 'tool_result', id: call.id, name: call.name, result, isError })
        if (result.stop === true) {
          // A failure streak carries the tool's own error plus the cap's sentence; any other
          // cap is the sentence itself.
          const reason =
            typeof result.stopReason === 'string'
              ? `${result.stopReason} The last error was: ${result.reason ? `${result.error} (${result.reason})` : result.error}`
              : String(result.error)
          return stopped(String(result.limit), reason)
        }
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: toolResultContent(call.name, result),
          ...(isError ? { is_error: true } : {}),
        })
      }
      if (signal?.aborted) return cancelled()
      messages.push({ role: 'user', content: results })
    }
  } catch (error) {
    // Not the provider (it reports failures as events) and not the model: a bug, or a
    // provider that broke its contract. The message is fixed wording, never the error's text,
    // which could quote anything (decision 8).
    return failed('Something went wrong while the assistant was working.')
  }

  // Land the fork (decision 5, step 3).
  const fresh = fork.entries.filter((entry) => !seed.has(entry.record))
  const kept = [{ role: 'user', content: userContent }, ...messages.slice(turnStart + 1)]
  if (fresh.length === 0) return finish('done', { messages: kept })
  if (live.version !== startVersion) {
    return failed('The project changed while the assistant was working, so this turn was not applied.')
  }
  /** @type {Record<string, string>} */
  const intent = {}
  for (const entry of fresh) {
    if (entry.record.id !== undefined && typeof entry.intent === 'string') intent[entry.record.id] = entry.intent
  }
  const records = fresh.map((entry) => entry.record)
  try {
    live.batch(() => live.insertAt(live.rollbackAt() ?? live.entries.length, records, { origin: 'ai', intent }))
  } catch (error) {
    return failed(error instanceof ReplayRejection ? error.message : 'The turn could not be applied to the project.')
  }
  const recordIds = records.map((record) => /** @type {string} */ (record.id))
  ctx.aiTurns.push({ turnId, recordIds, version: live.version })
  return finish('done', { recordIds, messages: kept })
}
