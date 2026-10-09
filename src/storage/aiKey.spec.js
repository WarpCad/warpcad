// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — drives a duck-typed credential store fake.
import { describe, expect, it, vi } from 'vitest'

import { AI_CREDENTIAL_KEY, createAiKeyStore } from './aiKey.js'
import { HOSTED_CREDENTIAL_KEY } from './tokenStorage.js'

/**
 * `TODO/ai-004`, `docs/decisions/ai-partner.md` decision 8: the Anthropic key lives in the
 * *existing* `warpcad-credentials` store under its own key name and nowhere else. This module
 * is a thin wrapper: it adds the session-only fallback and the "never reject on read" shape.
 */

const KEY = 'sk-ant-api03-SENTINELsentinel_0123456789-abcdef'

function fakeCredentials({ failWrite = false } = {}) {
  const data = new Map()
  return {
    data,
    read: vi.fn(async (key) => data.get(key) ?? null),
    write: vi.fn(async (key, record) => {
      if (failWrite) throw new Error('QuotaExceededError')
      data.set(key, { ...record })
    }),
    clear: vi.fn(async (key) => void data.delete(key)),
    close: vi.fn(),
  }
}

describe('the AI key store', () => {
  it('uses its own key name in the shared credential store, distinct from the hosted token', async () => {
    expect(AI_CREDENTIAL_KEY).toBe('ai-anthropic')
    expect(AI_CREDENTIAL_KEY).not.toBe(HOSTED_CREDENTIAL_KEY)
    const credentials = fakeCredentials()
    const store = createAiKeyStore({ credentials })
    await store.save(KEY)
    expect([...credentials.data.keys()]).toEqual(['ai-anthropic'])
  })

  it('save then load round-trips, and reports persisted', async () => {
    const store = createAiKeyStore({ credentials: fakeCredentials() })
    expect(await store.load()).toEqual({ key: null, persisted: true })
    expect(await store.save(KEY)).toEqual({ persisted: true })
    expect(await store.load()).toEqual({ key: KEY, persisted: true })
  })

  it('a second store over the same credentials (a reload) still has the key', async () => {
    const credentials = fakeCredentials()
    await createAiKeyStore({ credentials }).save(KEY)
    expect(await createAiKeyStore({ credentials }).load()).toEqual({ key: KEY, persisted: true })
  })

  it('trims pasted whitespace and newlines, which a phone paste menu often adds', async () => {
    const store = createAiKeyStore({ credentials: fakeCredentials() })
    await store.save(`  ${KEY}\n`)
    expect((await store.load()).key).toBe(KEY)
  })

  it('refuses an empty key without writing', async () => {
    const credentials = fakeCredentials()
    const store = createAiKeyStore({ credentials })
    await expect(store.save('  \n')).rejects.toThrow(/empty/i)
    expect(credentials.write).not.toHaveBeenCalled()
  })

  it('degrades to session-only when storage rejects the write, keeping the key in memory', async () => {
    const credentials = fakeCredentials({ failWrite: true })
    const store = createAiKeyStore({ credentials })
    expect(await store.save(KEY)).toEqual({ persisted: false })
    expect(await store.load()).toEqual({ key: KEY, persisted: false })
    // …and a fresh store (a reload) has nothing: that is what "session-only" means.
    expect((await createAiKeyStore({ credentials }).load()).key).toBeNull()
  })

  it('the write failure never surfaces the key or the storage error text', async () => {
    const store = createAiKeyStore({ credentials: fakeCredentials({ failWrite: true }) })
    const result = await store.save(KEY)
    expect(JSON.stringify(result)).not.toContain(KEY)
    expect(JSON.stringify(result)).not.toContain('Quota')
  })

  it('forget deletes the stored record and the in-memory copy', async () => {
    const credentials = fakeCredentials()
    const store = createAiKeyStore({ credentials })
    await store.save(KEY)
    await store.forget()
    expect(credentials.data.size).toBe(0)
    expect(await store.load()).toEqual({ key: null, persisted: true })
    expect((await createAiKeyStore({ credentials }).load()).key).toBeNull()
  })

  it('forget still drops the in-memory key if the delete fails', async () => {
    const credentials = fakeCredentials()
    const store = createAiKeyStore({ credentials })
    await store.save(KEY)
    credentials.clear.mockRejectedValueOnce(new Error('boom'))
    await store.forget()
    expect((await store.load()).key).toBeNull()
  })

  it('load never rejects, even when the credential store misbehaves', async () => {
    const credentials = { ...fakeCredentials(), read: vi.fn(async () => { throw new Error('closed') }) }
    expect(await createAiKeyStore({ credentials }).load()).toEqual({ key: null, persisted: true })
  })

  it('ignores a stored record that is not a key (wrong shape)', async () => {
    const credentials = fakeCredentials()
    credentials.data.set('ai-anthropic', { key: 42 })
    expect((await createAiKeyStore({ credentials }).load()).key).toBeNull()
  })

  it('does not read or touch the hosted token record', async () => {
    const credentials = fakeCredentials()
    credentials.data.set(HOSTED_CREDENTIAL_KEY, { token: 'ghp_x' })
    const store = createAiKeyStore({ credentials })
    await store.save(KEY)
    await store.forget()
    expect(credentials.data.get(HOSTED_CREDENTIAL_KEY)).toEqual({ token: 'ghp_x' })
  })
})
