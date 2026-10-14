// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The chat panel's **UI state** (`TODO/ai-006`): the sheet's height, the draft, the attached
 * images, the transcript and whether a turn is running. Orchestration — running a turn,
 * stopping it, taking it back — is `composables/useAgent.js`; the key and connection are
 * `stores/assistant.js`.
 *
 * The transcript (display text and tool rows) may live here; **document state never does**
 * (`CLAUDE.md`). Undo AI turn is gated on `landedVersion`: the document `version` right after
 * the last turn landed, so any later change — a local edit, a Library drop — turns it off, which
 * is the spec's "nothing newer by the user". Edits made *while* a turn runs do not: the turn lands
 * by merge after them (`TODO/ai-017`), and the version is read after landing.
 *
 * **Watch** (`TODO/ai-017`) is offered only while a turn runs ({@link canWatch}); whether it is on
 * is the timeline store's (`watching`), since it decides what the viewport shows.
 * `forkRevision` counts the running turn's tool results, so a watched fork re-renders.
 *
 * @module stores/aiChat
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { applyEvent } from '../ai/transcript.js'
import { useDocumentStore } from './document.js'

/** The bottom sheet's three snap heights at phone and tablet width. */
export const SHEET_HEIGHTS = /** @type {const} */ (['peek', 'half', 'full'])

/**
 * @typedef {object} Attachment
 * @property {string} name
 * @property {string} dataUrl For the thumbnail.
 * @property {ReturnType<typeof import('../ai/image.js').imagePart>} part What goes to the model.
 * @property {import('../ai/reference.js').PreparedReference} reference `TODO/ai-008`: the sanitised
 *   record (and its decoded copy) the image tools measure and a sketch may keep.
 */

export const useAiChatStore = defineStore('aiChat', () => {
  const documentStore = useDocumentStore()

  /** @type {import('vue').Ref<'peek' | 'half' | 'full'>} */
  const sheet = ref('half')
  const draft = ref('')
  /** @type {import('vue').ShallowRef<import('../ai/transcript.js').TranscriptItem[]>} */
  const items = shallowRef([])
  /** @type {import('vue').ShallowRef<Attachment[]>} */
  const attachments = shallowRef([])
  const running = ref(false)
  /** Tool calls begun in the running turn, for the peek line ("Working… step 4"). */
  const step = ref(0)
  /** `TODO/ai-017`: tool results in the running turn — what a watched fork re-renders on. */
  const forkRevision = ref(0)
  /** @type {import('vue').Ref<import('../ai/client.js').TokenUsage>} */
  const usage = ref({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0 })
  /**
   * `TODO/ai-013`: the running or last turn's estimated cost in US dollars (`null` once any of its
   * requests had no price) and the session's total. Estimates from `ai/models.js`, never billing.
   */
  const turnCost = ref(/** @type {number | null} */ (0))
  const sessionCost = ref(0)
  /** The document version right after the last turn landed, or `null` when none is takeable. */
  const landedVersion = ref(/** @type {number | null} */ (null))
  /** The attach-image failure, in words, or ''. */
  const attachError = ref('')
  /**
   * `TODO/ai-008`: the document's `loadRevision` when "image sent" was last said, so it is said
   * once per project (a New or an Open is a new project).
   */
  const imageSentRevision = ref(/** @type {number | null} */ (null))
  /**
   * `TODO/ai-008`: attachments still going through the sanitiser. Send waits for them — a tap
   * before the image is ready would otherwise send the message without it, silently.
   */
  const attaching = ref(0)

  const canSend = computed(() => !running.value && attaching.value === 0 && (draft.value.trim() !== '' || attachments.value.length > 0))
  /** `TODO/ai-017`: **Watch** is a view of the running turn, so it is offered only during one. */
  const canWatch = computed(() => running.value)
  const canUndoTurn = computed(
    () => !running.value && landedVersion.value !== null && documentStore.version === landedVersion.value
  )

  /**
   * @param {import('../ai/agent.js').AgentEvent} event
   * @param {(id: string) => string | undefined} [nameOf]
   */
  function dispatch(event, nameOf) {
    items.value = applyEvent(items.value, event, nameOf)
  }

  /** @param {import('../ai/transcript.js').TranscriptItem} item */
  function push(item) {
    items.value = [...items.value, item]
  }

  /**
   * Replace one transcript item — a save proposal moving from proposed to saved.
   *
   * @param {number} index
   * @param {import('../ai/transcript.js').TranscriptItem} item
   */
  function updateItem(index, item) {
    items.value = items.value.map((existing, at) => (at === index ? item : existing))
  }

  /** A new turn starts at zero; the session total carries on. */
  function resetTurnCost() {
    turnCost.value = 0
  }

  /**
   * @param {number | null} dollars One request's estimate, `null` when it could not be priced —
   *   which makes the turn's figure unknown rather than silently low.
   */
  function addCost(dollars) {
    if (dollars === null) {
      turnCost.value = null
      return
    }
    if (turnCost.value !== null) turnCost.value += dollars
    sessionCost.value += dollars
  }

  /** @param {'peek' | 'half' | 'full'} height */
  function setSheet(height) {
    sheet.value = height
  }

  /** @param {Attachment} attachment */
  function addAttachment(attachment) {
    attachments.value = [...attachments.value, attachment]
  }

  /** @param {number} index */
  function removeAttachment(index) {
    // `TODO/ai-008`: the sanitiser's decoded copy is only kept for a sent image's overlay.
    const removed = /** @type {{ close?: () => void } | undefined} */ (attachments.value[index]?.reference?.bitmap)
    removed?.close?.()
    attachments.value = attachments.value.filter((_, at) => at !== index)
  }

  return {
    sheet,
    draft,
    items,
    attachments,
    running,
    step,
    forkRevision,
    usage,
    turnCost,
    sessionCost,
    resetTurnCost,
    addCost,
    landedVersion,
    attachError,
    imageSentRevision,
    attaching,
    canSend,
    canWatch,
    canUndoTurn,
    dispatch,
    push,
    updateItem,
    setSheet,
    addAttachment,
    removeAttachment,
  }
})
