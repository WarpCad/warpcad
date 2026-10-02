// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — FakeWorker below duck-types just the slice of the `Worker` interface
// the client uses, and the bodies are built from `evaluate()`'s map, which is typed as
// possibly-undefined. The client itself is typechecked; this file mocks its boundary.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExportError, exportBodies } from './export.js'
import { EXPORT_CANCELLED, cancelExport, runExport, setExportWorkerFactory, workerAvailable, disposeExportWorker } from './exportClient.js'
import { packError, refoldRequestOf, runExportJob } from './exportJob.js'
import { createDocument } from './document.js'
import { evaluate } from './kernel/index.js'

/**
 * The export worker's main-thread client (`TODO/perf-001`).
 *
 * `CLAUDE.md`'s Conventions say to mock at the boundary — "the kernel worker" by name —
 * so nothing here constructs a real `Worker`. {@link FakeWorker} implements just the
 * slice of the interface the client uses (`postMessage`, `addEventListener`,
 * `terminate`) and runs the *real* {@link runExportJob} on the other side of it, so
 * what is under test is the protocol and the fallback logic rather than a stub's idea
 * of what a worker returns.
 *
 * The property that matters most is the one asserted first: **the bytes are identical
 * to the synchronous path's**. A worker that produced a slightly different file would
 * be a far worse bug than the freeze it was built to fix — `io-004` and `io-005` are
 * both about export output being subtly wrong while everything looked green.
 */

/** A `Worker` that answers out of band, exactly as a real one does. */
class FakeWorker {
  /** @param {{ fail?: 'construct' | 'error' | 'silent', delay?: number }} [behaviour] */
  constructor(behaviour = {}) {
    if (behaviour.fail === 'construct') throw new Error('no worker here')
    this.behaviour = behaviour
    /** @type {Record<string, Function[]>} */
    this.listeners = { message: [], error: [] }
    this.posted = []
    this.terminated = false
  }

  addEventListener(type, listener) {
    this.listeners[type]?.push(listener)
  }

  removeEventListener(type, listener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((entry) => entry !== listener)
  }

  terminate() {
    this.terminated = true
  }

  /** @param {string} type @param {any} event */
  emit(type, event) {
    for (const listener of [...(this.listeners[type] ?? [])]) listener(event)
  }

  postMessage(message) {
    this.posted.push(message)
    if (this.behaviour.fail === 'silent') return
    queueMicrotask(() => {
      if (this.behaviour.fail === 'error') {
        this.emit('error', new Error('worker blew up'))
        return
      }
      try {
        const result = runExportJob({ format: message.format, bodies: message.bodies, refold: message.refold })
        this.emit('message', { data: { id: message.id, ok: true, result } })
      } catch (error) {
        this.emit('message', { data: { id: message.id, ok: false, error: packError(error) } })
      }
    })
  }
}

/** @param {any[]} records @param {string} id @param {string} name */
function bodyFrom(records, id, name) {
  return { id, name, geometry: evaluate(records).byId.get(id) }
}

/** ACCEPTANCE scenario 11's own shape, and `io-004`'s reproduction 1. */
const unionBody = () =>
  bodyFrom(
    [
      { id: 'cyl', op: 'primitive.cylinder', params: { diameter: 40, height: 50, center: [-100.89, 66.93, 25] } },
      { id: 'cube', op: 'primitive.cuboid', params: { size: [40, 40, 40], center: [-95, 75, 20] } },
      { id: 'u', op: 'boolean.union', target: 'cyl', operands: ['cube'] },
    ],
    'u',
    'Union 1'
  )

/** A Group body — the case where the worker also does the `combine()`. */
const boltBody = () => bodyFrom([{ id: 'b', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 30 } }], 'b', 'Bolt 1')

/** Stands in for `src/render/export.js`; `src/core/` may not import three.js. */
function fakeGltf() {
  const calls = []
  return {
    calls,
    loadGltfExporter: async () => async (bodies, options) => {
      calls.push({ bodies, options })
      return {
        bytes: new Uint8Array([103, 108, 84, 70]),
        filename: 'union-1.glb',
        mimeType: 'model/gltf-binary',
        triangleCount: 12,
      }
    },
  }
}

let made = []

beforeEach(() => {
  made = []
})

afterEach(() => {
  setExportWorkerFactory(null)
  disposeExportWorker()
})

/** @param {{ fail?: 'construct' | 'error' | 'silent' }} [behaviour] */
function useFakeWorker(behaviour = {}) {
  setExportWorkerFactory(() => {
    const worker = new FakeWorker(behaviour)
    made.push(worker)
    return /** @type {any} */ (worker)
  })
  return made
}

describe('runExport through the worker (perf-001)', () => {
  for (const format of /** @type {const} */ (['stl', 'obj'])) {
    it(`returns byte-identical ${format.toUpperCase()} to the synchronous path`, async () => {
      useFakeWorker()
      const bodies = [unionBody(), boltBody()]

      const direct = exportBodies(bodies, format)
      const viaWorker = await runExport(bodies, format, fakeGltf())

      expect(viaWorker.filename).toBe(direct.filename)
      expect(viaWorker.mimeType).toBe(direct.mimeType)
      expect(viaWorker.triangleCount).toBe(direct.triangleCount)
      expect(viaWorker.bytes.byteLength).toBe(direct.bytes.byteLength)
      // Byte for byte — not "close enough".
      expect(Array.from(viaWorker.bytes)).toEqual(Array.from(direct.bytes))
    })
  }

  it('sends a Group body as its parts, so the worker does the combine() too', async () => {
    const workers = useFakeWorker()
    await runExport([boltBody()], 'stl', fakeGltf())

    const [message] = workers[0].posted
    expect(message.format).toBe('stl')
    expect(message.bodies[0].geometry.kind).toBe('group')
    expect(Object.keys(message.bodies[0].geometry.parts).length).toBeGreaterThan(0)
    // Nothing that crosses postMessage may be a kernel object with methods or a matrix.
    expect(() => structuredClone(message)).not.toThrow()
  })

  it('hands glTF the solids the worker already repaired, and does not repair them twice', async () => {
    useFakeWorker()
    const gltf = fakeGltf()
    const bodies = [unionBody()]

    const result = await runExport(bodies, 'glb', gltf)

    expect(result.filename).toBe('union-1.glb')
    expect(gltf.calls).toHaveLength(1)
    expect(gltf.calls[0].bodies).toBe(bodies)
    expect(gltf.calls[0].options.prepared).toHaveLength(1)
    expect(gltf.calls[0].options.prepared[0].name).toBe('Union 1')
    expect(gltf.calls[0].options.prepared[0].solid.polygons.length).toBeGreaterThan(0)
  })

  it('carries a refusal across by name, with its code, and does NOT retry it on the main thread', async () => {
    const workers = useFakeWorker()
    const empty = { id: 'e', name: 'Ghost', geometry: { polygons: [] } }

    await expect(runExport([empty], 'stl', fakeGltf())).rejects.toMatchObject({
      name: 'ExportError',
      code: 'empty-geometry',
      bodyName: 'Ghost',
    })
    // One ask, no fallback attempt, and the worker is still usable afterwards.
    expect(workers).toHaveLength(1)
    expect(workers[0].posted).toHaveLength(1)
    expect(workerAvailable()).toBe(true)
  })

  it('reuses one worker across exports rather than starting a new one each time', async () => {
    const workers = useFakeWorker()
    await runExport([unionBody()], 'stl', fakeGltf())
    await runExport([unionBody()], 'obj', fakeGltf())
    expect(workers).toHaveLength(1)
    expect(workers[0].posted).toHaveLength(2)
  })
})

describe('runExport falls back to the main thread (perf-001)', () => {
  it('produces the same bytes when a Worker cannot be constructed at all', async () => {
    useFakeWorker({ fail: 'construct' })
    const bodies = [unionBody()]

    const viaFallback = await runExport(bodies, 'stl', fakeGltf())

    expect(workerAvailable()).toBe(false)
    expect(Array.from(viaFallback.bytes)).toEqual(Array.from(exportBodies(bodies, 'stl').bytes))
  })

  it('produces the same bytes when the worker dies mid-export', async () => {
    useFakeWorker({ fail: 'error' })
    const bodies = [unionBody()]

    const viaFallback = await runExport(bodies, 'stl', fakeGltf())

    expect(Array.from(viaFallback.bytes)).toEqual(Array.from(exportBodies(bodies, 'stl').bytes))
    expect(workerAvailable()).toBe(false)
  })

  it('falls back to the plain exportGltf call, with no prepared solids', async () => {
    useFakeWorker({ fail: 'construct' })
    const gltf = fakeGltf()

    await runExport([unionBody()], 'glb', gltf)

    expect(gltf.calls).toHaveLength(1)
    expect(gltf.calls[0].options).toBeUndefined()
  })

  it('stops trying the worker once it has failed, instead of paying for it on every export', async () => {
    const workers = useFakeWorker({ fail: 'error' })
    await runExport([unionBody()], 'stl', fakeGltf())
    await runExport([unionBody()], 'stl', fakeGltf())
    expect(workers).toHaveLength(1)
  })

  it('still refuses an empty body by name on the fallback path', async () => {
    useFakeWorker({ fail: 'construct' })
    await expect(
      runExport([{ id: 'e', name: 'Ghost', geometry: { polygons: [] } }], 'stl', fakeGltf())
    ).rejects.toBeInstanceOf(ExportError)
  })
})

describe('runExport at another resolution (TODO/core-035)', () => {
  function design() {
    const document = createDocument({ resolution: 'normal' })
    document.append({ id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 50, height: 20 } }, { origin: 'local' })
    return document
  }

  it('sends records, not packed geometry, and the worker folds them at the override', async () => {
    const workers = useFakeWorker()
    const document = design()
    const bodies = document.bodies()
    const atDesign = await runExport(bodies, 'stl', fakeGltf())
    const atPrint = await runExport(bodies, 'stl', { ...fakeGltf(), refold: refoldRequestOf(document, 'print', []) })
    const posted = workers[0].posted.at(-1)
    expect(posted.bodies).toEqual([])
    expect(posted.refold.resolution).toBe('print')
    expect(atPrint.triangleCount).toBeGreaterThan(atDesign.triangleCount)
    expect(atPrint.filename).toBe('cylinder-1.stl')
    expect(workerAvailable()).toBe(true)
  })

  it('cancelExport stops an in-flight re-fold: the worker is terminated, the export rejects as cancelled', async () => {
    const workers = useFakeWorker({ fail: 'silent' })
    const document = design()
    const pending = runExport(document.bodies(), 'stl', { ...fakeGltf(), refold: refoldRequestOf(document, 'print', []) })
    await Promise.resolve()
    expect(cancelExport()).toBe(true)
    await expect(pending).rejects.toMatchObject({ name: EXPORT_CANCELLED })
    expect(workers[0].terminated).toBe(true)
    // A cancel is not a broken worker: the next export still goes to a (fresh) worker.
    expect(workerAvailable()).toBe(true)
    expect(cancelExport()).toBe(false)
  })

  it('without any worker, the same job runs as the fallback and still honours the override', async () => {
    useFakeWorker({ fail: 'construct' })
    const document = design()
    const atPrint = await runExport(document.bodies(), 'stl', { ...fakeGltf(), refold: refoldRequestOf(document, 'print', []) })
    const atDesign = exportBodies(document.bodies(), 'stl')
    expect(atPrint.triangleCount).toBeGreaterThan(atDesign.triangleCount)
    expect(workerAvailable()).toBe(false)
  })
})
