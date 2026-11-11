// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — duck-typed fakes of the browser globals; download.js itself is typechecked.
import { describe, expect, it, vi } from 'vitest'

import { createFakeTauriFs } from '../native/__fixtures__/fakeFs.js'
import { downloadBytes, saveBytes } from './download.js'

/**
 * The one place a file is handed to the browser as a download — `<a download>` with a Blob
 * object URL (`TODO/ui-034` decision (b); `fileSystem.js`'s Download copy is the same code).
 */

function fakeEnv() {
  const created = []
  const revoked = []
  const timers = []
  const clicks = []
  const appended = []
  const env = {
    Blob: class {
      constructor(parts, options) {
        this.parts = parts
        this.type = options?.type
      }
    },
    URL: {
      createObjectURL(blob) {
        created.push(blob)
        return `blob:fake/${created.length}`
      },
      revokeObjectURL(url) {
        revoked.push(url)
      },
    },
    document: {
      createElement() {
        const anchor = {
          style: {},
          click() {
            clicks.push({ href: anchor.href, download: anchor.download, connected: appended.includes(anchor) })
          },
          remove() {
            appended.splice(appended.indexOf(anchor), 1)
          },
        }
        return anchor
      },
      body: {
        appendChild(node) {
          appended.push(node)
        },
      },
    },
    setTimeout(fn, ms) {
      timers.push({ fn, ms })
    },
  }
  return { env, created, revoked, timers, clicks, appended }
}

describe('downloadBytes', () => {
  it('clicks a real anchor carrying the filename, with the bytes typed by the caller', () => {
    const { env, created, clicks } = fakeEnv()
    const bytes = new Uint8Array([1, 2, 3])
    const result = downloadBytes(bytes, 'union-1.stl', 'model/stl', env)
    expect(result).toEqual({ ok: true, name: 'union-1.stl' })
    expect(created[0].type).toBe('model/stl')
    expect(created[0].parts).toEqual([bytes])
    expect(clicks).toEqual([{ href: 'blob:fake/1', download: 'union-1.stl', connected: true }])
  })

  it('takes the anchor back out of the page afterwards', () => {
    const { env, appended } = fakeEnv()
    downloadBytes(new Uint8Array(1), 'a.stl', 'model/stl', env)
    expect(appended).toEqual([])
  })

  it('revokes the object URL later, not at once (revoking immediately can cancel the download)', () => {
    const { env, revoked, timers } = fakeEnv()
    downloadBytes(new Uint8Array(1), 'a.stl', 'model/stl', env)
    expect(revoked).toEqual([])
    expect(timers).toHaveLength(1)
    expect(timers[0].ms).toBeGreaterThanOrEqual(10_000)
    timers[0].fn()
    expect(revoked).toEqual(['blob:fake/1'])
  })

  it('reports a failure instead of throwing, so the caller can name it', () => {
    const { env } = fakeEnv()
    env.URL.createObjectURL = vi.fn(() => {
      throw new Error('blocked')
    })
    expect(downloadBytes(new Uint8Array(1), 'a.stl', 'model/stl', env)).toEqual({
      ok: false,
      name: 'a.stl',
      error: 'blocked',
    })
  })

  it('works against the real jsdom globals too (Blob, URL, document)', () => {
    URL.createObjectURL = vi.fn(() => 'blob:real/1')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    expect(downloadBytes(new Uint8Array([9]), 'x.obj', 'model/obj').ok).toBe(true)
    expect(click).toHaveBeenCalledTimes(1)
  })
})

/**
 * `TODO/io-014`: inside the native app there is no Blob download. Every export goes through
 * {@link saveBytes}, which writes `Documents/Exports/<name>`; `downloadBytes` itself throws there,
 * so a caller that was missed fails loudly in a test instead of silently on the phone.
 */
describe('inside the native app (TODO/io-014)', () => {
  function nativeEnv() {
    const fs = createFakeTauriFs()
    const base = fakeEnv()
    const env = {
      ...base.env,
      navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 },
      __TAURI_INTERNALS__: {
        invoke: (cmd, args, options) => (cmd === 'shell_info' ? Promise.resolve({ platform: 'ios', version: '1.13.0' }) : fs.invoke(cmd, args, options)),
      },
    }
    return { ...base, env, fs }
  }

  it('downloadBytes throws rather than start a Blob download that may do nothing', () => {
    const { env, clicks } = nativeEnv()
    expect(() => downloadBytes('x', 'part.stl', 'model/stl', env)).toThrow(/native app/)
    expect(clicks).toEqual([])
  })

  it('saveBytes writes the file to Documents/Exports and says where it is', async () => {
    const { env, fs, clicks } = nativeEnv()
    const result = await saveBytes(new Uint8Array([7, 8]), 'part.stl', 'model/stl', env)
    expect(result).toEqual({ ok: true, name: 'part.stl', native: true, place: 'Files › On My iPhone › WarpCad › Exports › part.stl' })
    expect(fs.documents()).toEqual(['Exports/part.stl'])
    expect(clicks).toEqual([])
  })

  it('saveBytes reports a refused write by name, never a download', async () => {
    const { env, fs, clicks } = nativeEnv()
    fs.fail('plugin:fs|write_file', 'forbidden path: Exports/.part.stl.tmp')
    const result = await saveBytes('x', 'part.stl', 'model/stl', env)
    expect(result).toEqual({ ok: false, name: 'part.stl', error: 'forbidden path: Exports/.part.stl.tmp' })
    expect(clicks).toEqual([])
  })

  it('on the web saveBytes is the same download as before, started synchronously inside the call', () => {
    const { env, clicks } = fakeEnv()
    const pending = saveBytes('x', 'part.stl', 'model/stl', env)
    // The anchor was clicked before the first await: still inside the user's gesture.
    expect(clicks).toHaveLength(1)
    return expect(pending).resolves.toEqual({ ok: true, name: 'part.stl', native: false })
  })
})
