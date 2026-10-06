// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * File ▾ → **Project settings…** (`TODO/ai-003`): UI state for the dialog that edits the
 * project's standing instructions, and whether this browser trusts them.
 *
 * UI state only. The instructions themselves are document state (`raw.standingInstructions`,
 * persisted in the project file's state line by `src/core/project.js`); this store opens and
 * closes the dialog, saves through `documentStore.setStandingInstructions`, and answers
 * "trusted?" from `src/ai/instructionTrust.js`:
 *
 * - text the user **saves** here is trusted (they typed it in this browser);
 * - text that arrived with a loaded file is not, until they press **Use this project's
 *   instructions** (`docs/decisions/ai-partner.md` decision 7, the user's item 4).
 *
 * `ai-005` reads {@link trusted} to decide how the instructions are given to the model
 * (`standingInstructionsBlock` in `src/ai/documentData.js`).
 *
 * @module stores/projectSettings
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { browserTrustStorage, createInstructionTrust } from '../ai/instructionTrust.js'
import { useDocumentStore } from './document.js'

/**
 * @typedef {object} ProjectSettingsDependencies
 * @property {import('../ai/instructionTrust.js').InstructionTrust} trust
 */

/** @type {ProjectSettingsDependencies | null} */
let injected = null

/**
 * Replace the trust store (a spec's in-memory one), or `null` to go back to the browser's.
 * Call before the store is first used in a Pinia instance.
 *
 * @param {ProjectSettingsDependencies | null} dependencies
 */
export function setProjectSettingsDependencies(dependencies) {
  injected = dependencies
}

export const useProjectSettingsStore = defineStore('projectSettings', () => {
  const documentStore = useDocumentStore()
  const trustStore = injected?.trust ?? createInstructionTrust({ storage: browserTrustStorage() })

  const isOpen = ref(false)
  /** Bumped when trust changes, since the trust store itself is not reactive. */
  const trustRevision = ref(0)

  /** Whether the current instructions may be used as instructions (decision 7). */
  const trusted = computed(() => {
    void trustRevision.value
    return trustStore.isTrusted(documentStore.standingInstructions)
  })

  function open() {
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  /**
   * Save the edited instructions to the document and trust them — the user typed them here.
   *
   * @param {string} text
   */
  function save(text) {
    documentStore.setStandingInstructions(text)
    trustStore.trust(documentStore.standingInstructions)
    trustRevision.value += 1
    isOpen.value = false
  }

  /** **Use this project's instructions**: trust what the loaded file carries, as it is. */
  function trustCurrent() {
    trustStore.trust(documentStore.standingInstructions)
    trustRevision.value += 1
  }

  return { isOpen, trusted, open, close, save, trustCurrent }
})
