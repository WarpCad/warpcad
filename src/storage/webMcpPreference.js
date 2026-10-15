// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The **Browser agents** switch's memory (`TODO/ai-021`, `docs/decisions/ai-partner.md`
 * Decision 13): whether this browser profile lets in-browser agents use WarpCad's tools over
 * WebMCP. **On by default** — nothing stored means on — and never in the project file.
 *
 * Stored in IndexedDB through the generic key → record store `tokenStorage.js` already provides,
 * in its own database (`warpcad-preferences`) so a preference never shares a database with a
 * credential. Failure tolerant both ways: a blocked or garbled read is the default, and a refused
 * write says so (`persisted: false`) instead of throwing — the switch still works for the session.
 *
 * @module storage/webMcpPreference
 */

import { createCredentialStore } from './tokenStorage.js'

/** The database this preference lives in: not the credentials one. */
export const PREFERENCE_DB_NAME = 'warpcad-preferences'

/** The record's key. */
export const WEBMCP_PREFERENCE_KEY = 'webmcp'

/**
 * @typedef {object} WebMcpPreference
 * @property {() => Promise<boolean>} load `true` (on) unless an off was stored. Never rejects.
 * @property {(on: boolean) => Promise<{ persisted: boolean }>} save Never rejects.
 */

/**
 * @param {object} [options]
 * @param {Pick<import('./tokenStorage.js').CredentialStore, 'read' | 'write'>} [options.store]
 *   Injected in tests — the boundary this module is mocked at.
 * @returns {WebMcpPreference}
 */
export function createWebMcpPreference({ store } = {}) {
  /** @type {Pick<import('./tokenStorage.js').CredentialStore, 'read' | 'write'> | null} */
  let backing = store ?? null
  const storeOf = () => (backing ??= createCredentialStore({ name: PREFERENCE_DB_NAME }))

  return {
    async load() {
      try {
        const record = await storeOf().read(WEBMCP_PREFERENCE_KEY)
        return record?.on === false ? false : true
      } catch {
        return true
      }
    },
    async save(on) {
      try {
        await storeOf().write(WEBMCP_PREFERENCE_KEY, { on })
        return { persisted: true }
      } catch {
        return { persisted: false }
      }
    },
  }
}
