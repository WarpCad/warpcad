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
  /**
   * Phone width's single sheet shows one of its views; wider layouts show Inspector and Variables
   * stacked. `'prompts'` (`TODO/ui-092`) is the Prompts view, which replaces the Inspector's
   * content at every width.
   */
  const view = ref(/** @type {'inspector' | 'variables' | 'prompts'} */ ('inspector'))
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

  /**
   * The selected body changed: a new selection means "show me that", so the Variables view yields
   * to the Inspector (`TODO/ui-059`). The Prompts view stays (`TODO/ui-092`): selecting in the 3D
   * view while reading a request keeps the request on screen. Tapping a part row in the Prompts
   * view is the one selection that returns to the Inspector, and it does that itself.
   *
   * @returns {void}
   */
  function followSelection() {
    if (view.value === 'variables') view.value = 'inspector'
  }

  return { view, open, focusName, popoverKey, announcement, announcementVersion, announce, reveal, togglePopover, followSelection }
})
