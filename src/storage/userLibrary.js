// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The user's local part library (`TODO/core-037`): saved user parts, in IndexedDB via
 * `idb` 8.0.3 — the same library and the same transaction rules as autosave
 * (`./indexeddb.js`'s module note: only IDB requests are awaited inside a transaction, and
 * durability is `tx.done`).
 *
 * **Its own database**, `warpcad-parts`, not a second store in `warpcad`: adding a store
 * there would mean bumping that database's version, which blocks on every other open tab
 * and puts the autosave — the one thing that must never be at risk — behind a schema
 * migration for an unrelated feature.
 *
 * One record per part, keyed by its op: `{ definition, savedAt, thumbnail? }`. Re-saving a
 * part replaces it (the caller decides the version). The thumbnail (`TODO/ui-055`) is a small
 * PNG data URL drawn from the part's geometry at save time; it is display-only, and treated as
 * untrusted on the way back out like everything else read from here. Everything read back is **re-validated**
 * (`src/core/userPart.js`), because what is in IndexedDB was written by some earlier build
 * — or by anything else running on this origin — and is as untrusted as a file.
 *
 * Framework-free; no Vue. `ui-055` wires it to the Library panel.
 *
 * @module storage/userLibrary
 */

import { openDB } from 'idb'

import { UserPartError, setLibraryParts, validateUserPart, validateUserPartSet } from '../core/userPart.js'
import { isThumbnailUrl } from '../core/userPartFile.js'

export const PARTS_DB_NAME = 'warpcad-parts'
export const PARTS_DB_VERSION = 1
export const PARTS_STORE = 'parts'

/** @typedef {import('../core/userPart.js').UserPartDefinition} UserPartDefinition */
/** @typedef {import('../core/userPart.js').UserPartProblem} UserPartProblem */

/**
 * @typedef {object} UserLibrary
 * @property {() => Promise<{ parts: UserPartDefinition[], problems: UserPartProblem[], thumbnails: Record<string, string>, savedAt: Record<string, number> }>} list
 *   Every stored part that still validates (as one set, so nesting is checked), and a
 *   named problem for each one that does not. `thumbnails` is op → PNG data URL for the
 *   parts that have a valid one, and `savedAt` op → when it was last saved, ms since the
 *   epoch (`TODO/ui-055`: My parts lists the newest first). Rejects only if storage cannot be read.
 * @property {(definition: unknown, extras?: { thumbnail?: string | null }) => Promise<UserPartDefinition>} save
 *   Validate, then store. A thumbnail that is not a small PNG data URL is ignored; with none,
 *   the one already stored for that op is kept. Rejects with a {@link UserPartError} for a
 *   bad part, or with the storage error.
 * @property {(op: string) => Promise<void>} remove
 * @property {() => void} close
 */

/**
 * @param {object} [options]
 * @param {typeof openDB} [options.open] Injected in tests — the boundary this is mocked at.
 * @param {string} [options.name]
 * @param {() => number} [options.now]
 * @returns {UserLibrary}
 */
export function createUserLibrary({ open = openDB, name = PARTS_DB_NAME, now = () => Date.now() } = {}) {
  /** @type {Promise<import('idb').IDBPDatabase> | null} */
  let connection = null

  function database() {
    if (connection === null) {
      const opening = (async () =>
        open(name, PARTS_DB_VERSION, {
          upgrade(db) {
            if (!db.objectStoreNames.contains(PARTS_STORE)) db.createObjectStore(PARTS_STORE)
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
      opening.catch(() => {
        if (connection === opening) connection = null
      })
    }
    return connection
  }

  /** @returns {Promise<{ key: string, value: unknown }[]>} */
  async function readAll() {
    const db = await database()
    const tx = db.transaction(PARTS_STORE, 'readonly')
    const [keys, values] = await Promise.all([tx.store.getAllKeys(), tx.store.getAll(), tx.done])
    return values.map((value, index) => ({ key: String(keys[index]), value }))
  }

  return {
    async list() {
      /** @type {UserPartProblem[]} */
      const problems = []
      /** @type {UserPartDefinition[]} */
      const valid = []
      /** @type {Record<string, string>} */
      const thumbnails = {}
      /** @type {Record<string, number>} */
      const savedAt = {}
      for (const { key, value } of await readAll()) {
        const definition =
          value !== null && typeof value === 'object' && !Array.isArray(value) ? /** @type {any} */ (value).definition : undefined
        if (definition === undefined) {
          problems.push({ op: key, reason: 'the stored entry is not a part record' })
          continue
        }
        const verdict = validateUserPart(definition)
        if (verdict.ok) {
          valid.push(verdict.definition)
          const stamp = /** @type {any} */ (value).savedAt
          if (typeof stamp === 'number' && Number.isFinite(stamp)) savedAt[verdict.definition.op] = stamp
          const thumbnail = /** @type {any} */ (value).thumbnail
          if (isThumbnailUrl(thumbnail)) thumbnails[verdict.definition.op] = thumbnail
        } else {
          problems.push({ op: verdict.op ?? key, reason: verdict.reason })
        }
      }
      // Then as one set, so a part nesting a missing or broken one is reported too.
      const checked = validateUserPartSet(valid)
      return { parts: checked.definitions, problems: [...problems, ...checked.problems], thumbnails, savedAt }
    },

    async save(raw, extras = {}) {
      const verdict = validateUserPart(raw)
      if (!verdict.ok) throw new UserPartError(verdict.reason, verdict.op)
      const definition = verdict.definition
      // Nesting is checked against what the library already holds, so a saved part can
      // always be rebuilt from the library alone.
      const existing = (await this.list()).parts.filter((part) => part.op !== definition.op)
      const { problems } = validateUserPartSet([definition, ...existing])
      const own = problems.find((problem) => problem.op === definition.op)
      if (own !== undefined) throw new UserPartError(own.reason, definition.op)
      // Plain, finished data before the transaction opens (`indexeddb.js`, rule 1).
      const given = isThumbnailUrl(extras.thumbnail) ? extras.thumbnail : undefined
      const db = await database()
      const tx = db.transaction(PARTS_STORE, 'readwrite')
      // Only IDB requests are awaited inside the transaction: read what is there (to keep its
      // thumbnail when this save brings none), then write.
      const prior = given === undefined ? await tx.store.get(definition.op) : undefined
      const kept = prior !== null && typeof prior === 'object' && isThumbnailUrl(prior.thumbnail) ? prior.thumbnail : undefined
      const thumbnail = given ?? kept
      const record = {
        definition: JSON.parse(JSON.stringify(definition)),
        savedAt: now(),
        ...(thumbnail === undefined ? {} : { thumbnail }),
      }
      await Promise.all([tx.store.put(record, definition.op), tx.done])
      return definition
    },

    async remove(op) {
      const db = await database()
      const tx = db.transaction(PARTS_STORE, 'readwrite')
      await Promise.all([tx.store.delete(op), tx.done])
    },

    close() {
      const pending = connection
      connection = null
      void pending?.then((db) => db.close()).catch(() => {})
    },
  }
}

/**
 * Read the library and register it as the registry's library layer. **Never rejects**:
 * storage that cannot be read (a private window, a blocked database) is an empty library,
 * with the reason in `problems` for the caller to show.
 *
 * @param {UserLibrary} library
 * @returns {Promise<{ parts: UserPartDefinition[], problems: UserPartProblem[], thumbnails: Record<string, string>, savedAt: Record<string, number> }>}
 */
export async function loadUserLibrary(library) {
  try {
    const result = await library.list()
    setLibraryParts(result.parts)
    return result
  } catch (error) {
    setLibraryParts([])
    return { parts: [], thumbnails: {}, savedAt: {}, problems: [{ op: null, reason: error instanceof Error ? error.message : String(error) }] }
  }
}
