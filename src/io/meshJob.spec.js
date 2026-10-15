// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The model-import job and its client (`TODO/io-009`), and the library-part wrapper the
 * import becomes: parse, weld, cap, hash and self-validate off the main thread; supersede,
 * don't queue; fall back to the main thread when no worker can be made; and a `user.<slug>`
 * definition of `[asset.mesh, import.mesh]` that the ordinary part machinery accepts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { importMeshBytes, importMeshFile, meshNameFromFile } from './meshJob.js'
import { cancelModelImport, importModelFile, setMeshWorkerFactory } from './meshClient.js'
import { IMPORT_MESH_OP, UNIT_SCALES, meshPartDefinition, meshPartInfo, meshPartSizeMm, withUnits } from './meshPart.js'
import { MESH_LIMITS, validateMeshAsset } from './meshAsset.js'
import { validateUserPart } from '../core/userPart.js'
import { asciiBytes, binaryStl, cubeTriangles } from './__fixtures__/stl.js'

/**
 * A `File`-shaped blob: what an `<input type="file">` hands the store.
 *
 * @param {Uint8Array} bytes
 * @param {string} name
 */
function fileOf(bytes, name) {
  return Object.assign(new Blob([/** @type {any} */ (bytes)]), { name })
}

afterEach(() => {
  setMeshWorkerFactory(null)
})

describe('importMeshBytes', () => {
  it('turns a binary STL into a validated asset.mesh record and the row’s numbers', async () => {
    const result = await importMeshBytes('bracket.stl', binaryStl(cubeTriangles(42, [5, 5, 5])))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(validateMeshAsset(result.record).ok).toBe(true)
    expect(result.name).toBe('bracket')
    expect(result.format).toBe('binary')
    expect(result.triangleCount).toBe(12)
    expect(result.vertexCount).toBe(8)
    expect(result.sourceTriangleCount).toBe(12)
    expect(result.droppedTriangles).toBe(0)
    result.sizeRaw.forEach((size) => expect(size).toBeCloseTo(42, 4))
    expect(result.preview.positions).toBeInstanceOf(Float32Array)
    expect(result.preview.indices.length).toBe(36)
  })

  it('refuses a text file named .stl with the parser’s reason', async () => {
    const result = await importMeshBytes('x.stl', asciiBytes('a grocery list, not a model'))
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toMatch(/^Not a valid STL/)
  })

  it('refuses a file whose every triangle is degenerate', async () => {
    const result = await importMeshBytes('flat.stl', binaryStl([[[0, 0, 0], [1, 0, 0], [2, 0, 0]]]))
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toMatch(/no triangle/i)
  })

  it('refuses a mesh too detailed to store, naming the cap', async () => {
    const result = await importMeshBytes('cube.stl', binaryStl(cubeTriangles(10)), { ...MESH_LIMITS, maxStoredBytes: 64 })
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toMatch(/too detailed to store/i)
  })
})

describe('importMeshFile', () => {
  it('refuses a file over the read cap without reading it', async () => {
    const file = fileOf(new Uint8Array(16), 'huge.stl')
    Object.defineProperty(file, 'size', { value: MESH_LIMITS.maxFileBytes + 1 })
    const read = vi.spyOn(file, 'arrayBuffer')
    const result = await importMeshFile(file)
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toMatch(/larger than 25 MB/)
    expect(read).not.toHaveBeenCalled()
  })

  it('reads a chosen file', async () => {
    const result = await importMeshFile(fileOf(binaryStl(cubeTriangles(10)), 'cube.stl'))
    expect(result.ok && result.triangleCount).toBe(12)
  })
})

describe('meshNameFromFile', () => {
  it('is the base name, without folders, extension or control characters, bounded', () => {
    expect(meshNameFromFile('bracket.stl')).toBe('bracket')
    expect(meshNameFromFile('C:\\models\\v2\\bracket.final.STL')).toBe('bracket.final')
    expect(meshNameFromFile('../../etc/passwd')).toBe('passwd')
    expect(meshNameFromFile('a\u0000b\u0007c.stl')).toBe('abc')
    expect(meshNameFromFile('.stl')).toBe('Imported model')
    expect(meshNameFromFile('')).toBe('Imported model')
    expect(meshNameFromFile(`${'x'.repeat(500)}.stl`).length).toBeLessThanOrEqual(80)
  })
})

/** A stand-in worker: records what it is sent, answers only when told to. */
class FakeWorker {
  constructor() {
    /** @type {any[]} */
    this.sent = []
    /** @type {Set<(event: any) => void>} */
    this.listeners = new Set()
    this.terminated = false
  }
  /** @param {string} type @param {(event: any) => void} listener */
  addEventListener(type, listener) {
    if (type === 'message') this.listeners.add(listener)
  }
  /** @param {string} _type @param {(event: any) => void} listener */
  removeEventListener(_type, listener) {
    this.listeners.delete(listener)
  }
  /** @param {any} message */
  postMessage(message) {
    this.sent.push(message)
  }
  terminate() {
    this.terminated = true
  }
  /** @param {any} data */
  answer(data) {
    for (const listener of [...this.listeners]) listener({ data })
  }
}

describe('meshClient', () => {
  it('falls back to the main thread when no worker can be made', async () => {
    setMeshWorkerFactory(() => {
      throw new Error('no workers here')
    })
    const outcome = await importModelFile(fileOf(binaryStl(cubeTriangles(10)), 'cube.stl'))
    expect(outcome.superseded).toBe(false)
    if (!outcome.superseded) expect(outcome.result.ok).toBe(true)
  })

  it('a second file supersedes the first: the first answers superseded and its worker is stopped', async () => {
    /** @type {FakeWorker[]} */
    const made = []
    setMeshWorkerFactory(() => {
      const worker = new FakeWorker()
      made.push(worker)
      return /** @type {any} */ (worker)
    })
    const first = importModelFile(fileOf(binaryStl(cubeTriangles(10)), 'first.stl'))
    const second = importModelFile(fileOf(binaryStl(cubeTriangles(10)), 'second.stl'))
    expect(await first).toEqual({ superseded: true })
    expect(made[0].terminated).toBe(true)
    // The replacement worker answers the second request.
    const latest = made[made.length - 1]
    const request = latest.sent[latest.sent.length - 1]
    latest.answer({ id: request.id, ok: true, result: { ok: false, reason: 'from the worker' } })
    const outcome = await second
    expect(outcome.superseded).toBe(false)
    if (!outcome.superseded) expect(outcome.result).toEqual({ ok: false, reason: 'from the worker' })
  })

  it('cancelModelImport answers the pending import superseded', async () => {
    setMeshWorkerFactory(() => /** @type {any} */ (new FakeWorker()))
    const pending = importModelFile(fileOf(binaryStl(cubeTriangles(10)), 'slow.stl'))
    cancelModelImport()
    expect(await pending).toEqual({ superseded: true })
  })

  it('a worker failure is a refusal in words, never a throw', async () => {
    /** @type {FakeWorker | null} */
    let worker = null
    setMeshWorkerFactory(() => {
      worker = new FakeWorker()
      return /** @type {any} */ (worker)
    })
    const pending = importModelFile(fileOf(binaryStl(cubeTriangles(10)), 'cube.stl'))
    const active = /** @type {FakeWorker} */ (/** @type {unknown} */ (worker))
    active.answer({ id: active.sent[0].id, ok: false, error: 'out of memory' })
    const outcome = await pending
    expect(outcome.superseded).toBe(false)
    if (!outcome.superseded) {
      expect(outcome.result.ok).toBe(false)
      expect(outcome.result.ok ? '' : outcome.result.reason).toMatch(/out of memory/)
    }
  })
})

describe('meshPartDefinition — an import is an ordinary user part', () => {
  async function imported() {
    const result = await importMeshBytes('bracket.stl', binaryStl(cubeTriangles(10)))
    if (!result.ok) throw new Error(result.reason)
    return result
  }

  it('is [asset.mesh, import.mesh] under user.<slug>, and validates as a part', async () => {
    const result = await imported()
    const definition = meshPartDefinition({ record: result.record, name: 'Bracket v2', triangleCount: result.triangleCount })
    expect(definition.op).toBe('user.bracket-v2')
    expect(definition.records.map((record) => record.op)).toEqual(['asset.mesh', IMPORT_MESH_OP])
    expect(definition.records[1].target).toBe(result.record.id)
    expect(definition.result).toBe(definition.records[1].id)
    expect(definition.params).toEqual([])
    const verdict = validateUserPart(definition)
    expect(verdict.ok ? '' : verdict.reason).toBe('')
  })

  it('reads back as a mesh part, with units assumed mm until chosen', async () => {
    const result = await imported()
    const definition = meshPartDefinition({ record: result.record, name: 'bracket', triangleCount: 12 })
    expect(meshPartInfo(definition)).toEqual({
      assetId: result.record.id,
      name: 'bracket',
      triangleCount: 12,
      unitScale: 1,
      units: 'mm',
      unitsConfirmed: false,
    })
    expect(meshPartInfo({ ...definition, records: [{ id: 'a', op: 'primitive.cuboid', params: {} }] })).toBeNull()
  })

  it('switching units rescales, confirms and bumps the version; the size reads live', async () => {
    const result = await imported()
    const definition = meshPartDefinition({ record: result.record, name: 'bracket', triangleCount: 12 })
    meshPartSizeMm(definition).forEach((size) => expect(size).toBeCloseTo(10, 4))
    const inch = withUnits(definition, 'inch')
    expect(UNIT_SCALES.inch).toBe(25.4)
    expect(inch.version).toBe(definition.version + 1)
    expect(meshPartInfo(inch)).toMatchObject({ units: 'inch', unitScale: 25.4, unitsConfirmed: true })
    meshPartSizeMm(inch).forEach((size) => expect(size).toBeCloseTo(254, 3))
    expect(validateUserPart(inch).ok).toBe(true)
    expect(() => withUnits(definition, /** @type {any} */ ('furlong'))).toThrow(/units/)
  })
})
