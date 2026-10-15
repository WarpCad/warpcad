// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `import.mesh` op (`TODO/io-009`): an `asset.mesh` record in, a `Geom3` out —
 * recentred on its bounding-box centre in XY with its lowest point on Z = 0, scaled by the
 * part's units — and the export criterion `io-004` set: an imported cube written back out
 * as STL has zero open edges.
 */
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { evaluate } from '../index.js'
import { boundsOf } from '../group.js'
import { makeWatertight, openEdgesOf } from '../watertight.js'
import { exportBodies } from '../../export.js'
import { importMeshBytes } from '../../../io/meshJob.js'
import { parseStl } from '../../../io/meshFormats/stl.js'
import { weldMesh } from '../../../io/meshAsset.js'
import { binaryStl, cubeTriangles, gridTriangles } from '../../../io/__fixtures__/stl.js'

const { measurements } = modeling

/**
 * @param {Parameters<typeof cubeTriangles>[0]} size
 * @param {Parameters<typeof cubeTriangles>[1]} [origin]
 */
async function cubeAsset(size, origin) {
  const result = await importMeshBytes('cube.stl', binaryStl(cubeTriangles(size, origin)))
  if (!result.ok) throw new Error(result.reason)
  return result.record
}

/**
 * @param {any} asset
 * @param {Record<string, unknown>} [params]
 */
function build(asset, params = {}) {
  const { byId } = evaluate([asset, { id: 'model', op: 'import.mesh', target: asset.id, params: { unitScale: 1, recenter: true, ...params } }])
  return /** @type {any} */ (byId.get('model'))
}

/** @param {any} solid */
function bounds(solid) {
  const [min, max] = boundsOf(solid)
  return { min, max }
}

describe('import.mesh — placement', () => {
  it('recentres in XY on the bounding-box centre and puts the lowest point on Z = 0', async () => {
    const { min, max } = bounds(build(await cubeAsset(10, [100, -50, 30])))
    expect(min[0]).toBeCloseTo(-5, 6)
    expect(max[0]).toBeCloseTo(5, 6)
    expect(min[1]).toBeCloseTo(-5, 6)
    expect(max[1]).toBeCloseTo(5, 6)
    expect(min[2]).toBeCloseTo(0, 6)
    expect(max[2]).toBeCloseTo(10, 6)
  })

  it('scales by the units before recentring: 1 inch is 25.4 mm', async () => {
    const { min, max } = bounds(build(await cubeAsset(1, [2, 2, 2]), { unitScale: 25.4 }))
    expect(max[0] - min[0]).toBeCloseTo(25.4, 5)
    expect(max[2] - min[2]).toBeCloseTo(25.4, 5)
    expect(min[2]).toBeCloseTo(0, 6)
    expect(min[0]).toBeCloseTo(-12.7, 5)
  })

  it('keeps the file’s own coordinates when recentre is off', async () => {
    const { min } = bounds(build(await cubeAsset(10, [100, -50, 30]), { recenter: false, unitScale: 10 }))
    expect(min[0]).toBeCloseTo(1000, 3)
    expect(min[1]).toBeCloseTo(-500, 3)
    expect(min[2]).toBeCloseTo(300, 3)
  })

  it('places a flat (zero-height) mesh on the ground plane', async () => {
    const result = await importMeshBytes('plate.stl', binaryStl(gridTriangles(4, 5, 7)))
    if (!result.ok) throw new Error(result.reason)
    const { min, max } = bounds(build(result.record))
    expect(min[2]).toBeCloseTo(0, 9)
    expect(max[2]).toBeCloseTo(0, 9)
    expect(min[0]).toBeCloseTo(-10, 6)
    expect(max[1]).toBeCloseTo(10, 6)
  })

  it('builds one polygon per welded triangle, corners shared by identity', async () => {
    const solid = build(await cubeAsset(10))
    const polygons = modeling.geometries.geom3.toPolygons(solid)
    expect(polygons.length).toBe(12)
    expect(measurements.measureVolume(solid)).toBeCloseTo(1000, 6)
  })
})

describe('import.mesh — refusals', () => {
  it('refuses a unit scale that is not a positive, bounded number', async () => {
    const asset = await cubeAsset(10)
    for (const unitScale of [0, -1, Number.NaN, 1e9, '25.4']) {
      expect(() => build(asset, { unitScale })).toThrow(/unitScale/)
    }
  })

  it('refuses a target that is not an asset.mesh', () => {
    expect(() =>
      evaluate([
        { id: 'box', op: 'primitive.cuboid', params: { size: [1, 1, 1] } },
        { id: 'model', op: 'import.mesh', target: 'box', params: { unitScale: 1 } },
      ])
    ).toThrow(/asset\.mesh/)
  })

  it('refuses an asset.mesh whose data fails validation, naming why', async () => {
    const asset = await cubeAsset(10)
    const bad = { ...asset, params: { ...asset.params, triangleCount: 11 } }
    expect(() => build(bad)).toThrow(/length/)
  })
})

describe('import.mesh — reuse', () => {
  it('decodes and builds once per asset and placement, however many times it is folded', async () => {
    const asset = await cubeAsset(10)
    const first = build(JSON.parse(JSON.stringify(asset)))
    const second = build(JSON.parse(JSON.stringify(asset)))
    expect(second).toBe(first)
    expect(build(asset, { unitScale: 10 })).not.toBe(first)
  })
})

describe('import.mesh — an ordinary body downstream', () => {
  it('can have a primitive subtracted from it', async () => {
    const asset = await cubeAsset(20)
    const { byId } = evaluate([
      asset,
      { id: 'model', op: 'import.mesh', target: asset.id, params: { unitScale: 1, recenter: true } },
      { id: 'cutter', op: 'primitive.cuboid', params: { size: [10, 10, 10], center: [0, 0, 20] } },
      { id: 'cut', op: 'boolean.subtract', target: 'model', operands: ['cutter'] },
    ])
    const volume = measurements.measureVolume(/** @type {any} */ (byId.get('cut')))
    expect(volume).toBeCloseTo(8000 - 500, 3)
  })
})

describe('import.mesh — watertight round trip (io-004’s criterion)', () => {
  /**
   * Undirected edges of a written STL that are not used exactly twice, after welding it the
   * way the importer does.
   *
   * @param {Uint8Array} bytes
   */
  function openEdgesOfStl(bytes) {
    const parsed = parseStl(bytes)
    if (!parsed.ok) throw new Error(parsed.reason)
    const welded = weldMesh(parsed.positions, parsed.indices)
    if (!welded.ok) throw new Error(welded.reason)
    /** @type {Map<string, number>} */
    const uses = new Map()
    for (let triangle = 0; triangle < welded.triangleCount; triangle += 1) {
      for (let side = 0; side < 3; side += 1) {
        const a = welded.indices[triangle * 3 + side]
        const b = welded.indices[triangle * 3 + ((side + 1) % 3)]
        const key = a < b ? `${a}:${b}` : `${b}:${a}`
        uses.set(key, (uses.get(key) ?? 0) + 1)
      }
    }
    return [...uses.values()].filter((count) => count !== 2).length
  }

  it('an STL cube imports and exports with zero open edges', async () => {
    const solid = build(await cubeAsset(10, [3.3, -7.1, 66.93]))
    expect(openEdgesOf(makeWatertight(solid)).openEdges).toBe(0)
    const written = exportBodies([{ id: 'model', name: 'Cube', geometry: solid }], 'stl')
    expect(openEdgesOfStl(written.bytes)).toBe(0)
  })

  it('a sloppy cube — duplicate corners a hair apart — still exports watertight', async () => {
    const tolerance = Math.sqrt(300) * 1e-5
    const sloppy = cubeTriangles(10).map((triangle, index) =>
      // At most 2 × 0.2 × tolerance on each axis: √3 × 0.4 ≈ 0.69 × the weld radius apart.
      triangle.map((corner) => corner.map((value) => value + (index % 3) * 0.2 * tolerance))
    )
    const result = await importMeshBytes('sloppy.stl', binaryStl(/** @type {any} */ (sloppy)))
    if (!result.ok) throw new Error(result.reason)
    expect(result.vertexCount).toBe(8)
    const solid = build(result.record)
    const written = exportBodies([{ id: 'model', name: 'Cube', geometry: solid }], 'stl')
    expect(openEdgesOfStl(written.bytes)).toBe(0)
  })
})
