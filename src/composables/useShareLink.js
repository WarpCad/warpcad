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
 * ## The gist route, `#/gist/<id>` (`TODO/io-017`)
 *
 * Read at the same point, the same way: parsed at boot beside the share route (never behind a
 * click or a lazy chunk), autosave suspended synchronously, the hash cleared after a successful
 * load, a pasted link arriving as `hashchange`. The gist is read **with no token**
 * (`stores/gist.js`'s `readGist`), its project text goes through `parseProject` — the strict
 * reader **Open…** uses — and is shown through the same Shared view (`stores/share.js`), so every
 * validator applies and opening never writes. What the Shared view cannot say lives on the gist
 * store: the gist-specific reason a link failed (`gistMessages.js`'s sentence for the
 * full-screen message), the gist's description as plain text, and **own-link** — the link's gist
 * id equals the open (or just restored) project's own `gist` field, so the owner is offered
 * **Open it to edit** and **Make a copy** instead of a read-only copy of their own work. A pasted
 * value is trimmed before `parseGistHash`, which is strict about everything else.
 *
 * @module composables/useShareLink
 */

import { getCurrentScope, onScopeDispose, toRaw } from 'vue'

import { isGistLink, parseGistHash } from '../core/gistLink.js'
import { gistFailureOf, plainGistDescription } from '../core/gistMessages.js'
import { parseNdjson } from '../core/ndjson.js'
import { parseProject } from '../core/project.js'
import { decodeShareLink, isShareLink } from '../core/shareLink.js'
import { useDocumentStore } from '../stores/document.js'
import { useGistStore } from '../stores/gist.js'
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
  if (share.show(token, decoded)) {
    // `TODO/ui-091`: the project's description opens over the model, once.
    share.offerAbout(false)
    if (env.hash() === hash) env.clearHash()
  }
}

/**
 * The open project's own `gist` field, or `null`.
 *
 * @returns {import('../core/gistField.js').GistField | null}
 */
function liveGistOf() {
  return toRaw(useDocumentStore().raw).gist()
}

/**
 * Whether a link to gist `id` is the owner opening their own: the open (or just restored)
 * project is published as that gist and, when a GitHub account is connected here, by that
 * account. A project file someone sent by hand carries its sender's field, and that person
 * opening the sender's link is a recipient, not the owner.
 *
 * @param {string} id
 * @param {import('../core/gistField.js').GistField | null} field
 * @param {ReturnType<typeof useGistStore>} gist
 * @returns {boolean}
 */
function isOwnLink(id, field, gist) {
  if (field === null || field.id !== id) return false
  return !gist.connected || field.owner === gist.login
}

/**
 * Open a gist link: the Shared view's opening state at once, then the gist's project (the
 * owner's own-link choice, or the full-screen message). Never rejects.
 *
 * @param {string} hash The hash as it is in the address bar (a pasted value may carry whitespace).
 * @param {{ env: ShareLinkEnv, share: ReturnType<typeof useShareStore>, gist: ReturnType<typeof useGistStore>,
 *   restored: () => Promise<void>, liveGist?: () => import('../core/gistField.js').GistField | null }} deps
 * @returns {Promise<void>}
 */
export async function openGistLink(hash, { env, share, gist, restored, liveGist = liveGistOf }) {
  const id = parseGistHash(hash.trim())
  const token = share.begin()
  const generation = gist.beginLink(id)

  /** @type {import('../storage/gistBackend.js').GistRead | null} */
  let read = null
  /** @type {import('../core/gistMessages.js').GistMessageKind | null} */
  let failure = id === null ? 'invalid-link' : null
  if (id !== null) {
    try {
      read = await gist.readGist(id)
    } catch (error) {
      failure = gistFailureOf(error, 'open').kind
    }
  }
  try {
    await restored()
  } catch {
    /* the restore reports its own failure on the chip; the link can still be shown */
  }
  // Which account is connected here, for the own-link check: a stored-credential read, no network.
  await gist.start()
  if (read === null) {
    share.fail(token, failure === 'invalid-link' ? 'malformed' : 'unreadable')
    gist.failLink(generation, failure ?? 'unknown')
    return
  }

  // The strict reader Open… uses: any bad line refuses the whole file, never a half-parsed project.
  /** @type {object[]} */
  let records
  try {
    parseProject(read.text)
    records = parseNdjson(read.text).records
  } catch {
    share.fail(token, 'unreadable')
    gist.failLink(generation, 'unreadable')
    return
  }
  const description = plainGistDescription(read.description)
  const name = description || plainGistDescription(read.fileName.replace(/\.ndjson$/, ''))
  const own = id !== null && isOwnLink(id, liveGist(), gist)
  if (!share.show(token, { ok: true, records, name, note: '' })) {
    gist.failLink(generation, 'unreadable')
    return
  }
  // Only the hash this read was for: a newer link pasted meanwhile owns the address bar now.
  if (gist.showLink(generation, { description, own, text: read.text, records, name })) {
    // `TODO/ui-091`: the project's description opens over the model, once — not for the owner's own link.
    share.offerAbout(own)
    if (env.hash() === hash) env.clearHash()
  }
}

/**
 * Wire the share route into the root view. Call once, from `AppView`'s `setup`.
 *
 * @param {{ env?: ShareLinkEnv }} [options]
 * @returns {{ leave: () => void }} `leave` clears an unread link's hash (share or gist) and returns
 *   to the editor.
 */
export function useShareLink(options = {}) {
  const env = options.env ?? browserEnv()
  const share = useShareStore()
  const gist = useGistStore()
  const persistence = usePersistenceStore()
  const restored = () => persistence.start()

  function fromHash() {
    const hash = env.hash()
    if (isGistLink(hash)) {
      void openGistLink(hash, { env, share, gist, restored })
      return
    }
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
      const hash = env.hash()
      if (isShareLink(hash) || isGistLink(hash)) env.clearHash()
      share.start()
    },
  }
}
