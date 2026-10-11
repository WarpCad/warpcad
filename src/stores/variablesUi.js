// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Variables panel's UI-only state (`TODO/ui-059`): which sheet view is up at phone
 * width, which variable row to bring into view, which bind popover is open, and the last
 * change's blast-radius line. Nothing here is document state — the variables themselves
 * live in the document's log and are read from it, never mirrored (`CLAUDE.md`).
 *
 * @module stores/variablesUi
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useVariablesUiStore = defineStore('variablesUi', () => {
  /** Phone width's single sheet shows one of two views; wider layouts show both stacked. */
  const view = ref(/** @type {'inspector' | 'variables'} */ ('inspector'))
  /** Whether the Variables section is expanded (laptop/tablet column). */
  const open = ref(true)
  /** The row **Edit variable** asked to be shown; the row clears it once it has scrolled. */
  const focusName = ref('')
  /** The param path whose bind popover is open (`<bodyId>:<path>`), or `''`. */
  const popoverKey = ref('')
  /** `piModel 4 → 5 — 3 parameters on 2 parts changed`, until the next change. */
  const announcement = ref('')
  /** The document version the line describes; it is shown only while that is still current. */
  const announcementVersion = ref(-1)

  /**
   * @param {string} text
   * @param {number} version The document version just committed.
   */
  function announce(text, version) {
    announcement.value = text
    announcementVersion.value = version
  }

  /** @param {string} name */
  function reveal(name) {
    open.value = true
    view.value = 'variables'
    focusName.value = name
  }

  /** @param {string} key */
  function togglePopover(key) {
    popoverKey.value = popoverKey.value === key ? '' : key
  }

  return { view, open, focusName, popoverKey, announcement, announcementVersion, announce, reveal, togglePopover }
})
