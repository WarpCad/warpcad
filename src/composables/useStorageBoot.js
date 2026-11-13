// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Boot the storage layer, in the one order that is correct (`TODO/ui-033`).
 *
 * `io-002` deliberately did **not** call `hosted.start()` — with no UI, a restored connection
 * with auto-push on would have pushed with nothing on screen to say so. The File menu's dot is
 * that indicator, so booting the hosted store is this task's job.
 *
 * **Order matters.** `hosted.start()` asks "is the restored document ahead of what was last
 * pushed?" by hashing the document (`data-002` §11 rule 3), and until the local restore has
 * landed the document is the empty scene — the answer would be wrong in both directions. It
 * also installs the document-version watcher that schedules pushes, which must not see the
 * restore itself as an edit. So: local restore first, hosted second.
 *
 * Never rejects: a blocked IndexedDB or credential store must degrade to "not connected"
 * rather than break first paint. Both stores already report their own failures on the chip.
 *
 * **Persistent storage (`TODO/io-028`).** After the restore, this also asks the browser to keep
 * our data (`requestPersistence`) — once, and only after a save with content, because Firefox
 * prompts and a request made before anything exists gets denied. It remembers that this browser
 * has saved before, so a database that now opens empty is reported as cleared, not new. Neither
 * runs inside the native shell, which has its own storage.
 *
 * @module composables/useStorageBoot
 */

import { watch } from 'vue'

import { isNativeShell, probeShell } from '../native/shell.js'
import { CLEARED_DATA_MESSAGE, hasSavedBefore, markSavedBefore, requestPersistence } from '../storage/persistentStorage.js'

/**
 * @param {{
 *   persistence: { start: () => Promise<void> } & Partial<{ restoreKind: string, savedAt: number, hasContent: () => boolean, reportStorageCleared: (text: string) => void }>,
 *   hosted: { start: () => Promise<void> },
 *   manager?: import('../storage/persistentStorage.js').StorageManagerLike | null,
 *   flagStorage?: import('../storage/persistentStorage.js').FlagStorage | null,
 *   native?: boolean,
 * }} stores `manager`, `flagStorage` and `native` default to the browser's own; tests inject them.
 * @returns {Promise<void>}
 */
export async function bootStorage({ persistence, hosted, manager, flagStorage, native = isNativeShell(probeShell()) }) {
  try {
    await persistence.start()
  } catch {
    /* the local store reports its own failure on the chip; hosted must still start */
  }
  if (!native) {
    try {
      watchPersistence({ persistence, manager, flagStorage })
    } catch {
      /* persistence is a courtesy; it must never stop the hosted store starting */
    }
  }
  try {
    await hosted.start()
  } catch {
    /* a credential store that will not open means "not connected", not a broken app */
  }
}

/**
 * @param {{ persistence: Parameters<typeof bootStorage>[0]['persistence'], manager?: Parameters<typeof bootStorage>[0]['manager'], flagStorage?: Parameters<typeof bootStorage>[0]['flagStorage'] }} deps
 * @returns {void}
 */
function watchPersistence({ persistence, manager, flagStorage }) {
  // Cleared data: this browser saved before, and the autosave database now opens empty.
  if (persistence.restoreKind === 'empty' && hasSavedBefore(flagStorage)) {
    persistence.reportStorageCleared?.(CLEARED_DATA_MESSAGE)
  }

  let done = false
  function afterContentSaved() {
    if (done) return
    done = true
    markSavedBefore(flagStorage)
    void requestPersistence(manager)
  }

  // A restored session is a save with content that already happened.
  if (persistence.restoreKind === 'found') {
    afterContentSaved()
    return
  }
  const stop = watch(
    () => persistence.savedAt,
    () => {
      if (done || persistence.hasContent?.() !== true) return
      afterContentSaved()
      stop()
    },
  )
}
