// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest'

import { decodeAssetBitmap, importImageFile, releaseAssetBitmaps, setImageWorkerFactory } from './imageClient.js'
import { validAssetRecord } from './__fixtures__/images.js'
import { fitWithin } from './imageJob.js'

/**
 * A fake worker (CLAUDE.md: mock at the boundary). It answers each request after the test
 * says so, so a spec controls the order replies arrive in.
 */
function fakeWorker() {
  /** @type {Map<string, Set<(event: any) => void>>} */
  const listeners = new Map()
  /** @type {any[]} */
  const requests = []
  const worker = {
    requests,
    /** @param {string} type @param {(event: any) => void} handler */
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)?.add(handler)
    },
    /** @param {string} type @param {(event: any) => void} handler */
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler)
    },
    /** @param {any} message */
    postMessage(message) {
      requests.push(message)
    },
    terminate() {},
    /** @param {number} index @param {any} data */
    answer(index, data) {
      for (const handler of [...(listeners.get('message') ?? [])]) handler({ data: { id: requests[index].id, ...data } })
    },
  }
  return worker
}

afterEach(() => {
  releaseAssetBitmaps()
  setImageWorkerFactory(null)
})

describe('importImageFile — supersede, never queue', () => {
  it('a second import supersedes the first: the first answers superseded, the second its result', async () => {
    const worker = fakeWorker()
    setImageWorkerFactory(() => /** @type {any} */ (worker))
    const first = importImageFile(new Blob(['a'], { type: 'image/png' }))
    const second = importImageFile(new Blob(['b'], { type: 'image/png' }))
    expect(worker.requests.map((request) => request.kind)).toEqual(['import', 'import'])
    worker.answer(0, { ok: true, result: { ok: true, record: { id: 'img-first' }, bitmap: { close() {} } } })
    worker.answer(1, { ok: true, result: { ok: false, reason: 'nope' } })
    await expect(first).resolves.toEqual({ superseded: true })
    await expect(second).resolves.toEqual({ superseded: false, result: { ok: false, reason: 'nope' } })
  })

  it('a worker error is a refusal in words, not a throw', async () => {
    const worker = fakeWorker()
    setImageWorkerFactory(() => /** @type {any} */ (worker))
    const pending = importImageFile(new Blob(['a'], { type: 'image/png' }))
    worker.answer(0, { ok: false, error: 'boom' })
    await expect(pending).resolves.toEqual({ superseded: false, result: { ok: false, reason: 'That image could not be read (boom)' } })
  })
})

describe('decodeAssetBitmap — one decode per asset, cached until released', () => {
  it('asks the worker once per asset id, and release closes the bitmaps', async () => {
    const worker = fakeWorker()
    setImageWorkerFactory(() => /** @type {any} */ (worker))
    const record = /** @type {any} */ (validAssetRecord())
    let closed = 0
    const bitmap = { width: 640, height: 480, close: () => (closed += 1) }
    const a = decodeAssetBitmap(record)
    const b = decodeAssetBitmap(record)
    expect(worker.requests).toHaveLength(1)
    expect(worker.requests[0]).toMatchObject({ kind: 'decode', record })
    worker.answer(0, { ok: true, result: bitmap })
    await expect(a).resolves.toBe(bitmap)
    await expect(b).resolves.toBe(bitmap)
    releaseAssetBitmaps()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(closed).toBe(1)
  })

  it('a failed decode rejects and is not cached', async () => {
    const worker = fakeWorker()
    setImageWorkerFactory(() => /** @type {any} */ (worker))
    const record = /** @type {any} */ (validAssetRecord())
    const failed = decodeAssetBitmap(record)
    worker.answer(0, { ok: false, error: 'bad bytes' })
    await expect(failed).rejects.toThrow('bad bytes')
    decodeAssetBitmap(record).catch(() => {})
    expect(worker.requests).toHaveLength(2)
  })
})

describe('fitWithin', () => {
  it('downscales the long edge to 2048 and never upscales', () => {
    expect(fitWithin(4032, 3024)).toEqual({ widthPx: 2048, heightPx: 1536 })
    expect(fitWithin(3024, 4032)).toEqual({ widthPx: 1536, heightPx: 2048 })
    expect(fitWithin(1400, 1000)).toEqual({ widthPx: 1400, heightPx: 1000 })
  })
})
