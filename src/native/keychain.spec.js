// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { KEYCHAIN_ACCOUNTS, createKeychain } from './keychain.js'

/**
 * `TODO/ai-025`: the page's side of the Keychain commands. The Tauri bridge is the boundary, so
 * every case drives a fake `invoke`; no Keychain and no shell is touched.
 */

describe('the native Keychain client', () => {
  it('allows exactly the two accounts the shell allows', () => {
    expect([...KEYCHAIN_ACCOUNTS]).toEqual(['anthropic', 'hosted-git'])
  })

  it('get, set and delete call keychain_get, keychain_set and keychain_delete with the account', async () => {
    const invoke = vi.fn(async (cmd) => (cmd === 'keychain_get' ? 'secret' : null))
    const keychain = createKeychain({ invoke })
    expect(await keychain.get('anthropic')).toBe('secret')
    await keychain.set('hosted-git', 'tok')
    await keychain.delete('anthropic')
    expect(invoke.mock.calls).toEqual([
      ['keychain_get', { account: 'anthropic' }],
      ['keychain_set', { account: 'hosted-git', value: 'tok' }],
      ['keychain_delete', { account: 'anthropic' }],
    ])
  })

  it('get gives null for an item that is not there, and for a non-string answer', async () => {
    expect(await createKeychain({ invoke: async () => null }).get('anthropic')).toBeNull()
    expect(await createKeychain({ invoke: async () => 42 }).get('anthropic')).toBeNull()
  })

  it('refuses an account outside the allow-list without calling the shell', async () => {
    const invoke = vi.fn()
    const keychain = createKeychain({ invoke })
    for (const account of ['github-gist', '', 'ANTHROPIC', '__proto__', 'anthropic ']) {
      await expect(keychain.get(account)).rejects.toThrow(/not an allowed Keychain account/)
      await expect(keychain.set(account, 'x')).rejects.toThrow(/not an allowed Keychain account/)
      await expect(keychain.delete(account)).rejects.toThrow(/not an allowed Keychain account/)
    }
    expect(invoke).not.toHaveBeenCalled()
  })

  it('a shell rejection (a bare string, as Tauri sends it) becomes an Error', async () => {
    const keychain = createKeychain({ invoke: async () => Promise.reject('Keychain write failed (-25299)') })
    await expect(keychain.set('anthropic', 'x')).rejects.toThrow('Keychain write failed (-25299)')
  })
})
