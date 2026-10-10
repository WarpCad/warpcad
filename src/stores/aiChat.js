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
 * is the spec's "nothing newer by the user".
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
  /** @type {import('vue').Ref<import('../ai/client.js').TokenUsage>} */
  const usage = ref({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0 })
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
    usage,
    landedVersion,
    attachError,
    imageSentRevision,
    attaching,
    canSend,
    canUndoTurn,
    dispatch,
    push,
    updateItem,
    setSheet,
    addAttachment,
    removeAttachment,
  }
})
