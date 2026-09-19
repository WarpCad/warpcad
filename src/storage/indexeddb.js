/**
 * The IndexedDB adapter behind autosave (`TODO/io-001`), on `idb` 8.0.3
 * (`docs/decisions/persistence-export.md`, sub-decision 1).
 *
 * One database, one object store, two keys: the live autosave, and a rescue copy
 * of a project the app refused to load. A store rather than `idb-keyval`'s
 * single-key shape because the decision record already anticipates a project
 * browser (`storage/` in CLAUDE.md), which is a list with metadata.
 *
 * ## The one footgun this file exists to avoid
 *
 * **An IndexedDB transaction auto-commits the moment the event loop has nothing
 * pending on it.** So `await`-ing anything that is *not* an IndexedDB request
 * between opening a transaction and using it — a `fetch`, a `setTimeout`, a
 * `Promise.resolve()` from unrelated code, `getText()` — lets the transaction
 * finish underneath you, and the next `put` throws `TransactionInactiveError`
 * or, worse, is silently dropped. Hand-written IDB code gets this wrong
 * routinely, and the failure mode ("a write that appeared to succeed and
 * didn't") is the one this project's Verification section is most hostile to.
 *
 * The rules followed below, and asserted by the spec's fake:
 *
 * 1. Everything that is not IndexedDB (serialising the document, timeouts) has
 *    already happened before `db.transaction(...)` is called — callers pass in a
 *    finished `record`.
 * 2. Inside the transaction only IDB requests are awaited.
 * 3. **Durability is `tx.done`, not the request.** A `put` request succeeds when
 *    the write is *queued*; a `QuotaExceededError` surfaces when the transaction
 *    commits, so `save` awaits `tx.done` — otherwise a full disk reads as saved.
 *
 * A private window, a locked-down browser or a blocked database makes `openDB`
 * reject (or, in a few old Safari builds, never answer — the autosave scheduler's
 * timeout handles that). Nothing here catches: the scheduler owns the failure
 * policy, and swallowing an error at this layer would make it invisible to the
 * chip.
 *
 * @module storage/indexeddb
 */

import { openDB } from 'idb'

export const DB_NAME = 'warpcad'
export const DB_VERSION = 1
export const STORE_NAME = 'projects'
export const AUTOSAVE_KEY = 'autosave'
export const UNREADABLE_KEY = 'autosave-unreadable'

/** @typedef {import('./autosave.js').StoredProject} StoredProject */
/** @typedef {import('./autosave.js').AutosaveBackend} AutosaveBackend */

/**
 * @param {unknown} value
 * @returns {value is StoredProject}
 */
function isStoredProject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (/** @type {any} */ (value).text) === 'string' &&
    Number.isFinite(/** @type {any} */ (value).savedAt)
  )
}

/**
 * @param {object} [options]
 * @param {typeof openDB} [options.open] Injected in tests — `idb`'s `openDB`, the
 *   boundary this module is mocked at.
 * @param {string} [options.name] Database name; tests and future per-project
 *   stores can vary it.
 * @returns {AutosaveBackend & { close: () => void }}
 */
export function createIndexedDbBackend({ open = openDB, name = DB_NAME } = {}) {
  /** @type {Promise<import('idb').IDBPDatabase> | null} */
  let connection = null

  function database() {
    if (connection === null) {
      // `async` wrapper so a synchronous throw (no `indexedDB` global at all,
      // e.g. some embedded webviews) becomes a rejection like every other failure.
      const opening = (async () =>
        open(name, DB_VERSION, {
          upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
          },
          // Another tab wants to upgrade the schema: let go so it is not blocked
          // forever, and reconnect on the next call.
          blocking() {
            connection = null
            void opening.then((db) => db.close()).catch(() => {})
          },
          // The browser closed the connection under us (storage cleared, profile
          // being deleted). Forget it; the next call reopens or fails visibly.
          terminated() {
            connection = null
          },
        }))()
      connection = opening
      // Do not cache a failure: a transient error (or the user allowing storage
      // after a prompt) should be retried by the next write, not remembered.
      opening.catch(() => {
        if (connection === opening) connection = null
      })
    }
    return connection
  }

  /**
   * @param {string} key
   * @param {StoredProject} record
   */
  async function put(key, record) {
    const db = await database()
    // `record` is already a finished plain object: nothing non-IDB is awaited
    // between here and `tx.done` (see the module note, rule 1 and 2).
    const tx = db.transaction(STORE_NAME, 'readwrite')
    await Promise.all([tx.store.put({ text: record.text, savedAt: record.savedAt }, key), tx.done])
  }

  return {
    async load() {
      const db = await database()
      const tx = db.transaction(STORE_NAME, 'readonly')
      const [value] = await Promise.all([tx.store.get(AUTOSAVE_KEY), tx.done])
      if (value === undefined) return null
      if (!isStoredProject(value)) {
        throw new Error('the stored autosave is not readable (unexpected shape)')
      }
      return { text: value.text, savedAt: value.savedAt }
    },

    save(record) {
      return put(AUTOSAVE_KEY, record)
    },

    keepUnreadable(record) {
      return put(UNREADABLE_KEY, record)
    },

    close() {
      const pending = connection
      connection = null
      void pending?.then((db) => db.close()).catch(() => {})
    },
  }
}
