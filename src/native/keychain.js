// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The native shell's Keychain (`TODO/ai-025`, `docs/decisions/ai-partner.md` decision 8): three
 * commands the Tauri shell registers, `keychain_get`, `keychain_set` and `keychain_delete`, over
 * the iOS and macOS Keychain, service `com.warpcad.app`.
 *
 * Only two account names exist, {@link KEYCHAIN_ACCOUNTS}. The shell refuses any other, and this
 * module refuses it first, so a bug here cannot even ask. A value is a string; the credential store
 * above this (`src/storage/tokenStorage.js`) JSON-encodes its record into it.
 *
 * The trust model is the one decision 8 states: a page script can still call `keychain_get`. The
 * gain over IndexedDB is that iOS cannot evict a Keychain item with the web storage, and that the
 * page can reach only these two accounts.
 *
 * Framework-free. `invoke` is injectable so a unit test needs no shell.
 *
 * @module native/keychain
 */

import { invoke as shellInvoke } from './shell.js'

/** The accounts the shell allows, and the only ones this module will name. Mirrors `src-tauri/src/keychain.rs`. */
export const KEYCHAIN_ACCOUNTS = Object.freeze(['anthropic', 'hosted-git'])

/**
 * @typedef {object} Keychain
 * @property {(account: string) => Promise<string | null>} get `null` when there is no such item
 * @property {(account: string, value: string) => Promise<void>} set Rejects when the Keychain refuses
 * @property {(account: string) => Promise<void>} delete
 */

/**
 * @param {string} account
 * @returns {boolean} true when `account` is one of {@link KEYCHAIN_ACCOUNTS}
 */
export function isKeychainAccount(account) {
  return typeof account === 'string' && KEYCHAIN_ACCOUNTS.includes(account)
}

/**
 * @param {string} account
 * @throws {Error} when the account is not allow-listed (the message never carries a value)
 */
function requireAccount(account) {
  if (!isKeychainAccount(account)) throw new Error('not an allowed Keychain account')
}

/**
 * A Tauri rejection is a bare string; make it an `Error` carrying that string.
 *
 * @param {unknown} reason
 * @returns {Error}
 */
function asError(reason) {
  return reason instanceof Error ? reason : new Error(String(reason))
}

/**
 * @param {object} [options]
 * @param {(cmd: string, args?: Record<string, unknown>) => Promise<unknown>} [options.invoke] Injected in tests; the Tauri bridge in the app.
 * @returns {Keychain}
 */
export function createKeychain({ invoke = (cmd, args) => shellInvoke(cmd, args) } = {}) {
  /**
   * @param {string} cmd
   * @param {Record<string, unknown>} args
   * @returns {Promise<unknown>}
   */
  const call = async (cmd, args) => {
    try {
      return await invoke(cmd, args)
    } catch (reason) {
      throw asError(reason)
    }
  }
  return {
    async get(account) {
      requireAccount(account)
      const answer = await call('keychain_get', { account })
      return typeof answer === 'string' ? answer : null
    },
    async set(account, value) {
      requireAccount(account)
      await call('keychain_set', { account, value })
    },
    async delete(account) {
      requireAccount(account)
      await call('keychain_delete', { account })
    },
  }
}
