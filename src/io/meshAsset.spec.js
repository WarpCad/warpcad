// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `asset.mesh` record (`TODO/io-009`): the weld that makes an STL's triangle soup into
 * shared vertices, the canonical encoding stored in the project, and the validator every
 * copy passes through — at import, at load, on a local append and in the kernel.
 */
import { describe, expect, it } from 'vitest'

import {
  MESH_ASSET_OP,
  MESH_LIMITS,
  WELD_TOLERANCE_RATIO,
  buildMeshAsset,
  decodeMeshAsset,
  meshBounds,
  validateMeshAsset,
  validateMeshAssetParams,
  weldMesh,
  weldTolerance,
} from './meshAsset.js'
import { parseStl } from './meshFormats/stl.js'
import { base64FromBytes, bytesFromBase64 } from '../sketch/imageAsset.js'
import { binaryStl, cubeTriangles, gridTriangles } from './__fixtures__/stl.js'

/**
 * @param {readonly (readonly (readonly number[])[])[]} triangles
 * @returns {{ positions: Float32Array, indices: Uint32Array }}
 */
function soup(triangles) {
  const positions = new Float32Array(triangles.flat(2))
  return { positions, indices: Uint32Array.from({ length: positions.length / 3 }, (_, index) => index) }
}

/** A valid record for the cube, built through the real pipeline. */
async function cubeRecord(size = 10) {
  const parsed = parseStl(binaryStl(cubeTriangles(size)))
  if (!parsed.ok) throw new Error(parsed.reason)
  const welded = weldMesh(parsed.positions, parsed.indices)
  if (!welded.ok) throw new Error(welded.reason)
  return buildMeshAsset(welded)
}

/**
 * The record's raw bytes, rewritten by `edit` and re-encoded — for hostile-data cases.
 *
 * @param {any} record
 * @param {(floats: Float32Array, bytes: Uint8Array) => void} edit
 */
function tamper(record, edit) {
  const bytes = bytesFromBase64(record.params.dataBase64)
  edit(new Float32Array(bytes.buffer, 0, record.params.vertexCount * 3), bytes)
  return { ...record, params: { ...record.params, dataBase64: base64FromBytes(bytes) } }
}

describe('weldMesh', () => {
  it("welds a cube's 36 STL corners to 8 shared vertices, keeping all 12 triangles", () => {
    const welded = weldMesh(soup(cubeTriangles(10)).positions, soup(cubeTriangles(10)).indices)
    expect(welded.ok).toBe(true)
    if (!welded.ok) return
    expect(welded.vertexCount).toBe(8)
    expect(welded.triangleCount).toBe(12)
    expect(welded.positions.length).toBe(24)
    expect(welded.indices.length).toBe(36)
    expect(Math.max(...welded.indices)).toBe(7)
  })

  it('uses a tolerance of 1e-5 of the bounding-box diagonal', () => {
    expect(WELD_TOLERANCE_RATIO).toBe(1e-5)
    const bounds = meshBounds(soup(cubeTriangles(10)).positions)
    expect(weldTolerance(bounds)).toBeCloseTo(Math.sqrt(300) * 1e-5, 12)
  })

  it('welds two corners 0.9 × the tolerance apart, and keeps two 1.1 × apart', () => {
    const tolerance = Math.sqrt(300) * 1e-5 // the bounding box below is 10 × 10 × 10
    /** @param {number} gap */
    const mesh = (gap) =>
      soup([
        [[0, 0, 0], [10, 0, 0], [0, 10, 10]],
        [[gap, 0, 0], [10, 10, 0], [10, 0, 10]],
      ])
    const near = mesh(0.9 * tolerance)
    const far = mesh(1.1 * tolerance)
    const nearWelded = weldMesh(near.positions, near.indices)
    const farWelded = weldMesh(far.positions, far.indices)
    expect(nearWelded.ok && nearWelded.vertexCount).toBe(5)
    expect(farWelded.ok && farWelded.vertexCount).toBe(6)
  })

  it('drops a triangle the weld collapses, and a zero-area one', () => {
    const mesh = soup([
      ...cubeTriangles(10),
      [[0, 0, 0], [0, 0, 0], [10, 0, 0]], // two corners the same
      [[0, 0, 0], [5, 0, 0], [10, 0, 0]], // collinear
    ])
    const welded = weldMesh(mesh.positions, mesh.indices)
    expect(welded.ok).toBe(true)
    if (!welded.ok) return
    expect(welded.triangleCount).toBe(12)
    expect(welded.droppedTriangles).toBe(2)
  })

  it('refuses a mesh with no triangle that has any area', () => {
    const mesh = soup([[[0, 0, 0], [5, 0, 0], [10, 0, 0]]])
    const welded = weldMesh(mesh.positions, mesh.indices)
    expect(welded.ok).toBe(false)
    expect(welded.ok ? '' : welded.reason).toMatch(/no triangle/i)
  })

  it('stores 0, never -0', () => {
    const triangles = cubeTriangles(10).map((triangle) => triangle.map((corner) => corner.map((value) => (value === 0 ? -0 : value))))
    const mesh = soup(triangles)
    const welded = weldMesh(mesh.positions, mesh.indices)
    expect(welded.ok).toBe(true)
    if (welded.ok) expect(Array.from(welded.positions).some((value) => Object.is(value, -0))).toBe(false)
  })

  it('welds a 200 × 200 grid to (n + 1)² vertices', () => {
    const mesh = soup(gridTriangles(200))
    const welded = weldMesh(mesh.positions, mesh.indices)
    expect(welded.ok && welded.vertexCount).toBe(201 * 201)
  })
})

describe('buildMeshAsset / validateMeshAsset / decodeMeshAsset', () => {
  it('builds a record of exactly id, op and the three params, with a content-hash id', async () => {
    const record = await cubeRecord()
    expect(Object.keys(record).sort()).toEqual(['id', 'op', 'params'])
    expect(record.op).toBe(MESH_ASSET_OP)
    expect(record.id).toMatch(/^mesh-[0-9a-f]{24}$/)
    expect(Object.keys(record.params).sort()).toEqual(['dataBase64', 'triangleCount', 'vertexCount'])
    expect(record.params.vertexCount).toBe(8)
    expect(record.params.triangleCount).toBe(12)
    expect(validateMeshAsset(record)).toEqual({ ok: true, vertexCount: 8, triangleCount: 12 })
  })

  it('stores float32 positions then uint16 indices while the vertex count fits', async () => {
    const record = await cubeRecord()
    expect(bytesFromBase64(record.params.dataBase64).length).toBe(8 * 12 + 12 * 3 * 2)
  })

  it('stores uint32 indices once there are more than 65,536 vertices', async () => {
    // 2 × 33,000 disjoint triangles spread over a box: nothing to weld, 99,000 vertices.
    /** @type {number[][][]} */
    const triangles = []
    for (let index = 0; index < 33_000; index += 1) {
      const x = (index % 200) * 3
      const y = Math.floor(index / 200) * 3
      triangles.push([[x, y, 0], [x + 1, y, 0], [x, y + 1, 0]])
    }
    const mesh = soup(triangles)
    const welded = weldMesh(mesh.positions, mesh.indices)
    if (!welded.ok) throw new Error(welded.reason)
    const record = await buildMeshAsset(welded)
    expect(record.params.vertexCount).toBe(99_000)
    expect(bytesFromBase64(record.params.dataBase64).length).toBe(99_000 * 12 + 33_000 * 3 * 4)
    expect(validateMeshAsset(record).ok).toBe(true)
  })

  it('decodes back to the welded arrays', async () => {
    const record = await cubeRecord()
    const decoded = decodeMeshAsset(record)
    expect(decoded.positions.length).toBe(24)
    expect(decoded.indices.length).toBe(36)
    expect(Math.max(...decoded.positions)).toBe(10)
  })

  it('gives the same file the same id, so importing it twice dedupes', async () => {
    expect((await cubeRecord()).id).toBe((await cubeRecord()).id)
    expect((await cubeRecord(10)).id).not.toBe((await cubeRecord(11)).id)
  })

  it('validates params alone for the kernel, which never sees the record id', async () => {
    const record = await cubeRecord()
    expect(validateMeshAssetParams(record.params).ok).toBe(true)
    expect(validateMeshAssetParams({ ...record.params, extra: 1 }).ok).toBe(false)
  })
})

describe('validateMeshAsset refuses, by name, and never throws', () => {
  /** @param {unknown} record @param {RegExp} pattern */
  const refuses = (record, pattern) => {
    const verdict = validateMeshAsset(record)
    expect(verdict.ok).toBe(false)
    expect(verdict.ok ? '' : verdict.reason).toMatch(pattern)
  }

  it('any field it does not know', async () => {
    const record = await cubeRecord()
    refuses({ ...record, target: 'x' }, /unexpected field "target"/)
    refuses({ ...record, params: { ...record.params, url: 'https://example.com/a.stl' } }, /unexpected field "url"/)
  })

  it('the wrong op, or an id that is not mesh- and a hex hash', async () => {
    const record = await cubeRecord()
    refuses({ ...record, op: 'asset.image' }, /op must be "asset.mesh"/)
    refuses({ ...record, id: 'mesh-<script>' }, /id must be/)
    refuses({ ...record, id: 'img-0123456789abcdef' }, /id must be/)
  })

  it('counts that are not whole numbers in range', async () => {
    const record = await cubeRecord()
    refuses({ ...record, params: { ...record.params, vertexCount: 8.5 } }, /vertexCount/)
    refuses({ ...record, params: { ...record.params, triangleCount: 0 } }, /triangleCount/)
    refuses({ ...record, params: { ...record.params, triangleCount: MESH_LIMITS.maxTriangles + 1 } }, /Too many triangles/)
    refuses({ ...record, params: { ...record.params, vertexCount: MESH_LIMITS.maxVertices + 1 } }, /vertices/)
  })

  it('data whose length disagrees with the counts — before decoding it', async () => {
    const record = await cubeRecord()
    refuses({ ...record, params: { ...record.params, triangleCount: 11 } }, /length/)
    refuses({ ...record, params: { ...record.params, dataBase64: record.params.dataBase64.slice(4) } }, /length/)
  })

  it('data that is not base64, or larger than the stored cap', async () => {
    const record = await cubeRecord()
    refuses({ ...record, params: { ...record.params, dataBase64: `${record.params.dataBase64.slice(0, -4)}!!!!` } }, /base64/)
    const huge = 'A'.repeat(Math.ceil(MESH_LIMITS.maxStoredBytes / 3) * 4 + 4)
    refuses({ ...record, params: { ...record.params, dataBase64: huge } }, /larger than/)
  })

  it('a NaN, an Infinity or a far-away coordinate in the data', async () => {
    const record = await cubeRecord()
    refuses(tamper(record, (floats) => { floats[4] = Number.NaN }), /finite/)
    refuses(tamper(record, (floats) => { floats[0] = Number.NEGATIVE_INFINITY }), /finite/)
    refuses(tamper(record, (floats) => { floats[2] = MESH_LIMITS.maxAbsCoordinate * 4 }), /beyond/)
  })

  it('an index past the last vertex', async () => {
    const record = await cubeRecord()
    refuses(
      tamper(record, (_floats, bytes) => {
        new DataView(bytes.buffer).setUint16(8 * 12 + 6, 8, true)
      }),
      /index/
    )
  })

  it('a mesh whose every triangle is degenerate', async () => {
    const record = await cubeRecord()
    refuses(
      tamper(record, (_floats, bytes) => {
        const view = new DataView(bytes.buffer)
        for (let index = 0; index < 36; index += 1) view.setUint16(8 * 12 + index * 2, 0, true)
      }),
      /no triangle/i
    )
  })

  it('things that are not records at all, and a getter that throws', () => {
    for (const value of [null, undefined, 'asset.mesh', 3, [], { op: 'asset.mesh' }]) {
      expect(validateMeshAsset(value).ok).toBe(false)
    }
    const trap = { id: 'mesh-0123456789abcdef01234567', op: 'asset.mesh', get params() { throw new Error('boom') } }
    expect(() => validateMeshAsset(trap)).not.toThrow()
    expect(validateMeshAsset(trap).ok).toBe(false)
  })

  it('decodeMeshAsset throws the reason for a bad record', async () => {
    const record = await cubeRecord()
    expect(() => decodeMeshAsset({ ...record, params: { ...record.params, triangleCount: 11 } })).toThrow(/length/)
  })
})
