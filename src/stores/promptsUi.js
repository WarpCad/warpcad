// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Prompts view's UI-only state (`TODO/ui-092`, part 3): which request's row is expanded,
 * which requests a part's **Made by… ›** link filtered the list to, and which row to bring into
 * view. Nothing here is document state — the prompts are read from the document's prompt index
 * (`documentStore.promptIndex`), never mirrored (`CLAUDE.md`).
 *
 * The view itself is `variablesUi.view === 'prompts'`: the sheet's views are one value, so the
 * phone tabs, the wider layouts' bar and its back button cannot disagree about which is up.
 *
 * @module stores/promptsUi
 */

import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

import { useVariablesUiStore } from './variablesUi.js'

export const usePromptsUiStore = defineStore('promptsUi', () => {
  const sheet = useVariablesUiStore()

  /** The expanded row's prompt id, or `''`. One row at a time: its parts are the ones lit. */
  const expandedId = ref('')
  /**
   * The prompt ids a part's link filtered the list to, or `null` for every prompt.
   *
   * @type {import('vue').ShallowRef<readonly string[] | null>}
   */
  const filterIds = shallowRef(null)
  /** What the filter is for, shown as **For <this> · Show all**. */
  const filterLabel = ref('')
  /** The row to scroll into view once it is rendered; the view clears it after scrolling. */
  const revealId = ref('')

  /** Show the Prompts view, every request, nothing expanded. */
  function open() {
    expandedId.value = ''
    filterIds.value = null
    filterLabel.value = ''
    sheet.view = 'prompts'
  }

  /**
   * Show the requests behind a part (the Inspector's **Made by… ›** link): one request opens
   * expanded and is scrolled into view; several are listed on their own, labelled.
   *
   * @param {readonly string[]} promptIds Oldest first.
   * @param {string} label What they are for — the selected part's name, or `2 parts`.
   */
  function openFor(promptIds, label) {
    open()
    if (promptIds.length === 1) {
      expandedId.value = promptIds[0]
      revealId.value = promptIds[0]
    } else if (promptIds.length > 1) {
      filterIds.value = Object.freeze([...promptIds])
      filterLabel.value = label
      revealId.value = promptIds[0]
    }
  }

  /** Drop the filter: every request again. */
  function showAll() {
    filterIds.value = null
    filterLabel.value = ''
  }

  /** @param {string} promptId Expand it, or collapse it if it is the expanded row. */
  function toggle(promptId) {
    expandedId.value = expandedId.value === promptId ? '' : promptId
  }

  /** Back to the Inspector, forgetting the expansion and the filter. */
  function close() {
    expandedId.value = ''
    showAll()
    revealId.value = ''
    sheet.view = 'inspector'
  }

  return { expandedId, filterIds, filterLabel, revealId, open, openFor, showAll, toggle, close }
})
