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
 * 1. **Fork** (decision 5, amended by `TODO/ai-017`). A throwaway document with **its own
 *    replica id** (`TODO/data-008`) is seeded by merging the live document's merge state into it
 *    (`fork.mergeFrom(live.mergeState())`), so it holds the live rows *with their stamps and
 *    position keys*, the tombstones, the registers (rollback marker, resolution, standing
 *    instructions, build volume) and the user parts. It shares the live `foldCache`, so seeding
 *    is a cache-hit fold. Its merge clock starts from the live document's, and before **every**
 *    tool call it reads the live clock again (`observeMergeClock`): an edit the user made earlier
 *    in the turn is then always stamped earlier than the fork's next write, so in the merge the
 *    user's earlier row sorts first and a same-row tie is decided by who wrote last, not by
 *    replica id. Every tool runs against the fork with origin `ai`. The fork does **not** receive
 *    the user's mid-turn edits: one merge at the end, not continuous two-way merging.
 * 2. **Loop.** Each request sends the frozen {@link SYSTEM_PROMPT} as `system` and the tool
 *    definitions as `toStrictWire(inputSchema)` (strict mode drops `minimum`/`maxItems`/…; the
 *    registry still enforces them locally). Text streams out as `text` events. Each
 *    `tool_call` runs through `ToolRegistry.run` — the **only** place caps are counted
 *    (`createTurn()`, one per turn, so the caps count the fork's records, never the merged
 *    total) — and the result goes back to the model wrapped by `documentDataBlock` (document
 *    text is data, decision 7), with `is_error` on a failure so the model reads the document's
 *    own `ReplayRejection` sentence and can fix its call. A result carrying an `image`
 *    (`capture_view`, `ai-007`) goes back as two blocks — the JSON without the image, then the
 *    PNG as an image block (`imagePart`) — so the model sees the picture and the base64 never
 *    sits in the JSON it reads. `get_selection` and `select` act on the fork's **own**
 *    selection, seeded from the user's at turn start; the user's selection is never changed.
 * 3. **Stop.** A result carrying `stop: true` ends the turn (steps, records, three failures in
 *    a row, wall clock), and so does a reply cut off at the output limit — the outcome says
 *    which, never a silent truncation. The wall clock is also checked before each model
 *    request, since a slow reply is not a tool call. `signal` is checked before every model
 *    request and before every tool call: tools are synchronous, so a Stop pressed while one
 *    runs is honoured the moment it returns, within the same step.
 * 4. **Land by merge, or discard** (`TODO/ai-017`). On success the fork lands with
 *    `live.mergeFrom(fork.mergeState(), { origin: 'ai' })` (`TODO/data-010`): atomic, never on
 *    either undo stack, and every row keeps the origin and intent it was born with on the fork.
 *    The user may have edited the live document meanwhile; both writers' work lands, and a row
 *    that no longer builds is **flagged**, never re-parented (`docs-022`). The turn record is the
 *    merge's returned `change`, **restricted to what the fork did** (the fork's own diff from its
 *    seed), with the project as it stood just before and just after — so **Undo AI turn**
 *    ({@link undoAiTurn}) is `ui-062`'s inverse (`src/core/mergeUndo.js`) under origin `ai`. A
 *    landing with conflicts leaves one `document_data` line for the model's next turn naming the
 *    conflicted rows (decision 7: data, never instructions). On Stop, a cap, or an error the
 *    fork is dropped: the live document — including everything the user did during the turn —
 *    was never written by the turn, so its serialised NDJSON is byte-identical, and the outcome
 *    says so.
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
 * - **Pausing the human.** Gone with `TODO/ai-017`: the user keeps editing the live document
 *   while a turn runs, and the turn lands by merge. The app's **Watch** toggle shows the fork
 *   ({@link AgentContext.fork}) read-only in the History preview machinery; nothing here locks.
 * - **Mid-conversation `system` messages.** Decision 7 allows them for operator notes; this
 *   loop sends none. A stopped turn ends without another model call, and the next turn learns
 *   of it from `assembleMessages`' compacted line in the user message.
 *
 * @module ai/agent
 */

import { ReplayRejection, createDocument } from '../core/document.js'
import { diffStates } from '../core/merge/merge.js'
import { applyMergeUndo, mergeSnapshotOf, planMergeUndo } from '../core/mergeUndo.js'
import { counterOfId, createClock, createReplicaId } from '../core/replica.js'
import { buildNameIndex, describeRow } from '../core/timelineLabel.js'
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

/** The image tools (`ai-008`), offered only when there is an image to use them on. */
const IMAGE_TOOLS = Object.freeze(['get_reference_image', 'set_reference_scale', 'locate_in_image'])

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
 * Since `TODO/ai-017` a turn lands by merge, so this is the merge's own record: `ui-062`'s three
 * snapshots' first two and the `change` restricted to what the fork did. {@link undoAiTurn}
 * plans the inverse against the project as it is then (`src/core/mergeUndo.js`).
 *
 * @typedef {object} AiTurn
 * @property {string} turnId
 * @property {string[]} recordIds What landed, in log order.
 * @property {string[]} revisedIds Existing rows the turn revised (`TODO/ai-014`), in log order.
 * @property {string[]} removedIds Rows the turn took out (a deleted variable), in log order before
 *   the turn.
 * @property {import('../core/mergeUndo.js').MergeSnapshot} base The live project just before the
 *   turn landed — including whatever the user did while it ran.
 * @property {import('../core/mergeUndo.js').MergeSnapshot} merged The live project just after.
 * @property {import('../core/mergeUndo.js').MergeChange} change The merge's `change`, restricted
 *   to the fork's own work.
 * @property {number} version The live document's `version` right after landing: when it still
 *   matches, nothing has changed since the turn.
 */

/**
 * A row that did not land as the turn left it, because of something the user did meanwhile.
 *
 * @typedef {object} TurnConflict
 * @property {string} id
 * @property {number} step 1-based, as History numbers it.
 * @property {string} label
 * @property {string} reason The broken chip's reason (`conflicts with step N (…)`).
 */

/**
 * A row both the user (during the turn) and the turn changed — resolved by stamp, last write wins.
 *
 * @typedef {object} TurnContest
 * @property {string} id
 * @property {string} label
 * @property {'assistant' | 'yours'} kept Whose change the project now has.
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
 * @property {string[]} revisedIds `TODO/ai-014`: existing rows the turn revised in place (a
 *   variable's value, a param it bound); empty unless `done`.
 * @property {string[]} removedIds `TODO/ai-014`: rows the turn took out; empty unless `done`.
 * @property {string} [message] What the transcript says for a turn that did not finish.
 * @property {string} [limit] Which cap stopped it: a `Limits` key, or `maxTokens`.
 * @property {TokenUsage} usage Summed over the turn's requests.
 * @property {number} steps Tool calls begun.
 * @property {import('./tools/library.js').SaveProposal} [saveProposal] `TODO/ai-008`: a library Save
 *   the model proposed in a turn that landed. Nothing has been saved: the chat shows it with a
 *   Confirm button, and only that tap writes to My parts.
 * @property {number} meanwhile `TODO/ai-017`: how many changes the user made to the live project
 *   while the turn ran (History rows added, changed or removed, plus settings), for the
 *   transcript's "Merged with N changes you made meanwhile". `0` unless `done`.
 * @property {TurnConflict[]} conflicts `TODO/ai-017`: rows the landing flagged as conflicted
 *   (that were not already broken). Empty unless `done`.
 * @property {TurnContest[]} contested `TODO/ai-017`: rows both writers changed. Empty unless `done`.
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
 * @property {string | undefined} replica The replica id every turn's fork mints record ids
 *   under (`TODO/data-008`); `undefined` for a fresh random one per turn, which is what the
 *   app wants — a spec passes a fixed one so scripted turns can name the ids they create.
 * @property {import('./tools/index.js').ToolSelection | undefined} selection Browser selection.
 * @property {import('./tools/capture.js').ToolCapture | undefined} capture Browser only: the
 *   viewport's offscreen capture (`ai-007`). Read per turn; absent, `capture_view` is not offered.
 * @property {import('./tools/image.js').ToolReferences | undefined} references Browser only
 *   (`ai-008`): images attached in this chat (sanitised), the scales set on them and prepared
 *   copies of project photos. Session-scoped, so a scale set in one turn holds in the next. With
 *   nothing attached and no photo in the project, the image tools are not offered.
 * @property {() => { text: string, trusted: boolean }} standingInstructions Read per turn.
 * @property {(event: AgentEvent) => void} onEvent
 * @property {() => number} now
 * @property {import('./tools/limits.js').Limits} limits
 * @property {TurnLog[]} turns Every finished turn, oldest first, for the next turn's context.
 * @property {AiTurn[]} aiTurns Landed turns, oldest first.
 * @property {boolean} running A turn is in progress; a second {@link runTurn} is refused.
 * @property {number} turnCount
 * @property {WarpDocument | null} fork `TODO/ai-017`: the running turn's fork, read-only to
 *   everyone but the agent — what the app's **Watch** shows. `null` between turns.
 * @property {string | null} landingNote `TODO/ai-017`: the line the next turn's request carries
 *   about the last landing's conflicts, already wrapped as `document_data`; `null` for none.
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
 * @param {string} [options.replica] A fixed replica id for each turn's fork (a spec's seam).
 * @param {import('./tools/index.js').ToolSelection} [options.selection]
 * @param {import('./tools/capture.js').ToolCapture} [options.capture]
 * @param {import('./tools/image.js').ToolReferences} [options.references]
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
    replica: options.replica,
    tools: options.tools ?? createToolRegistry(registry ? { registry } : {}),
    selection: options.selection,
    capture: options.capture,
    references: options.references,
    standingInstructions: options.standingInstructions ?? (() => ({ text: document.standingInstructions(), trusted: false })),
    onEvent: options.onEvent ?? (() => {}),
    now: options.now ?? Date.now,
    limits: options.limits ?? LIMITS,
    turns: [],
    aiTurns: [],
    running: false,
    turnCount: 0,
    fork: null,
    landingNote: null,
  }
}

/**
 * A throwaway replica of the live document for one turn to build on (decision 5, step 1;
 * `TODO/ai-017`).
 *
 * @param {WarpDocument} live
 * @param {AgentContext['registry']} registry
 * @param {AgentContext['replica']} replica
 * @returns {WarpDocument}
 */
function forkOf(live, registry, replica) {
  // A merge addresses rows by id; a row without one could neither be seeded nor landed.
  if (live.entries.some((entry) => entry.record.id === undefined)) {
    throw new Error('runTurn: a step in this project has no id, so a turn could not be merged back into it.')
  }
  // Its own replica id, never the live document's: the fork and the live document are two
  // writers (`TODO/data-008`), and sharing one would let them mint the same id or stamp. Its id
  // counter starts past every id in the live log, as a load's would, so the ids a turn mints read
  // the same as they did before the fork was seeded by merge.
  const clock = createClock(replica ?? createReplicaId())
  for (const entry of live.entries) clock.observe(counterOfId(entry.record.id))
  // `TODO/data-013`: a project that has not been edited yet has no id. Without this, the fork's
  // first tool call and the user's first edit meanwhile would each mint their own, and the
  // landing merge would refuse the turn as a different project. The fork copies this one.
  live.ensureProjectId()
  const fork = createDocument({
    ...(registry ? { registry } : {}),
    clock,
    foldCache: live.foldCache,
    resolution: live.resolution(),
  })
  // Seeded by merge, not by `loadEntries`: a load would *derive* legacy stamps and position keys
  // from row order, and the fork's new rows would then be keyed against neighbours the live
  // document keys differently, and its revisions would lose to the live rows' newer `born`.
  // Merging the live state into an empty replica copies every row with its own metadata.
  fork.mergeFrom(live.mergeState(), { origin: 'merge' })
  fork.observeMergeClock(live.mergeClock())
  return fork
}

/**
 * The fork's own selection (`TODO/ai-017`): `get_selection` and `select` read and write this,
 * seeded from the user's at turn start, so a turn never changes what the user has selected.
 *
 * @param {readonly string[]} initial
 * @returns {import('./tools/index.js').ToolSelection}
 */
function forkSelection(initial) {
  let current = [...initial]
  return {
    ids: () => [...current],
    select: (ids) => {
      current = [...ids]
    },
  }
}

/** @param {ReturnType<typeof diffStates>} change */
function isEmptyChange(change) {
  return (
    change.added.length === 0 &&
    change.revised.length === 0 &&
    change.removed.length === 0 &&
    change.moved.length === 0 &&
    change.registers.length === 0 &&
    change.parts.length === 0
  )
}

/**
 * Changes counted the way the merge summary counts them (`stores/merge.js` `describeMerge`):
 * History rows added, changed (revised or re-ordered) or removed, each once, plus settings.
 *
 * @param {ReturnType<typeof diffStates>} change
 * @returns {number}
 */
function countChanges(change) {
  const gone = new Set([...change.added, ...change.removed])
  const changed = new Set([...change.revised, ...change.moved].filter((id) => !gone.has(id)))
  return change.added.length + changed.size + change.removed.length + change.registers.length
}

/**
 * The fork's own work: its diff from the seed, with "revised" narrowed to rows whose record or
 * fold flags really differ (a variable set 4 → 5 → 4 stamps the row twice and changes nothing).
 *
 * @param {import('../core/merge/state.js').MergeState} seed
 * @param {import('../core/merge/state.js').MergeState} now
 * @returns {ReturnType<typeof diffStates>}
 */
function forkWork(seed, now) {
  const change = diffStates(seed, now)
  const revised = change.revised.filter((id) => {
    const before = seed.entries.get(id)
    const after = now.entries.get(id)
    if (!before || !after) return true
    if (before.born.counter !== after.born.counter || before.born.replica !== after.born.replica) return true
    return (
      JSON.stringify(before.record) !== JSON.stringify(after.record) ||
      (before.suppressed?.[0] === true) !== (after.suppressed?.[0] === true) ||
      (before.leftBroken?.[0] === true) !== (after.leftBroken?.[0] === true)
    )
  })
  return { ...change, revised }
}

/**
 * `change`, keeping only what `own` (the fork's work) also lists, category by category.
 *
 * @param {ReturnType<typeof diffStates>} change
 * @param {ReturnType<typeof diffStates>} own
 * @returns {ReturnType<typeof diffStates>}
 */
function restrictTo(change, own) {
  /** @param {readonly string[]} list @param {readonly string[]} allowed */
  const keep = (list, allowed) => {
    const set = new Set(allowed)
    return list.filter((id) => set.has(id))
  }
  const touched = [...own.added, ...own.revised, ...own.removed, ...own.moved]
  return {
    added: keep(change.added, own.added),
    revised: keep(change.revised, touched),
    removed: keep(change.removed, own.removed),
    moved: keep(change.moved, touched),
    registers: keep(change.registers, own.registers),
    parts: keep(change.parts, own.parts),
  }
}

/**
 * @param {readonly import('../core/document.js').DocumentEntry[]} entries
 * @param {Iterable<string>} ids
 * @returns {string[]} The ids, in `entries`' order.
 */
function inLogOrder(entries, ids) {
  const wanted = new Set(ids)
  return entries.flatMap((entry) => (entry.record.id !== undefined && wanted.has(entry.record.id) ? [entry.record.id] : []))
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
 * @param {readonly string[]} attachmentIds `TODO/ai-008`: the reference id of each image, in the
 *   same order (`attachment-N`), when it was attached as one; said in a line before the image so
 *   the model can name it to the image tools.
 * @returns {any[]}
 */
function userContentFor(ctx, fork, userMessage, images, attachmentIds) {
  /** @type {any[]} */
  const content = []
  const instructions = standingInstructionsBlock(ctx.standingInstructions())
  if (instructions !== '') content.push({ type: 'text', text: instructions })
  // `TODO/ai-017`: what the last landing did to the model's own rows, said once, as data.
  if (ctx.landingNote !== null) content.push({ type: 'text', text: ctx.landingNote })
  // `TODO/io-007`: the printer's build volume is a project setting the user edits beside the
  // standing instructions; it is mirrored into every turn so "split it to fit" means this printer.
  const volume = fork.buildVolume?.()
  if (volume) {
    content.push({
      type: 'text',
      text: `The project's build volume (File ▸ Project settings): ${volume.widthMm} × ${volume.depthMm} × ${volume.heightMm} mm. Use it instead of the default printing build volume.`,
    })
  }
  content.push({
    type: 'text',
    text: `The scene at the start of this turn, read from the project:\n${documentDataBlock('scene', summariseScene(sceneSummary(fork)))}`,
  })
  for (const [index, image] of images.entries()) {
    if (image?.type !== 'image') throw new Error('runTurn: an attached image must be an image block (src/ai/image.js imagePart)')
    const id = attachmentIds[index]
    const attachment = id === undefined ? undefined : ctx.references?.attachments.find((candidate) => candidate.id === id)
    if (attachment) {
      content.push({
        type: 'text',
        text: `The next image is ${attachment.id} (${attachment.sent.widthPx} × ${attachment.sent.heightPx} px as you are sent it). Use "${attachment.id}" as sliceId with the image tools.`,
      })
    }
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
 * @param {readonly string[]} [args.attachmentIds] `TODO/ai-008`: each image's reference id, in order.
 * @param {AgentContext} args.ctx
 * @param {AbortSignal} [args.signal] Stop.
 * @returns {Promise<TurnOutcome>}
 */
export async function runTurn({ userMessage, images = [], attachmentIds = [], ctx, signal }) {
  if (ctx.running) {
    return {
      status: 'busy',
      turnId: null,
      text: '',
      recordIds: [],
      revisedIds: [],
      removedIds: [],
      message: 'A turn is already running. Wait for it to finish, or press Stop.',
      usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 },
      steps: 0,
      meanwhile: 0,
      conflicts: [],
      contested: [],
    }
  }
  ctx.running = true
  try {
    return await turnBody({ userMessage, images, attachmentIds, ctx, signal })
  } finally {
    ctx.running = false
    ctx.fork = null
  }
}

/**
 * @param {{ userMessage: string, images: readonly any[], attachmentIds: readonly string[], ctx: AgentContext, signal: AbortSignal | undefined }} args
 * @returns {Promise<TurnOutcome>}
 */
async function turnBody({ userMessage, images, attachmentIds, ctx, signal }) {
  ctx.turnCount += 1
  const turnId = `ai-turn-${ctx.turnCount}`
  const live = ctx.document
  const emit = ctx.onEvent
  /** @type {TokenUsage} */
  const usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
  const turn = createTurn({ now: ctx.now, limits: ctx.limits })
  let text = ''
  /** @type {import('./tools/library.js').SaveProposal[]} */
  const proposals = []

  /**
   * @param {TurnOutcome['status']} status
   * @param {{ message?: string, limit?: string, recordIds?: string[], revisedIds?: string[], removedIds?: string[], messages?: any[], meanwhile?: number, conflicts?: TurnConflict[], contested?: TurnContest[] }} [extra]
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
      revisedIds: extra.revisedIds ?? [],
      removedIds: extra.removedIds ?? [],
      ...(extra.message === undefined ? {} : { message: extra.message }),
      ...(extra.limit === undefined ? {} : { limit: extra.limit }),
      usage,
      steps: turn.stats.steps,
      meanwhile: extra.meanwhile ?? 0,
      conflicts: extra.conflicts ?? [],
      contested: extra.contested ?? [],
      // Only a turn that landed has a body to save; a discarded turn's proposal goes with it.
      ...(status === 'done' && proposals.length > 0 ? { saveProposal: proposals[0] } : {}),
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

  /** @type {WarpDocument} */
  let fork
  /** @type {any[]} */
  let messages
  /** @type {any[]} */
  let userContent
  /** @type {import('../core/merge/state.js').MergeState} */
  let seed
  try {
    fork = forkOf(live, ctx.registry, ctx.replica)
    seed = fork.mergeState()
    userContent = userContentFor(ctx, fork, userMessage, images, attachmentIds)
    messages = assembleMessages(ctx.turns, userContent)
  } catch (error) {
    return failed(error instanceof Error && /^runTurn:/.test(error.message) ? error.message : 'The assistant could not read the project.')
  }
  // Said once: this turn's request now carries it.
  ctx.landingNote = null
  ctx.fork = fork
  const turnStart = messages.length - 1
  /** @type {import('./tools/index.js').ToolContext} */
  const toolCtx = {
    document: fork,
    origin: 'ai',
    turn,
    request: userMessage,
    ...(ctx.selection ? { selection: forkSelection(ctx.selection.ids()) } : {}),
    ...(ctx.capture ? { capture: ctx.capture } : {}),
    ...(ctx.references ? { references: ctx.references } : {}),
    proposals,
  }
  // `TODO/ai-008`: with nothing attached and no photo in the project, the image tools would fail
  // every time, so they are not offered.
  const hasImages = (ctx.references?.attachments.length ?? 0) > 0 || fork.assets().size > 0
  const tools = ctx.tools
    .definitions('ai')
    // No viewport to render with (WebGL never started): never offer a tool that fails every time.
    .filter((definition) => definition.name !== 'capture_view' || toolCtx.capture !== undefined)
    .filter((definition) => hasImages || !IMAGE_TOOLS.includes(definition.name))
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
        // `TODO/ai-017`: anything the user wrote before this call is stamped earlier than it.
        fork.observeMergeClock(live.mergeClock())
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

  // Land the fork by merge (decision 5, step 4; `TODO/ai-017`).
  const kept = [{ role: 'user', content: userContent }, ...messages.slice(turnStart + 1)]
  const forkState = fork.mergeState()
  const own = forkWork(seed, forkState)
  if (isEmptyChange(own)) return finish('done', { messages: kept })
  const before = live.mergeState()
  const base = mergeSnapshotOf(live)
  const theirs = diffStates(seed, before)
  /** @type {ReturnType<WarpDocument['mergeFrom']>} */
  let landed
  try {
    landed = live.mergeFrom(forkState, { origin: 'ai' })
  } catch (error) {
    return failed(error instanceof ReplayRejection ? error.message : 'The turn could not be applied to the project.')
  }
  const change = restrictTo(landed.change, own)
  const gone = new Set([...change.added, ...change.removed])
  const recordIds = inLogOrder(live.entries, change.added)
  const revisedIds = inLogOrder(live.entries, change.revised.filter((id) => !gone.has(id)))
  const removedIds = inLogOrder(base.entries, change.removed)

  const names = buildNameIndex(live.records)
  /** @param {string} id @param {import('../core/kernel/registry.js').OpRecord | undefined} record */
  const labelOf = (id, record) => (record ? describeRow(record, names) : id)
  const wasBroken = new Set(base.entries.filter((entry) => entry.leftBroken === true).map((entry) => entry.record.id))
  /** @type {TurnConflict[]} */
  const conflicts = landed.conflicts
    .filter((conflict) => !wasBroken.has(conflict.id))
    .map(({ id, step, label, reason }) => ({ id, step, label, reason }))
  // Rows both writers changed: the merge kept the later stamp; say whose.
  const userTouched = new Set([...theirs.revised, ...theirs.removed])
  /** @type {TurnContest[]} */
  const contested = [...own.revised, ...own.removed]
    .filter((id) => userTouched.has(id))
    .map((id) => {
      const now = live.entries.find((entry) => entry.record.id === id)
      const forkRow = forkState.entries.get(id)
      const assistant = now === undefined ? forkRow === undefined : forkRow !== undefined && JSON.stringify(now.record) === JSON.stringify(forkRow.record)
      const record = now?.record ?? /** @type {any} */ (forkRow?.record ?? before.entries.get(id)?.record)
      return { id, label: labelOf(id, record), kept: /** @type {'assistant' | 'yours'} */ (assistant ? 'assistant' : 'yours') }
    })
  if (conflicts.length > 0 || contested.length > 0) {
    ctx.landingNote =
      'Your last turn was merged into the project together with edits the user made while it ran. ' +
      'These of your steps did not land as you left them; check them (get_timeline) before building on them:\n' +
      documentDataBlock('merge', {
        conflicted: conflicts.map(({ id, step, label, reason }) => ({ id, step, label, reason })),
        contested: contested.map(({ id, label, kept: winner }) => ({ id, label, kept: winner === 'assistant' ? 'yours' : 'the user’s' })),
      })
  }

  ctx.aiTurns.push({
    turnId,
    recordIds,
    revisedIds,
    removedIds,
    base,
    merged: mergeSnapshotOf(live),
    change,
    version: live.version,
  })
  return finish('done', { recordIds, revisedIds, removedIds, messages: kept, meanwhile: countChanges(theirs), conflicts, contested })
}

/**
 * **Undo AI turn** (`TODO/ai-006`, decision 5; `TODO/ai-017`): take a landed turn back out of the
 * live document as one atomic `ai` change, leaving both local undo stacks alone. The turn landed
 * by merge, so this is `ui-062`'s inverse of a merge (`src/core/mergeUndo.js`), planned against
 * the project as it is now: the rows the turn added come out, the rows it revised get their old
 * records back, and the rows it removed come back where they were, with their own origin and
 * intent. Rows the user made — during the turn or after it — stay.
 *
 * @param {WarpDocument} live
 * @param {AiTurn} turn
 * @returns {void}
 * @throws {Error} The refusal, by name — a later step builds on one of the turn's rows, or the
 *   user has since edited a row the turn revised; nothing is changed.
 */
export function undoAiTurn(live, turn) {
  const plan = planMergeUndo(turn.base, turn.merged, mergeSnapshotOf(live), turn.change)
  if (!plan.ok) throw new Error(plan.message.replace('after the merge', 'after this turn'))
  applyMergeUndo(live, plan, { origin: 'ai' })
}
