// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Runs the assistant for the chat panel (`TODO/ai-006`): glue between the agent loop
 * (`src/ai/agent.js`, `ai-005`), the key and client (`stores/assistant.js`, `ai-004`), the live
 * document and the chat store. No geometry and no HTML here — a turn is the agent's, the
 * rendering is the panel's.
 *
 * - {@link useAgent}`().send()` runs one turn from the draft and attached images. The agent
 *   builds on a fork and lands once, by merge (`TODO/ai-017`); this refreshes the document store
 *   afterwards so the viewport and History answer. Nothing is locked while it runs: the user keeps
 *   editing the live project, and the transcript says *Merged with N changes you made meanwhile*
 *   when they did. Conflicted rows get `ui-062`'s banner (`stores/merge.js`, `noteAiLanding`).
 * - `toggleWatch()` (`TODO/ai-017`) shows the running turn's fork in the viewport, read-only, in
 *   the History preview mode (`stores/timeline.js` `watchFork`); off, or the turn ending, returns
 *   to the live project. It never writes the live document.
 * - `stop()` aborts the turn; the agent discards its fork, so the project is as the user left it,
 *   including what they did during the turn.
 * - `undoTurn()` takes the last landed turn back out via the agent's `undoAiTurn` (`ui-062`'s
 *   inverse of the merge it landed by), as an `ai`-origin write that never touches the local undo
 *   stack, and names the step that blocks it when it cannot. When the last AI change was Claude
 *   Code's over the live bridge (`TODO/ai-012`), it is `useLiveBridge`'s to take back instead.
 * - `attach(file)` (`TODO/ai-008`) runs the file through `sketch-003`'s sanitiser first
 *   (`src/ai/reference.js`); the model is sent a copy made from the sanitised bytes, and the
 *   sanitised record can become a sketch slice's reference photo. A refused file is an error line
 *   in the composer, never an attachment.
 * - `confirmSave(index)` / `cancelSave(index)` (`TODO/ai-008`) answer a Save the model proposed.
 *   Only Confirm writes to My parts, through the library store's own save.
 * - The chat says "image sent" the first time images go out in each project (`ai-004`'s privacy
 *   line: the image leaves the browser only in the user's own request to their own provider).
 *
 * The agent context is one per page (it carries the earlier turns the next turn reads); the
 * provider is looked up per call, so a changed key or model applies at once.
 *
 * @module composables/useAgent
 */

import { createAgentContext, runTurn, undoAiTurn } from '../ai/agent.js'
import { downscaleToImagePart, fitWithin } from '../ai/image.js'
import { estimateCost } from '../ai/models.js'
import { prepareReference } from '../ai/reference.js'
import { addAttachment, createReferences } from '../ai/tools/image.js'
import { viewportCapture } from '../render/offscreenCapture.js'
import { bytesFromBase64 } from '../sketch/imageAsset.js'
import { decodeAssetBitmap, importImageFile } from '../sketch/imageClient.js'
import { useAiChatStore } from '../stores/aiChat.js'
import { useLiveBridge } from './useLiveBridge.js'
import { useAssistantStore } from '../stores/assistant.js'
import { useDocumentStore } from '../stores/document.js'
import { useLibraryStore } from '../stores/library.js'
import { useMergeStore } from '../stores/merge.js'
import { useProjectSettingsStore } from '../stores/projectSettings.js'
import { useSelectionStore } from '../stores/selection.js'
import { useSettingsStore } from '../stores/settings.js'
import { useTimelineStore } from '../stores/timeline.js'

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
 * Project photos prepared in one turn, at most — each is a decode and a re-encode, so a project
 * with many photos does not stall Send. The rest stay listed but cannot be sent until attached.
 */
const MAX_PROJECT_PHOTOS_PER_TURN = 4

/**
 * `TODO/ai-008`: prepare a copy of each project photo the image tools may be asked about — the
 * picture the model is sent, and the decoded bitmap the overlay draws. Records come from the live
 * document, which validated them on load; they are decoded through `sketch-003`'s decoder (which
 * validates again) and never re-read from anywhere else.
 *
 * @param {import('../ai/tools/image.js').ToolReferences} references
 * @param {import('../core/document.js').WarpDocument} document
 */
async function prepareProjectPhotos(references, document) {
  let prepared = 0
  for (const record of document.assets().values()) {
    if (prepared >= MAX_PROJECT_PHOTOS_PER_TURN) break
    const asset = /** @type {import('../sketch/imageAsset.js').ImageAssetRecord} */ (/** @type {unknown} */ (record))
    if (references.assets.has(asset.id)) continue
    prepared += 1
    try {
      const bitmap = await decodeAssetBitmap(asset)
      const part = await downscaleToImagePart(new Blob([/** @type {BlobPart} */ (bytesFromBase64(asset.params.dataBase64))], { type: asset.params.mime }))
      const size = fitWithin(asset.params.widthPx, asset.params.heightPx)
      references.assets.set(asset.id, { sent: { mediaType: part.source.media_type, data: part.source.data, widthPx: size.width, heightPx: size.height }, bitmap })
    } catch {
      // Unreadable: it stays listed, and get_reference_image says it cannot be sent.
    }
  }
}

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
  const settings = useSettingsStore()
  /** @param {string} id */
  const nameOf = (id) => documentStore.bodies.find((body) => body.id === id)?.name
  context = createAgentContext({
    client: {
      stream: (request) => (dependencies?.client ?? assistant.client()).stream(request),
    },
    document: documentStore.raw,
    references: createReferences(),
    selection: {
      ids: () => [...selection.ids],
      select: (ids) => selection.selectMany(ids),
    },
    standingInstructions: () => ({ text: documentStore.standingInstructions, trusted: project.trusted }),
    onEvent: (event) => {
      if (event.type === 'tool_call') chat.step += 1
      // `TODO/ai-017`: the fork changed; a Watch re-renders it.
      if (event.type === 'tool_result') chat.forkRevision += 1
      if (event.type === 'usage') {
        // `TODO/ai-013`: a scripted transcript has no model, so no price.
        chat.addCost(assistant.scripted ? null : estimateCost(settings.aiModel, event.usage))
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

/** @param {number} count */
const changes = (count) => `${count} change${count === 1 ? '' : 's'}`

/**
 * A core refusal as a sentence for the user: the `document.<method>: ` prefix is for developers.
 *
 * @param {unknown} error
 */
function reasonOf(error) {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^document\.\w+: /, '')
}

/**
 * @returns {{
 *   send: () => Promise<void>,
 *   stop: () => void,
 *   toggleWatch: () => void,
 *   undoTurn: () => void,
 *   attach: (file: Blob & { name?: string }) => Promise<void>,
 *   confirmSave: (index: number) => Promise<void>,
 *   cancelSave: (index: number) => void,
 *   selectBodies: (ids: readonly string[]) => void,
 * }}
 */
export function useAgent() {
  const chat = useAiChatStore()
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  const timeline = useTimelineStore()

  async function send() {
    if (!chat.canSend) return
    // `TODO/ai-007`: capture_view is offered only while the viewport can render. Read per turn —
    // the viewport mounts after this context may have been built, and a lost context clears it.
    const ctx = agentContext()
    ctx.capture = viewportCapture() ?? undefined
    const userMessage = chat.draft.trim()
    const attached = chat.attachments
    chat.draft = ''
    chat.attachments = []
    // `TODO/ai-008`: each sanitised attachment becomes a reference the image tools can name, and
    // the project's own photos get a prepared copy.
    const references = /** @type {import('../ai/tools/image.js').ToolReferences} */ (ctx.references)
    const attachmentIds = attached.map((a) => addAttachment(references, { name: a.name, record: a.reference.record, sent: a.reference.sent, bitmap: a.reference.bitmap }))
    chat.push({ kind: 'user', text: userMessage, images: attached.length })
    if (attached.length > 0 && chat.imageSentRevision !== documentStore.loadRevision) {
      chat.imageSentRevision = documentStore.loadRevision
      chat.push({
        kind: 'notice',
        level: 'info',
        // v1 is Anthropic-only (docs/decisions/ai-partner.md).
        message: 'Image sent to Anthropic with your request, using your key. It is not sent anywhere else.',
      })
    }
    chat.running = true
    chat.step = 0
    chat.forkRevision = 0
    chat.usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
    chat.resetTurnCost()
    controller = new AbortController()
    try {
      if (documentStore.raw.assets().size > 0) await prepareProjectPhotos(references, documentStore.raw)
      const outcome = await runTurn({
        userMessage: userMessage === '' ? 'Please look at the attached image.' : userMessage,
        images: attached.map((a) => a.part),
        attachmentIds,
        ctx,
        signal: controller.signal,
      })
      // The agent wrote to the raw document; the store's mirrors (bodies, History, the viewport's
      // inputs) are only refreshed by the store itself.
      documentStore.refresh()
      // `TODO/ai-014`: a turn that only revised rows (set a variable) changed the project too.
      const landed = outcome.status === 'done' && outcome.recordIds.length + outcome.revisedIds.length + outcome.removedIds.length > 0
      chat.landedVersion = landed ? documentStore.raw.version : null
      // `TODO/ai-012`: Undo AI turn takes back whichever AI change landed last.
      if (landed) chat.lastLanded = 'ai'
      if (landed) reportLanding(outcome, ctx)
      // `TODO/ai-008`: the built group is selected, so the Inspector lists its sub-parts — unless
      // the user was working during the turn (`TODO/ai-017`): their selection is theirs then.
      const quiet = outcome.meanwhile === 0
      const group = quiet ? lastGroupOf(outcome) : null
      if (group !== null) selectBodies([group])
      if (outcome.saveProposal) {
        chat.push({ kind: 'save', ...outcome.saveProposal, status: 'proposed' })
        if (group === null && quiet) selectBodies([outcome.saveProposal.bodyId])
      }
    } finally {
      chat.running = false
      controller = null
      // `TODO/ai-017`: the turn ending while watching returns to the live project.
      timeline.endWatch()
    }
  }

  /**
   * `TODO/ai-017`: what the transcript and the merge banner say about a turn that landed while
   * the user was editing.
   *
   * @param {import('../ai/agent.js').TurnOutcome} outcome
   * @param {import('../ai/agent.js').AgentContext} ctx
   */
  function reportLanding(outcome, ctx) {
    if (outcome.meanwhile > 0) {
      chat.push({ kind: 'notice', level: 'info', message: `Merged with ${changes(outcome.meanwhile)} you made meanwhile` })
    }
    for (const contest of outcome.contested) {
      chat.push({
        kind: 'notice',
        level: 'info',
        message:
          contest.kept === 'assistant'
            ? `${contest.label}: you and the Assistant both changed it; the Assistant's change was later, so it is the one kept`
            : `${contest.label}: you and the Assistant both changed it; yours was later, so it is the one kept`,
      })
    }
    const turn = ctx.aiTurns.at(-1)
    if (outcome.conflicts.length > 0 && turn !== undefined) useMergeStore().noteAiLanding(turn.change, outcome.conflicts)
  }

  /**
   * `TODO/ai-017`: **Watch** — show the running turn's fork in the viewport, read-only, or stop
   * showing it. Only while a turn runs; never writes the live document.
   */
  function toggleWatch() {
    if (timeline.watching) {
      timeline.endWatch()
      return
    }
    if (!chat.canWatch || context === null) return
    const ctx = context
    timeline.watchFork({ document: () => ctx.fork, revision: () => chat.forkRevision })
  }

  function stop() {
    controller?.abort()
  }

  function undoTurn() {
    if (!chat.canUndoTurn) return
    // `TODO/ai-012`: the last AI change was Claude Code's, over the live bridge.
    if (chat.lastLanded === 'mcp') {
      useLiveBridge().undoTurn()
      return
    }
    const ctx = agentContext()
    const turn = ctx.aiTurns.at(-1)
    if (turn === undefined) return
    try {
      undoAiTurn(documentStore.raw, turn)
    } catch (error) {
      // Refused by name (`TODO/ai-017`): a later step builds on the turn, or edited a row it changed.
      chat.push({ kind: 'notice', level: 'failed', message: `Can't undo the AI turn: ${reasonOf(error)}` })
      return
    }
    ctx.aiTurns.pop()
    chat.landedVersion = null
    selection.selectMany([])
    documentStore.refresh()
    chat.push({ kind: 'notice', level: 'info', message: 'Took the last AI turn back. The project is as it was before it.' })
  }

  /**
   * The group a landed turn built last, from its own tool results — the body to select.
   *
   * @param {import('../ai/agent.js').TurnOutcome} outcome
   * @returns {string | null}
   */
  function lastGroupOf(outcome) {
    if (outcome.status !== 'done' || outcome.recordIds.length === 0) return null
    const landed = new Set(outcome.recordIds)
    const group = [...documentStore.raw.records].reverse().find((record) => record.op === 'group.assemble' && record.id !== undefined && landed.has(record.id))
    return group?.id ?? null
  }

  /** @param {Blob & { name?: string }} file */
  async function attach(file) {
    chat.attachError = ''
    // `TODO/ai-008`: sanitise first (sketch-003); only the re-encoded pixels go any further.
    // Send is held while this runs (`chat.attaching`).
    chat.attaching += 1
    /** @type {Awaited<ReturnType<typeof prepareReference>>} */
    let prepared
    try {
      prepared = await prepareReference(file, { importImage: importImageFile, downscale: (blob) => downscaleToImagePart(blob) })
    } finally {
      chat.attaching -= 1
    }
    if (!prepared.ok) {
      if (prepared.reason !== '') chat.attachError = prepared.reason.endsWith('.') ? prepared.reason : `${prepared.reason}.`
      return
    }
    const { part, reference } = prepared
    chat.addAttachment({
      name: file.name ?? 'image',
      dataUrl: `data:${part.source.media_type};base64,${part.source.data}`,
      part,
      reference,
    })
  }

  /**
   * Save the proposal at `index` to My parts — the one place an AI proposal reaches the library,
   * and only on the user's tap.
   *
   * @param {number} index
   */
  async function confirmSave(index) {
    const item = chat.items[index]
    if (item?.kind !== 'save' || (item.status !== 'proposed' && item.status !== 'failed')) return
    chat.updateItem(index, { ...item, status: 'saving', error: undefined })
    const library = useLibraryStore()
    const result = await library.saveProposed({ bodyId: documentStore.raw.currentIdOf(item.bodyId) ?? item.bodyId, name: item.name, expose: item.expose })
    const latest = chat.items[index]
    if (latest?.kind !== 'save') return
    chat.updateItem(index, result.ok ? { ...latest, status: 'saved', op: result.op } : { ...latest, status: 'failed', error: result.reason })
  }

  /** @param {number} index */
  function cancelSave(index) {
    const item = chat.items[index]
    if (item?.kind !== 'save' || item.status !== 'proposed') return
    chat.updateItem(index, { ...item, status: 'cancelled' })
  }

  /** @param {readonly string[]} ids */
  function selectBodies(ids) {
    const live = ids
      .map((id) => documentStore.raw.currentIdOf(id) ?? id)
      .filter((id) => documentStore.bodies.some((body) => body.id === id))
    if (live.length > 0) selection.selectMany(live)
  }

  return { send, stop, toggleWatch, undoTurn, attach, confirmSave, cancelSave, selectBodies }
}
