// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The share route, `#/share/v1/<payload>` (`TODO/io-016`): read at boot, at the same point
 * `HelpSheet.vue` reads `#/help/<slug>` — when the root view is set up, not behind a click or a
 * lazily loaded chunk. A link in a text message is a public contract (like `testing-012`'s cold
 * help link), and `perf-003` must not defer this; `e2e/share-link.e2e.js` is the guard.
 *
 * - **No click needed.** Called from `AppView`'s `setup`, it marks the Shared view as opening and
 *   suspends autosave *synchronously*, before `onMounted` boots storage, so the restore that
 *   follows can never be followed by a write.
 * - **The address bar is cleared after a successful load** (`history.replaceState`, as
 *   `ui-061` item 7 does for Help), so a reload or a bookmark goes to the app rather than a stale
 *   copy, and a screenshot of the address bar does not carry the project. A link that could not
 *   be read keeps its hash until **Start WarpCad**, so a reload tries it again.
 * - **Coexists with `#/help/<slug>`**: each route only ever touches a hash it owns. A share link
 *   pasted into an open tab (`hashchange`) opens the Shared view too.
 * - The live document is restored first (`persistence.start()`, idempotent — the same promise
 *   `bootStorage` awaits): Watch ends on any whole-document load, and the copy button's
 *   Replace-or-Merge question needs to know what the browser holds.
 *
 * @module composables/useShareLink
 */

import { getCurrentScope, onScopeDispose } from 'vue'

import { decodeShareLink, isShareLink } from '../core/shareLink.js'
import { usePersistenceStore } from '../stores/persistence.js'
import { useShareStore } from '../stores/share.js'

/**
 * The browser boundary this composable reads and writes; replaced in unit tests.
 *
 * @typedef {object} ShareLinkEnv
 * @property {() => string} hash The current `location.hash`.
 * @property {() => void} clearHash Drop the hash from the address bar without a navigation.
 * @property {(listener: () => void) => () => void} onHashChange Subscribe; returns the unsubscribe.
 */

/** @returns {ShareLinkEnv} */
function browserEnv() {
  return {
    hash: () => window.location.hash,
    clearHash: () => window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`),
    onHashChange(listener) {
      window.addEventListener('hashchange', listener)
      return () => window.removeEventListener('hashchange', listener)
    },
  }
}

/**
 * Open a share link: the Shared view's opening state at once, then the decoded project (or the
 * incomplete screen). Never rejects.
 *
 * @param {string} hash
 * @param {{ env: ShareLinkEnv, share: ReturnType<typeof useShareStore>, restored: () => Promise<void> }} deps
 * @returns {Promise<void>}
 */
export async function openShareLink(hash, { env, share, restored }) {
  const token = share.begin()
  const decoded = await decodeShareLink(hash)
  try {
    await restored()
  } catch {
    /* the restore reports its own failure on the chip; the link can still be shown */
  }
  if (!decoded.ok) {
    share.fail(token, decoded.reason)
    return
  }
  // Only the hash this read was for: a newer link pasted meanwhile owns the address bar now.
  if (share.show(token, decoded) && env.hash() === hash) env.clearHash()
}

/**
 * Wire the share route into the root view. Call once, from `AppView`'s `setup`.
 *
 * @param {{ env?: ShareLinkEnv }} [options]
 * @returns {{ leave: () => void }} `leave` clears an unread link's hash and returns to the editor.
 */
export function useShareLink(options = {}) {
  const env = options.env ?? browserEnv()
  const share = useShareStore()
  const persistence = usePersistenceStore()
  const restored = () => persistence.start()

  function fromHash() {
    const hash = env.hash()
    if (!isShareLink(hash)) return
    void openShareLink(hash, { env, share, restored })
  }

  // At setup, not on mount: autosave must be suspended before `bootStorage` starts the restore.
  fromHash()

  // A link pasted into a tab that is already open arrives as a hash change.
  const unsubscribe = env.onHashChange(fromHash)
  if (getCurrentScope()) onScopeDispose(unsubscribe)

  return {
    leave() {
      if (isShareLink(env.hash())) env.clearHash()
      share.start()
    },
  }
}
