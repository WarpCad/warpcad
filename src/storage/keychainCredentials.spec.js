// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — drives duck-typed fakes of the credential store and the Keychain client.
import { describe, expect, it, vi } from 'vitest'

import { createAiKeyStore } from './aiKey.js'
import { chooseCredentialStore, createKeychainCredentialStore } from './tokenStorage.js'

/**
 * `TODO/ai-025`: in the native app the Anthropic key and the hosted token live in the Keychain
 * behind the same `CredentialStore` interface. Mocked at the boundary: the Keychain client and
 * the IndexedDB-backed store are fakes.
 */

const KEY = 'sk-ant-api03-SENTINELsentinel_0123456789-abcdef'

function fakeIdb(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    location: 'browser',
    data,
    read: vi.fn(async (key) => (data.has(key) ? { ...data.get(key) } : null)),
    write: vi.fn(async (key, record) => void data.set(key, { ...record })),
    clear: vi.fn(async (key) => void data.delete(key)),
    close: vi.fn(),
  }
}

function fakeKeychain({ failSet = false, readBack = null, failGet = false } = {}) {
  const items = new Map()
  const order = []
  return {
    items,
    order,
    get: vi.fn(async (account) => {
      order.push(`get:${account}`)
      if (failGet) throw new Error('no keychain')
      return readBack !== null && items.has(account) ? readBack : (items.get(account) ?? null)
    }),
    set: vi.fn(async (account, value) => {
      order.push(`set:${account}`)
      if (failSet) throw new Error('write failed')
      items.set(account, value)
    }),
    delete: vi.fn(async (account) => {
      order.push(`delete:${account}`)
      items.delete(account)
    }),
  }
}

describe('choosing the credential store (in the caller, not in createCredentialStore)', () => {
  it('on the web it is the IndexedDB store, untouched', () => {
    const idb = fakeIdb()
    const chosen = chooseCredentialStore({ native: false, keychain: fakeKeychain(), browserStore: () => idb })
    expect(chosen).toBe(idb)
  })

  it('in the native shell it is the Keychain-backed store, location keychain', () => {
    const chosen = chooseCredentialStore({ native: true, keychain: fakeKeychain(), browserStore: () => fakeIdb() })
    expect(chosen.location).toBe('keychain')
  })
})

describe('the Keychain-backed credential store', () => {
  it('writes the record to the Keychain under the account, and IndexedDB holds nothing', async () => {
    const idb = fakeIdb()
    const keychain = fakeKeychain()
    const store = createKeychainCredentialStore({ keychain, fallback: idb })
    await store.write('ai-anthropic', { key: KEY })
    expect(JSON.parse(keychain.items.get('anthropic'))).toEqual({ key: KEY })
    expect(idb.data.size).toBe(0)
    expect(await store.read('ai-anthropic')).toEqual({ key: KEY })
  })

  it('maps the hosted token to its own account', async () => {
    const keychain = fakeKeychain()
    const store = createKeychainCredentialStore({ keychain, fallback: fakeIdb() })
    await store.write('hosted-git', { token: 't' })
    expect([...keychain.items.keys()]).toEqual(['hosted-git'])
  })

  it('a credential with no allow-listed account (the gist token) stays in IndexedDB, never in the Keychain', async () => {
    const idb = fakeIdb()
    const keychain = fakeKeychain()
    const store = createKeychainCredentialStore({ keychain, fallback: idb })
    await store.write('github-gist', { token: 'g' })
    expect(keychain.set).not.toHaveBeenCalled()
    expect(idb.data.get('github-gist')).toEqual({ token: 'g' })
    expect(await store.read('github-gist')).toEqual({ token: 'g' })
  })

  it('write rejects when the Keychain refuses, as the IndexedDB store rejects on a quota error', async () => {
    const store = createKeychainCredentialStore({ keychain: fakeKeychain({ failSet: true }), fallback: fakeIdb() })
    await expect(store.write('ai-anthropic', { key: KEY })).rejects.toThrow()
  })

  it('clear removes the Keychain item and any IndexedDB leftover', async () => {
    const idb = fakeIdb({ 'ai-anthropic': { key: KEY } })
    const keychain = fakeKeychain()
    keychain.items.set('anthropic', JSON.stringify({ key: KEY }))
    const store = createKeychainCredentialStore({ keychain, fallback: idb })
    await store.clear('ai-anthropic')
    expect(keychain.items.size).toBe(0)
    expect(idb.data.size).toBe(0)
  })

  it('read never rejects: an unreachable Keychain reads as the IndexedDB record, or null', async () => {
    const idb = fakeIdb({ 'ai-anthropic': { key: KEY } })
    const store = createKeychainCredentialStore({ keychain: fakeKeychain({ failGet: true }), fallback: idb })
    await expect(store.read('ai-anthropic')).resolves.toEqual({ key: KEY })
    expect(idb.data.size).toBe(1)
    const empty = createKeychainCredentialStore({ keychain: fakeKeychain({ failGet: true }), fallback: fakeIdb() })
    await expect(empty.read('ai-anthropic')).resolves.toBeNull()
  })
})

describe('moving a key saved before this change into the Keychain', () => {
  it('copies, verifies the read-back, and only then deletes the IndexedDB value', async () => {
    const idb = fakeIdb({ 'ai-anthropic': { key: KEY } })
    const keychain = fakeKeychain()
    const order = []
    idb.clear = vi.fn(async (key) => {
      order.push(`idb-clear:${key}`)
      idb.data.delete(key)
    })
    keychain.set = vi.fn(async (a, v) => {
      order.push('keychain-set')
      keychain.items.set(a, v)
    })
    const baseGet = keychain.get
    keychain.get = vi.fn(async (a) => {
      order.push('keychain-get')
      return baseGet(a)
    })
    const store = createKeychainCredentialStore({ keychain, fallback: idb })
    expect(await store.read('ai-anthropic')).toEqual({ key: KEY })
    // get (empty), set, get (verify), then the delete.
    expect(order).toEqual(['keychain-get', 'keychain-set', 'keychain-get', 'idb-clear:ai-anthropic'])
    expect(JSON.parse(keychain.items.get('anthropic'))).toEqual({ key: KEY })
    expect(idb.data.size).toBe(0)
  })

  it('a failed verify keeps the IndexedDB value (and still returns the key)', async () => {
    const idb = fakeIdb({ 'ai-anthropic': { key: KEY } })
    const keychain = fakeKeychain({ readBack: '{"key":"something else"}' })
    // Start empty so the first read finds nothing to migrate over.
    const store = createKeychainCredentialStore({ keychain, fallback: idb })
    const got = await store.read('ai-anthropic')
    expect(got).toEqual({ key: KEY })
    expect(idb.clear).not.toHaveBeenCalled()
    expect(idb.data.get('ai-anthropic')).toEqual({ key: KEY })
  })

  it('a failed Keychain write keeps the IndexedDB value', async () => {
    const idb = fakeIdb({ 'ai-anthropic': { key: KEY } })
    const store = createKeychainCredentialStore({ keychain: fakeKeychain({ failSet: true }), fallback: idb })
    expect(await store.read('ai-anthropic')).toEqual({ key: KEY })
    expect(idb.clear).not.toHaveBeenCalled()
  })

  it('does nothing when the Keychain already has the item (it wins; IndexedDB is not consulted)', async () => {
    const idb = fakeIdb({ 'ai-anthropic': { key: 'stale' } })
    const keychain = fakeKeychain()
    keychain.items.set('anthropic', JSON.stringify({ key: KEY }))
    const store = createKeychainCredentialStore({ keychain, fallback: idb })
    expect(await store.read('ai-anthropic')).toEqual({ key: KEY })
    expect(keychain.set).not.toHaveBeenCalled()
    expect(idb.read).not.toHaveBeenCalled()
  })
})

describe('the AI key store over the Keychain (what the sheet says, and ai-020)', () => {
  it('describes where the key is kept from the credential store, not from the component', () => {
    const web = createAiKeyStore({ credentials: fakeIdb() })
    expect(web.description).toBe('Key saved in this browser')
    const native = createAiKeyStore({ credentials: createKeychainCredentialStore({ keychain: fakeKeychain(), fallback: fakeIdb() }) })
    expect(native.description).toBe("Stored in this iPhone's Keychain.")
  })

  it('load finds a key that only the Keychain holds, so the panel never thinks it is missing', async () => {
    const keychain = fakeKeychain()
    keychain.items.set('anthropic', JSON.stringify({ key: KEY }))
    const store = createAiKeyStore({ credentials: createKeychainCredentialStore({ keychain, fallback: fakeIdb() }) })
    expect(await store.load()).toEqual({ key: KEY, persisted: true })
  })
})
