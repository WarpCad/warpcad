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

  const canSend = computed(() => !running.value && (draft.value.trim() !== '' || attachments.value.length > 0))
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
    canSend,
    canUndoTurn,
    dispatch,
    push,
    setSheet,
    addAttachment,
    removeAttachment,
  }
})
