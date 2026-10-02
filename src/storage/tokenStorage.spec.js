// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — drives a hand-written duck-typed fake of `idb`'s `openDB`; the module under
// test is fully typed and checked by `npm run typecheck`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CREDENTIAL_DB_NAME,
  CREDENTIAL_STORE_NAME,
  HOSTED_CREDENTIAL_KEY,
  createCredentialStore,
} from './tokenStorage.js'

/**
 * `TODO/io-002` — the first real credential boundary in this codebase (there is no
 * AI chat client yet; `src/ai/` is a `.gitkeep`). Deliberately **generic**: a
 * key → record store, so the eventual BYOK chat client stores its own API key
 * here rather than inventing a second boundary.
 */

const TOKEN = 'github_pat_SENTINELsentinel_0123456789'

/** A minimal in-memory stand-in for `idb`'s `openDB`. */
function fakeIdb({ failOpen = false, failWrite = false } = {}) {
  const data = new Map()
  const open = vi.fn(async (name, version, { upgrade } = {}) => {
    if (failOpen) throw new Error('SecurityError: the operation is insecure')
    const names = { contains: () => data.has('__created__') }
    upgrade?.({ objectStoreNames: names, createObjectStore: () => data.set('__created__', true) }, 0, 1, {})
    return {
      transaction: () => ({
        store: {
          async get(key) {
            return data.get(key)
          },
          async put(value, key) {
            if (failWrite) throw new Error('QuotaExceededError')
            data.set(key, value)
          },
          async delete(key) {
            data.delete(key)
          },
        },
        done: Promise.resolve(),
      }),
      close: () => {},
    }
  })
  return { open, data }
}

describe('the credential store', () => {
  /** @type {any} */
  let localStorageSpy

  beforeEach(() => {
    localStorageSpy = { setItem: vi.fn(), getItem: vi.fn(() => null) }
    vi.stubGlobal('localStorage', localStorageSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips a record under a key, in its own IndexedDB database', async () => {
    const { open, data } = fakeIdb()
    const store = createCredentialStore({ open })

    await store.write(HOSTED_CREDENTIAL_KEY, { token: TOKEN, owner: 'octo', repo: 'parts' })
    await expect(store.read(HOSTED_CREDENTIAL_KEY)).resolves.toEqual({
      token: TOKEN,
      owner: 'octo',
      repo: 'parts',
    })

    expect(open).toHaveBeenCalledWith(CREDENTIAL_DB_NAME, expect.any(Number), expect.any(Object))
    expect(CREDENTIAL_DB_NAME).not.toBe('warpcad') // not io-001's autosave database: no version clash
    expect(CREDENTIAL_STORE_NAME).toBe('credentials')
    expect(data.get(HOSTED_CREDENTIAL_KEY).token).toBe(TOKEN)
  })

  it('never writes a credential to localStorage, where any script on the page can read it', async () => {
    const { open } = fakeIdb()
    const store = createCredentialStore({ open })
    await store.write(HOSTED_CREDENTIAL_KEY, { token: TOKEN })
    await store.read(HOSTED_CREDENTIAL_KEY)
    expect(localStorageSpy.setItem).not.toHaveBeenCalled()
  })

  it('clears the record outright — Disconnect must leave no copy behind', async () => {
    const { open, data } = fakeIdb()
    const store = createCredentialStore({ open })
    await store.write(HOSTED_CREDENTIAL_KEY, { token: TOKEN })
    await store.clear(HOSTED_CREDENTIAL_KEY)
    await expect(store.read(HOSTED_CREDENTIAL_KEY)).resolves.toBeNull()
    expect([...data.values()].some((value) => JSON.stringify(value).includes(TOKEN))).toBe(false)
  })

  it('reads as "nothing stored" when the browser refuses storage, instead of crashing startup', async () => {
    const { open } = fakeIdb({ failOpen: true })
    const store = createCredentialStore({ open })
    // A private window blocking IndexedDB must leave the app fully usable — the same
    // policy `src/stores/settings.js` set for preferences, at credential scale.
    await expect(store.read(HOSTED_CREDENTIAL_KEY)).resolves.toBeNull()
  })

  it('surfaces a failed write rather than swallowing it — Connect must not claim success', async () => {
    const { open } = fakeIdb({ failWrite: true })
    const store = createCredentialStore({ open })
    await expect(store.write(HOSTED_CREDENTIAL_KEY, { token: TOKEN })).rejects.toThrow()
  })

  it('returns null for a stored value of an unexpected shape', async () => {
    const { open, data } = fakeIdb()
    const store = createCredentialStore({ open })
    data.set(HOSTED_CREDENTIAL_KEY, 'not a record')
    await expect(store.read(HOSTED_CREDENTIAL_KEY)).resolves.toBeNull()
  })
})
