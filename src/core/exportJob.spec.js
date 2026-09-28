/**
 * The export job's resolution override (`TODO/core-035`): when the export asks for a
 * different resolution than the design's, the job receives the document's **records**,
 * folds them itself at the export resolution, and then runs the unchanged
 * `solidsForExport` → `makeWatertight` → serialize path. The design is never touched.
 *
 * Plain Node, no `Worker`: `runExportJob` is exactly what the worker runs.
 */
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { createDocument } from './document.js'
import { ExportError } from './export.js'
import { refoldRequestOf, runExportJob } from './exportJob.js'
import { packBodies, unpackSolids } from './kernel/transport.js'

const { geometries } = modeling

const local = { origin: 'local' }

/**
 * A binary STL read by its fixed layout — independent of the serializer, as in
 * `export.spec.js`.
 *
 * @param {Uint8Array} bytes
 * @returns {number[][][]}
 */
function stlTriangles(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(80, true)
  expect(bytes.byteLength).toBe(84 + 50 * count)
  const triangles = []
  for (let index = 0; index < count; index += 1) {
    const base = 84 + 50 * index
    const triangle = []
    for (let vertex = 0; vertex < 3; vertex += 1) {
      triangle.push([0, 4, 8].map((offset) => view.getFloat32(base + 12 + vertex * 12 + offset, true)))
    }
    triangles.push(triangle)
  }
  return triangles
}

/**
 * Undirected edges not used by exactly two triangles, once each way — the stricter of
 * `export.spec.js`'s two readings, and the one a slicer applies.
 *
 * @param {number[][][]} triangles
 * @returns {number}
 */
function openEdges(triangles) {
  /** @param {number[]} vertex */
  const key = (vertex) => vertex.map((value) => Math.round(value * 1000)).join(',')
  /** @type {Map<string, { uses: number, net: number }>} */
  const edges = new Map()
  for (const triangle of triangles) {
    const ids = triangle.map(key)
    for (let index = 0; index < 3; index += 1) {
      const from = ids[index]
      const to = ids[(index + 1) % 3]
      if (from === to) continue
      const forward = from < to
      const edge = forward ? `${from}|${to}` : `${to}|${from}`
      const entry = edges.get(edge) ?? { uses: 0, net: 0 }
      entry.uses += 1
      entry.net += forward ? 1 : -1
      edges.set(edge, entry)
    }
  }
  let open = 0
  for (const { uses, net } of edges.values()) if (uses !== 2 || net !== 0) open += 1
  return open
}

/** A normal-resolution design: a 40 mm cube and a Ø50 cylinder, separate bodies. */
function design() {
  const document = createDocument({ resolution: 'normal' })
  document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40] } }, local)
  document.append(
    { id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 50, height: 20, center: [80, 0, 0] } },
    local
  )
  return document
}

/**
 * @param {any} document
 * @param {'stl' | 'obj' | 'glb'} format
 * @param {string} resolution
 * @param {string[]} [ids]
 */
function refoldJob(document, format, resolution, ids = []) {
  return runExportJob({ format, bodies: [], refold: refoldRequestOf(document, resolution, ids) })
}

describe('runExportJob — the resolution override re-folds the records', () => {
  it('a Print override writes more triangles than the design resolution', () => {
    const document = design()
    const atDesign = runExportJob({ format: 'stl', bodies: packBodies(document.bodies()) })
    const atPrint = refoldJob(document, 'stl', 'print')
    expect(atPrint.kind).toBe('bytes')
    expect(/** @type {number} */ (atPrint.triangleCount)).toBeGreaterThan(/** @type {number} */ (atDesign.triangleCount))
    expect(stlTriangles(/** @type {Uint8Array} */ (atPrint.bytes)).length).toBe(atPrint.triangleCount)
  })

  it('a Draft override writes fewer', () => {
    const document = design()
    const atDesign = runExportJob({ format: 'stl', bodies: packBodies(document.bodies()) })
    const atDraft = refoldJob(document, 'stl', 'draft')
    expect(/** @type {number} */ (atDraft.triangleCount)).toBeLessThan(/** @type {number} */ (atDesign.triangleCount))
  })

  it('the same resolution as the design gives the identical file', () => {
    const document = design()
    const atDesign = runExportJob({ format: 'stl', bodies: packBodies(document.bodies()) })
    const refolded = refoldJob(document, 'stl', 'normal')
    expect(refolded.bytes).toEqual(atDesign.bytes)
  })

  it('leaves the design document untouched', () => {
    const document = design()
    const before = JSON.stringify(document.entries)
    const geometry = document.bodies().map((body) => body.geometry)
    const version = document.version
    refoldJob(document, 'stl', 'print')
    expect(JSON.stringify(document.entries)).toBe(before)
    expect(document.resolution()).toBe('normal')
    expect(document.version).toBe(version)
    document.bodies().forEach((body, index) => expect(body.geometry).toBe(geometry[index]))
  })

  it('the request is plain, structured-cloneable data — records, not geometry', () => {
    const request = refoldRequestOf(design(), 'print', [])
    expect(structuredClone(request)).toEqual(request)
    expect(JSON.parse(JSON.stringify(request))).toEqual(request)
  })

  it('honours the selection scope, by body id', () => {
    const result = refoldJob(design(), 'stl', 'print', ['cyl-1'])
    expect(result.filename).toBe('cylinder-1.stl')
  })

  it('exports the active state only while rolled back', () => {
    const document = design()
    document.rollBackTo('cube-1', local)
    const result = refoldJob(document, 'stl', 'print')
    expect(result.filename).toBe('cube-1.stl')
  })

  it('refuses, by name, a selection that no longer names anything', () => {
    let caught
    try {
      refoldJob(design(), 'stl', 'print', ['gone'])
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ExportError)
  })
})

describe('runExportJob — watertight at Print (io-004 / io-005 re-run at the finest preset)', () => {
  /** @param {(document: any) => void} build */
  function printStl(build) {
    const document = createDocument({ resolution: 'normal' })
    build(document)
    const result = refoldJob(document, 'stl', 'print')
    return stlTriangles(/** @type {Uint8Array} */ (result.bytes))
  }

  it('a cube minus a Ø6 bore has 0 open edges', () => {
    const triangles = printStl((document) => {
      document.append({ id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20] } }, local)
      document.append({ id: 'bore', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 6, height: 30 } }, local)
      document.append(
        { id: 'sub', op: 'boolean.subtract', name: 'Subtract 1', target: 'cube', operands: ['bore'], consumes: ['cube', 'bore'] },
        local
      )
    })
    expect(triangles.length).toBeGreaterThan(0)
    expect(openEdges(triangles)).toBe(0)
  })

  it('a sphere ∪ cube has 0 open edges', () => {
    const triangles = printStl((document) => {
      document.append({ id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [30, 30, 30] } }, local)
      document.append({ id: 'ball', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 34, center: [10, 10, 10] } }, local)
      document.append(
        { id: 'u', op: 'boolean.union', name: 'Union 1', operands: ['cube', 'ball'], consumes: ['cube', 'ball'] },
        local
      )
    })
    expect(openEdges(triangles)).toBe(0)
  })

  it("io-004's two reproductions (the off-origin union and an m10 bolt) have 0 open edges", () => {
    const triangles = printStl((document) => {
      document.append(
        { id: 'cyl', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 40, height: 50, center: [-100.89, 66.93, 25] } },
        local
      )
      document.append({ id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40], center: [-95, 75, 20] } }, local)
      document.append({ id: 'u', op: 'boolean.union', name: 'Union 1', operands: ['cyl', 'cube'], consumes: ['cyl', 'cube'] }, local)
      document.append({ id: 'bolt', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 30 } }, local)
    })
    expect(openEdges(triangles)).toBe(0)
  })

  it("io-005: the .glb's repaired solids are closed at Print too", () => {
    const document = createDocument({ resolution: 'normal' })
    document.append(
      { id: 'cyl', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 40, height: 50, center: [-100.89, 66.93, 25] } },
      local
    )
    document.append({ id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40], center: [-95, 75, 20] } }, local)
    document.append({ id: 'u', op: 'boolean.union', name: 'Union 1', operands: ['cyl', 'cube'], consumes: ['cyl', 'cube'] }, local)
    const result = refoldJob(document, 'glb', 'print')
    expect(result.kind).toBe('solids')
    const solids = unpackSolids(result.solids ?? [])
    expect(solids).toHaveLength(1)
    // Fan-triangulated exactly as the render mesh (`geom3ToBufferGeometry`) does it.
    const triangles = geometries.geom3
      .toPolygons(solids[0].solid)
      .flatMap((polygon) =>
        polygon.vertices.slice(2).map((vertex, index) => [polygon.vertices[0], polygon.vertices[index + 1], vertex].map((v) => Array.from(v)))
      )
    expect(openEdges(triangles)).toBe(0)
  })
})
