// @vitest-environment jsdom
// @ts-nocheck — duck-typed fakes of the browser globals; download.js itself is typechecked.
import { describe, expect, it, vi } from 'vitest'

import { downloadBytes } from './download.js'

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
