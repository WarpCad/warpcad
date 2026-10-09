// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Where the user's Anthropic API key lives (`TODO/ai-004`,
 * `docs/decisions/ai-partner.md` decision 8).
 *
 * **Not a new store.** `TODO/ai-004`'s own text says "its own store"; the accepted decision
 * wins, and it says the key goes in the *existing* credential boundary
 * (`tokenStorage.js`, `io-002`) under a key name of its own, "so the eventual BYOK chat
 * client stores its API key here instead of inventing a second credential boundary". This
 * file is the thin wrapper it names: it picks the key name, validates what is pasted, and adds
 * the one behaviour the generic store leaves to its caller.
 *
 * ## Failure policy (inherited from `tokenStorage.js`, then made visible)
 *
 * - `load` never rejects: unreadable storage means "no key stored".
 * - `save` **never rejects for a storage failure either**: it returns `{ persisted: false }`
 *   and keeps the key in memory, so a private window still lets the user use the assistant
 *   *this session*, and the caller can show the "this session only" note instead of a
 *   connection that silently vanishes on reload. (The hosted token's Connect refuses instead,
 *   because a repository connection that evaporates is worse than none; a key the user can
 *   paste again is not.)
 * - `forget` drops the in-memory copy even if the delete fails.
 *
 * The key is never returned by anything but `load()`'s own `key` field, never logged, and never
 * part of an error message: a rejected write returns a bare boolean.
 *
 * @module storage/aiKey
 */

import { createCredentialStore } from './tokenStorage.js'

/** The key name inside `warpcad-credentials`, distinct from the hosted-git token's. */
export const AI_CREDENTIAL_KEY = 'ai-anthropic'

/**
 * @typedef {object} AiKeyStore
 * @property {() => Promise<{ key: string | null, persisted: boolean }>} load Never rejects.
 * @property {(key: string) => Promise<{ persisted: boolean }>} save Rejects only for an empty key.
 * @property {() => Promise<void>} forget
 */

/**
 * @param {object} [options]
 * @param {import('./tokenStorage.js').CredentialStore} [options.credentials] Injected in tests.
 * @returns {AiKeyStore}
 */
export function createAiKeyStore({ credentials = createCredentialStore() } = {}) {
  /** The session copy: authoritative for this page, whether or not it reached storage. */
  /** @type {string | null} */
  let memoryKey = null
  let persisted = true
  /** Set by `forget`: a delete that failed must not let the next `load` resurrect the key. */
  let forgotten = false

  return {
    async load() {
      if (memoryKey !== null || forgotten) return { key: memoryKey, persisted }
      try {
        const record = await credentials.read(AI_CREDENTIAL_KEY)
        if (record !== null && typeof record.key === 'string' && record.key !== '') {
          memoryKey = record.key
        }
      } catch {
        // `read` is documented never to reject; a misbehaving store still must not break startup.
      }
      return { key: memoryKey, persisted }
    },

    async save(key) {
      const trimmed = typeof key === 'string' ? key.trim() : ''
      if (trimmed === '') throw new Error('The key is empty')
      memoryKey = trimmed
      forgotten = false
      try {
        await credentials.write(AI_CREDENTIAL_KEY, { key: trimmed })
        persisted = true
      } catch {
        persisted = false
      }
      return { persisted }
    },

    async forget() {
      memoryKey = null
      forgotten = true
      persisted = true
      try {
        await credentials.clear(AI_CREDENTIAL_KEY)
      } catch {
        // The in-memory copy is already gone; that is what Forget must guarantee.
      }
    },
  }
}
