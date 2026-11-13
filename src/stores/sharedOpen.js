// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The hand-off from the Shared view and the gist link to the File menu's open flow
 * (`TODO/ui-109`). `stores/share.js` and `stores/gist.js` ask to open a shared project as the
 * user's own copy; `stores/fileMenu.js` answers (the **Replace the project?** question, the merge
 * offer). The File menu is the UI surface and imports the other two, so they cannot import it back:
 * the request goes through this store, which imports nothing of theirs, and the File menu takes it.
 *
 * @module stores/sharedOpen
 */

import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/**
 * A shared project waiting to be opened (`TODO/io-016`).
 *
 * @typedef {object} SharedOpenRequest
 * @property {string} name Its title, which the chip and the merge toast name it by.
 * @property {string} copyText The project with a **new** project id, the recipient's own copy.
 * @property {string} theirText The project as sent, its id unchanged: Merge and Open theirs.
 * @property {string | null} projectId The id it was sent with, `null` for a legacy project.
 * @property {() => void} leave Leave the Shared view (resume autosave) just before the load, so
 *   the load is the change that autosaves.
 * @property {string} [fileName] `TODO/io-014`: a project in the native app's Documents folder (one
 *   tapped in the Files app or Mail). Open, either answer, opens that file, so it becomes the Save
 *   target; Merge merges its text as for any shared copy.
 */

export const useSharedOpenStore = defineStore('sharedOpen', () => {
  /** The request nobody has taken yet, or `null`. Non-reactive payload: it holds a callback. */
  const request = shallowRef(/** @type {SharedOpenRequest | null} */ (null))

  /**
   * Ask the File menu to open a shared project as the user's own copy.
   *
   * @param {SharedOpenRequest} next
   * @returns {void}
   */
  function ask(next) {
    request.value = next
  }

  return { request, ask }
})
