// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The credential boundary (`TODO/io-002`) — where a user-supplied secret lives.
 *
 * `io-002`'s own Goal records the correction that made this file necessary:
 * `TODO/ROADMAP.md`'s M6 section says the hosted backend reuses "the same BYOK
 * pattern the AI chat client already uses", and `src/ai/` is a `.gitkeep`. There
 * is no such pattern yet, so this is the **first** one — and it is written
 * generically (a key → record store, not a GitHub-specific one) precisely so the
 * eventual BYOK chat client stores its API key here instead of inventing a
 * second credential boundary. `HOSTED_CREDENTIAL_KEY` is one key among the
 * several this store expects to hold.
 *
 * ## Why IndexedDB and not `localStorage`
 *
 * `src/stores/settings.js` is the closest existing precedent (a try/catch around
 * a browser store that must never crash the app), but it keeps UI preferences in
 * `localStorage`. A credential is not a preference:
 *
 * - `localStorage` is **synchronous and string-only**, so every read blocks the
 *   main thread and every record is hand-serialised.
 * - IndexedDB is already this milestone's storage mechanism (`io-001`, `idb`
 *   8.0.3 — `docs/decisions/persistence-export.md` sub-decision 1), so this adds
 *   no new dependency and no second failure mode to explain to the user.
 *
 * Neither store is encrypted, and this file does not pretend otherwise: both are
 * readable by any script that runs on this origin, and the honest mitigation is
 * scope (a fine-grained token limited to one repository) plus **Disconnect
 * actually deleting the record** — see `docs/save-load.md`.
 *
 * ## Its own database, deliberately
 *
 * `warpcad-credentials`, not `io-001`'s `warpcad`. Sharing that database would
 * mean bumping `DB_VERSION` and coordinating an upgrade with a live autosave
 * connection (an open v1 connection blocks a v2 upgrade), for no benefit. A
 * separate database is also separately clearable.
 *
 * ## Failure policy, split on purpose
 *
 * - **`read` never rejects.** A private window that blocks storage must leave the
 *   app fully usable; "no connection stored" is the truthful reading of a
 *   storage that will not open.
 * - **`write` rejects.** Connect must not report success for a token that was
 *   never stored — the user would come back to a connection that had silently
 *   vanished.
 *
 * @module storage/tokenStorage
 */

import { openDB } from 'idb'

export const CREDENTIAL_DB_NAME = 'warpcad-credentials'
export const CREDENTIAL_DB_VERSION = 1
export const CREDENTIAL_STORE_NAME = 'credentials'

/** The key this task's hosted-git connection is stored under. */
export const HOSTED_CREDENTIAL_KEY = 'hosted-git'

/**
 * @typedef {object} CredentialStore
 * @property {(key: string) => Promise<Record<string, any> | null>} read Never rejects.
 * @property {(key: string, record: Record<string, any>) => Promise<void>} write Rejects on failure.
 * @property {(key: string) => Promise<void>} clear
 * @property {() => void} close
 */

/**
 * @param {object} [options]
 * @param {typeof openDB} [options.open] Injected in tests — the boundary this module is mocked at.
 * @param {string} [options.name]
 * @returns {CredentialStore}
 */
export function createCredentialStore({ open = openDB, name = CREDENTIAL_DB_NAME } = {}) {
  /** @type {Promise<import('idb').IDBPDatabase> | null} */
  let connection = null

  function database() {
    if (connection === null) {
      // `async` wrapper so a synchronous throw (no `indexedDB` global at all, as in
      // some embedded webviews) becomes a rejection like every other failure.
      const opening = (async () =>
        open(name, CREDENTIAL_DB_VERSION, {
          upgrade(db) {
            if (!db.objectStoreNames.contains(CREDENTIAL_STORE_NAME)) {
              db.createObjectStore(CREDENTIAL_STORE_NAME)
            }
          },
          blocking() {
            connection = null
            void opening.then((db) => db.close()).catch(() => {})
          },
          terminated() {
            connection = null
          },
        }))()
      connection = opening
      // Never cache a failure: allowing storage after a prompt should be retried.
      opening.catch(() => {
        if (connection === opening) connection = null
      })
    }
    return connection
  }

  return {
    async read(key) {
      try {
        const db = await database()
        const tx = db.transaction(CREDENTIAL_STORE_NAME, 'readonly')
        // Nothing non-IDB is awaited between opening the transaction and using it
        // (see `indexeddb.js`'s module note on auto-commit).
        const [value] = await Promise.all([tx.store.get(key), tx.done])
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
        return /** @type {Record<string, any>} */ ({ ...value })
      } catch {
        return null
      }
    },

    async write(key, record) {
      const db = await database()
      const tx = db.transaction(CREDENTIAL_STORE_NAME, 'readwrite')
      // Durability is `tx.done`, not the request: a quota failure surfaces at commit.
      await Promise.all([tx.store.put({ ...record }, key), tx.done])
    },

    async clear(key) {
      try {
        const db = await database()
        const tx = db.transaction(CREDENTIAL_STORE_NAME, 'readwrite')
        await Promise.all([tx.store.delete(key), tx.done])
      } catch {
        // Disconnect must still take effect in memory even if the delete fails; the
        // store's caller drops the in-memory copy regardless.
      }
    },

    close() {
      const pending = connection
      connection = null
      void pending?.then((db) => db.close()).catch(() => {})
    },
  }
}
