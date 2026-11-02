// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The project's **AI step limit** as the Assistant panel and the transports see it (`TODO/ai-033`).
 *
 * The **stored** value is the document's (`documentStore.aiRecordsPerTurn`); this store adds the
 * browser's approval (`src/ai/stepLimitApproval.js`) and derives the **effective** value,
 * `min(stored, max(default, approved))` — the only number a transport reads ({@link limits}): the
 * chat when each turn starts, WebMCP and the live bridge on every call.
 *
 * It also holds the sheet's UI state (open, the field's error) and the stop notice: the limit a
 * turn or a group stopped at, shown with **Change limit…** until the limit changes.
 *
 * @module stores/aiLimit
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { checkAiStepLimit, formatSteps } from '../core/aiBudget.js'
import { browserTrustStorage } from '../ai/instructionTrust.js'
import { createStepLimitApproval, effectiveStepLimit } from '../ai/stepLimitApproval.js'
import { LIMITS } from '../ai/tools/limits.js'
import { useDocumentStore } from './document.js'

/**
 * @typedef {object} AiLimitDependencies
 * @property {import('../ai/stepLimitApproval.js').StepLimitApproval} approval
 */

/** @type {AiLimitDependencies | null} */
let injected = null

/**
 * Specs only: the approval store to use instead of the browser's `localStorage`.
 *
 * @param {AiLimitDependencies | null} dependencies
 * @returns {void}
 */
export function setAiLimitDependencies(dependencies) {
  injected = dependencies
}

/**
 * The sheet's text field as a number: digits, with thousands separators and spaces allowed as
 * typed. Anything else — a sign, a decimal point, an exponent — is `NaN`, which the range refuses.
 *
 * @param {string} text
 * @returns {number}
 */
function parseSteps(text) {
  const plain = text.replace(/[\s,]/g, '')
  return /^\d+$/.test(plain) ? Number(plain) : Number.NaN
}

export const useAiLimitStore = defineStore('aiLimit', () => {
  const documentStore = useDocumentStore()
  const approval = injected?.approval ?? createStepLimitApproval({ storage: browserTrustStorage() })

  /** The approval store is not reactive; this mirrors it. */
  const approved = ref(approval.approved())
  const isOpen = ref(false)
  /** The sentence under the field when the last Save was refused; `''` otherwise. */
  const error = ref('')
  /** The limit the last turn or group stopped at, while its notice stands; `null` for none. */
  const stoppedAt = ref(/** @type {number | null} */ (null))

  /** The project's stored value. */
  const stored = computed(() => documentStore.aiRecordsPerTurn)
  /** The value in force. */
  const effective = computed(() => effectiveStepLimit(stored.value, approved.value))
  /** The project asks for more than this browser approved. */
  const untrusted = computed(() => stored.value > effective.value)
  /** The value in force with thousands separators, for the bar button. */
  const label = computed(() => formatSteps(effective.value))

  /**
   * The caps a transport uses, the project's limit in force as `recordsPerTurn`.
   *
   * @returns {import('../ai/tools/limits.js').Limits}
   */
  function limits() {
    return { ...LIMITS, recordsPerTurn: effective.value }
  }

  function open() {
    error.value = ''
    isOpen.value = true
  }

  /** **Change limit…** on the stop notice: the same sheet. */
  function openFromNotice() {
    open()
  }

  function close() {
    isOpen.value = false
    error.value = ''
  }

  /**
   * **Save**: set the project's limit to what the person typed, and approve it in this browser.
   * Refused (out of range, not whole): the sheet stays open with the range and nothing is saved.
   *
   * @param {string} text
   * @returns {boolean} Whether it was saved.
   */
  function save(text) {
    const verdict = checkAiStepLimit(parseSteps(text))
    if (!verdict.ok) {
      error.value = verdict.reason
      return false
    }
    documentStore.setAiRecordsPerTurn(verdict.value)
    approval.approve(verdict.value)
    approved.value = approval.approved()
    stoppedAt.value = null
    close()
    return true
  }

  /** **Use N**: approve the value the loaded project states, as it is. */
  function approve() {
    approval.approve(stored.value)
    approved.value = approval.approved()
    stoppedAt.value = null
  }

  /**
   * A turn or a group stopped at the step limit: show the notice.
   *
   * @param {number} limit The limit it stopped at.
   */
  function noteStop(limit) {
    stoppedAt.value = limit
  }

  /** The notice is no longer current (a call landed, a new project). */
  function clearStop() {
    stoppedAt.value = null
  }

  return { isOpen, error, stoppedAt, stored, effective, untrusted, label, limits, open, openFromNotice, close, save, approve, noteStop, clearStop }
})
