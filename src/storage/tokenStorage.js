// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The credential boundary (`TODO/io-002`) — where a user-supplied secret lives.
 *
 * `io-002`'s own Goal records the correction that made this file necessary:
 * `TODO/ROADMAP-DONE.md`'s M6 section says the hosted backend reuses "the same BYOK
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

import { createKeychain } from '../native/keychain.js'
import { isNativeShell, probeShell } from '../native/shell.js'

export const CREDENTIAL_DB_NAME = 'warpcad-credentials'
export const CREDENTIAL_DB_VERSION = 1
export const CREDENTIAL_STORE_NAME = 'credentials'

/** The key this task's hosted-git connection is stored under. */
export const HOSTED_CREDENTIAL_KEY = 'hosted-git'

/** The gist token's key (`TODO/io-017`): its own record, revocable apart from the repository token. */
export const GIST_CREDENTIAL_KEY = 'github-gist'

/**
 * @typedef {object} CredentialStore
 * @property {(key: string) => Promise<Record<string, any> | null>} read Never rejects.
 * @property {(key: string, record: Record<string, any>) => Promise<void>} write Rejects on failure.
 * @property {(key: string) => Promise<void>} clear
 * @property {() => void} close
 * @property {'browser' | 'keychain'} [location] Where a secret is kept (absent means the browser); the key sheet's wording comes from it.
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
    location: 'browser',

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

/**
 * The credential key to Keychain account map (`TODO/ai-025`). A credential with no entry (the gist
 * token) is not allow-listed, so it stays in the fallback store.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const KEYCHAIN_ACCOUNT_OF = Object.freeze({ 'ai-anthropic': 'anthropic', [HOSTED_CREDENTIAL_KEY]: 'hosted-git' })

/**
 * The credential store for the native app (`TODO/ai-025`): the Anthropic key and the hosted token
 * live in the Keychain, everything else in `fallback` (IndexedDB). The interface is
 * {@link CredentialStore}'s, so nothing above it changes.
 *
 * **Migration.** A `read` that finds nothing in the Keychain but a record in `fallback` copies it
 * over, reads it back, and only when the read-back matches deletes the `fallback` copy. A failed
 * write or a mismatched read-back keeps the `fallback` copy and still returns it.
 *
 * `read` never rejects; `write` rejects when the Keychain refuses.
 *
 * @param {object} options
 * @param {import('../native/keychain.js').Keychain} options.keychain
 * @param {CredentialStore} options.fallback
 * @returns {CredentialStore}
 */
export function createKeychainCredentialStore({ keychain, fallback }) {
  return {
    location: 'keychain',

    async read(key) {
      const account = KEYCHAIN_ACCOUNT_OF[key]
      if (account === undefined) return fallback.read(key)
      /** @type {string | null} */
      let stored = null
      try {
        stored = await keychain.get(account)
      } catch {
        // No Keychain to ask (a shell without the commands): the browser copy is the truth.
        return fallback.read(key)
      }
      if (stored !== null) return parseRecord(stored)
      const legacy = await fallback.read(key)
      if (legacy === null) return null
      const encoded = JSON.stringify(legacy)
      try {
        await keychain.set(account, encoded)
        if ((await keychain.get(account)) === encoded) await fallback.clear(key)
      } catch {
        // Keep the browser copy; the next launch tries again.
      }
      return legacy
    },

    async write(key, record) {
      const account = KEYCHAIN_ACCOUNT_OF[key]
      if (account === undefined) return fallback.write(key, record)
      await keychain.set(account, JSON.stringify(record))
      // Nothing secret stays in IndexedDB, including a copy a failed migration left.
      await fallback.clear(key)
    },

    async clear(key) {
      const account = KEYCHAIN_ACCOUNT_OF[key]
      if (account === undefined) return fallback.clear(key)
      try {
        await keychain.delete(account)
      } catch {
        // As the browser store: Disconnect still takes effect in memory.
      }
      await fallback.clear(key)
    },

    close() {
      fallback.close()
    },
  }
}

/**
 * @param {string} text
 * @returns {Record<string, any> | null}
 */
function parseRecord(text) {
  try {
    const value = JSON.parse(text)
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

/**
 * Pick the credential store for this build. The choice is made here, in the caller of
 * {@link createCredentialStore}, not inside it: Safari and the desktop browser get the IndexedDB
 * store untouched, the native app gets the Keychain-backed one.
 *
 * @param {object} [options]
 * @param {boolean} [options.native] Injected in tests; whether the page runs in the native shell.
 * @param {import('../native/keychain.js').Keychain} [options.keychain]
 * @param {() => CredentialStore} [options.browserStore]
 * @returns {CredentialStore}
 */
export function chooseCredentialStore({
  native = isNativeShell(probeShell()),
  keychain = undefined,
  browserStore = createCredentialStore,
} = {}) {
  const browser = browserStore()
  if (!native) return browser
  return createKeychainCredentialStore({ keychain: keychain ?? createKeychain(), fallback: browser })
}
