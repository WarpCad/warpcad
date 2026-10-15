// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { WEBMCP_PREFERENCE_KEY, createWebMcpPreference } from './webMcpPreference.js'

/**
 * The **Browser agents** switch's memory (`TODO/ai-021`, Decision 13): per browser profile, in
 * IndexedDB, never in the project file — and failure tolerant, because a private window that
 * blocks storage must still leave WebMCP working at its default (on).
 */

/** @param {{ failRead?: boolean, failWrite?: boolean }} [options] */
function fakeStore(options = {}) {
  /** @type {Map<string, Record<string, any>>} */
  const records = new Map()
  return {
    records,
    store: {
      /** @param {string} key */
      async read(key) {
        if (options.failRead) throw new Error('blocked')
        return records.get(key) ?? null
      },
      /** @param {string} key @param {Record<string, any>} record */
      async write(key, record) {
        if (options.failWrite) throw new Error('quota')
        records.set(key, { ...record })
      },
      /** @param {string} key */
      async clear(key) {
        records.delete(key)
      },
      close() {},
    },
  }
}

describe('createWebMcpPreference', () => {
  it('is on by default: nothing stored means registered whenever the API exists', async () => {
    const { store } = fakeStore()
    expect(await createWebMcpPreference({ store }).load()).toBe(true)
  })

  it('remembers off, and on again', async () => {
    const { store, records } = fakeStore()
    const preference = createWebMcpPreference({ store })
    expect(await preference.save(false)).toEqual({ persisted: true })
    expect(records.get(WEBMCP_PREFERENCE_KEY)).toEqual({ on: false })
    expect(await createWebMcpPreference({ store }).load()).toBe(false)
    await preference.save(true)
    expect(await createWebMcpPreference({ store }).load()).toBe(true)
  })

  it('reads a blocked or garbled store as the default, never a throw', async () => {
    expect(await createWebMcpPreference({ store: fakeStore({ failRead: true }).store }).load()).toBe(true)
    const { store, records } = fakeStore()
    records.set(WEBMCP_PREFERENCE_KEY, { on: 'nope' })
    expect(await createWebMcpPreference({ store }).load()).toBe(true)
  })

  it('a write the browser refuses says so, and does not throw', async () => {
    const { store } = fakeStore({ failWrite: true })
    expect(await createWebMcpPreference({ store }).save(false)).toEqual({ persisted: false })
  })
})
