// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The export job's resolution override (`TODO/core-035`): when the export asks for a
 * different resolution than the design's, the job receives the document's **records**,
 * folds them itself at the export resolution, and then runs the unchanged
 * `solidsForExport` → `makeWatertight` → serialize path. The design is never touched.
 *
 * Plain Node, no `Worker`: `runExportJob` is exactly what the worker runs.
 */
import { afterEach, describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

// The user's saved project from the TODO/core-051 report, as text.
import chamferErrorProject from '../../examples/chamfer error.ndjson?raw'

import { createDocument } from './document.js'
import { ExportError } from './export.js'
import { refoldRequestOf, runExportJob } from './exportJob.js'
import { packBodies, unpackSolids } from './kernel/transport.js'
import { recordsForDrop } from './library.js'
import { resetUserParts, setLibraryParts } from './userPart.js'

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

  // TODO/sketch-001: a sketch body is a primitive like any other, so it must export as a
  // closed solid by every extrusion method — ACCEPTANCE scenario 11 at the unit level.
  it.each([
    ['linear', [{ id: 's1', zMm: 0, profiles: [{ id: 'a', kind: 'circle', role: 'solid', centerMm: [0, 0], radiusMm: 20 }, { id: 'b', kind: 'circle', role: 'hole', centerMm: [0, 0], radiusMm: 15 }] }], { method: 'linear', heightMm: 30, twistDeg: 0, twistSteps: 1 }],
    ['revolve', [{ id: 's1', zMm: 0, profiles: [{ id: 'a', kind: 'rect', role: 'solid', centerMm: [15, 5], widthMm: 10, heightMm: 10 }] }], { method: 'revolve', angleDeg: 360, startAngleDeg: 0, segments: 48 }],
    ['helical', [{ id: 's1', zMm: 0, profiles: [{ id: 'a', kind: 'circle', role: 'solid', centerMm: [10, 0], radiusMm: 2 }] }], { method: 'helical', pitchMm: 8, turns: 2, endOffsetMm: 0, segmentsPerTurn: 24 }],
    ['outline', [{ id: 's1', zMm: 0, profiles: [{ id: 'a', kind: 'rect', role: 'solid', centerMm: [0, 0], widthMm: 40, heightMm: 30 }] }], { method: 'outline', wallMm: 2, heightMm: 10 }],
    ['loft', [{ id: 's1', zMm: 0, profiles: [{ id: 'a', kind: 'circle', role: 'solid', centerMm: [0, 0], radiusMm: 30 }] }, { id: 's2', zMm: 60, profiles: [{ id: 'b', kind: 'rect', role: 'solid', centerMm: [0, 0], widthMm: 30, heightMm: 20 }] }, { id: 's3', zMm: 120, profiles: [{ id: 'c', kind: 'circle', role: 'solid', centerMm: [0, 0], radiusMm: 8 }] }], { method: 'loft', resolution: 0 }],
  ])('a %s sketch body has 0 open edges', (_method, slices, extrusion) => {
    const triangles = printStl((document) => {
      document.append({ id: 'sketch-1', op: 'primitive.sketch', name: 'Sketch 1', params: { center: [12.5, -3, 0], slices, extrusion } }, local)
    })
    expect(triangles.length).toBeGreaterThan(0)
    expect(openEdges(triangles)).toBe(0)
  })
})

// TODO/io-006: a rim op on a rim whose edges are *not* axis-aligned. io-004/io-005 only
// measured square rims; a hexagon's four off-axis corners came out of the fillet and the
// chamfer as four sliver holes (12 open edges), because the section the loft starts from
// drifted ~1e-4 mm off the solid's own corners there.
describe('runExportJob — a rim op on a hexagon is watertight (io-006)', () => {
  /** @param {any} document */
  const hexagon = (document) =>
    document.append({ id: 'hex', op: 'primitive.hexagon', name: 'Hexagon 1', params: { diameter: 50, height: 20 } }, local)
  /** @param {any} document */
  const sketchHexagon = (document) =>
    document.append(
      {
        id: 'hex',
        op: 'primitive.sketch',
        name: 'Sketch 1',
        params: {
          center: [0, 0, 0],
          slices: [{ id: 's1', zMm: 0, profiles: [{ id: 'p', kind: 'polygon', role: 'solid', centerMm: [0, 0], radiusMm: 25, sides: 6, rotationDeg: 0 }] }],
          extrusion: { method: 'linear', heightMm: 20, twistDeg: 0, twistSteps: 1 },
        },
      },
      local
    )

  /** @param {any} document */
  const cylinder = (document) =>
    document.append({ id: 'hex', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 40, height: 20, center: [-100.89, 66.93, 25] } }, local)

  /**
   * @param {(document: any) => void} base
   * @param {'modify.filletRim' | 'modify.chamferRim'} op
   * @param {'normal' | 'print'} resolution
   */
  function stl(base, op, resolution) {
    const document = createDocument({ resolution: 'normal' })
    base(document)
    document.append({ id: 'rim', op, target: 'hex', supersedes: 'hex', params: { radius: 2, orientation: 'z+' } }, local)
    const result =
      resolution === 'normal' ? runExportJob({ format: 'stl', bodies: packBodies(document.bodies()) }) : refoldJob(document, 'stl', resolution)
    return stlTriangles(/** @type {Uint8Array} */ (result.bytes))
  }

  it.each([
    ['primitive.hexagon', 'modify.filletRim', 'normal', hexagon],
    ['primitive.hexagon', 'modify.filletRim', 'print', hexagon],
    ['primitive.hexagon', 'modify.chamferRim', 'normal', hexagon],
    ['primitive.hexagon', 'modify.chamferRim', 'print', hexagon],
    ['a sketch polygon', 'modify.filletRim', 'normal', sketchHexagon],
    ['a sketch polygon', 'modify.filletRim', 'print', sketchHexagon],
    ['a sketch polygon', 'modify.chamferRim', 'normal', sketchHexagon],
    ['a sketch polygon', 'modify.chamferRim', 'print', sketchHexagon],
    // Same drift on every off-axis corner, so a cylinder's rim leaked too (32 open edges
    // at normal, 119 at print, before the fix) — measured while fixing io-006.
    ['an off-origin primitive.cylinder', 'modify.filletRim', 'normal', cylinder],
    ['an off-origin primitive.cylinder', 'modify.filletRim', 'print', cylinder],
    ['an off-origin primitive.cylinder', 'modify.chamferRim', 'print', cylinder],
  ])('%s + %s has 0 open edges at %s', (_name, op, resolution, base) => {
    const triangles = stl(base, /** @type {any} */ (op), /** @type {any} */ (resolution))
    expect(triangles.length).toBeGreaterThan(20)
    expect(openEdges(triangles)).toBe(0)
  })
})

// TODO/core-051: a rim op on a face with a hole. The sweep now lofts each contour of the
// section against its own inset, so the seam structure where the loft meets the remainder
// changed for every holed face — it must not open edges, at the design resolution or at
// Print. The plate is the user's own saved project, through the real sketch primitive.
describe('runExportJob — a rim op on a face with a hole is watertight (core-051)', () => {
  /** @returns {any[]} The fixture's records, in file order, without its state line. */
  function fixtureRecords() {
    return chamferErrorProject
      .split('\n')
      .filter((/** @type {string} */ line) => line.trim() !== '')
      .map((/** @type {string} */ line) => JSON.parse(line))
      .filter((/** @type {any} */ record) => typeof record.op === 'string')
  }

  /**
   * @param {'modify.filletRim' | 'modify.chamferRim'} op
   * @param {number} radius
   * @param {'normal' | 'print'} resolution
   */
  function stl(op, radius, resolution) {
    const document = createDocument({ resolution: 'normal' })
    const [sketch, rim] = fixtureRecords()
    document.append(sketch, local)
    document.append({ ...rim, op, params: { ...rim.params, radius } }, local)
    const result =
      resolution === 'normal' ? runExportJob({ format: 'stl', bodies: packBodies(document.bodies()) }) : refoldJob(document, 'stl', resolution)
    return stlTriangles(/** @type {Uint8Array} */ (result.bytes))
  }

  it.each([
    // The report's own row: chamfer 5 on z+, as saved.
    ['modify.chamferRim', 5, 'normal'],
    ['modify.chamferRim', 5, 'print'],
    ['modify.chamferRim', 2, 'normal'],
    ['modify.filletRim', 2, 'normal'],
    ['modify.filletRim', 2, 'print'],
  ])('the user\'s holed plate + %s r=%d has 0 open edges at %s', (op, radius, resolution) => {
    const triangles = stl(/** @type {any} */ (op), /** @type {number} */ (radius), /** @type {any} */ (resolution))
    expect(triangles.length).toBeGreaterThan(20)
    expect(openEdges(triangles)).toBe(0)
  })
})

describe('a re-fold carries the project\'s user parts to the worker (TODO/core-037)', () => {
  afterEach(() => {
    resetUserParts()
  })

  it('exports a placed user part at another resolution from a registry that has never seen it', () => {
    setLibraryParts([
      {
        op: 'user.peg',
        name: 'Peg',
        version: 1,
        result: 'r1',
        records: [{ id: 'r1', op: 'primitive.cylinder', params: { height: 10, diameter: 4 } }],
        params: [],
      },
    ])
    const document = createDocument({ publishesUserParts: true, resolution: 'normal' })
    document.appendAll(recordsForDrop('user.peg', { x: 0, y: 0 }, document), { origin: 'local' })
    const request = refoldRequestOf(document, 'fine', [])
    expect(request.userParts?.map((part) => part.op)).toEqual(['user.peg'])
    // What the export worker has: a fresh module instance, no layers registered at all.
    resetUserParts()
    const result = runExportJob({ format: 'stl', bodies: [], refold: request })
    expect(result).not.toHaveProperty('error')
  })
})

describe('a re-fold carries the per-row Leave-broken flag to the worker (TODO/core-053)', () => {
  /**
   * A design whose second row names an op no registry knows — the user left it broken
   * (`TODO/ui-052`), so the app folds it as skipped and shows the first body.
   *
   * @param {{ suppressed?: boolean }} [extra]
   */
  function withLeftBrokenRow(extra = {}) {
    const document = createDocument({ resolution: 'normal' })
    document.loadEntries(
      [
        {
          record: { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40] } },
          origin: 'local',
        },
        {
          record: { id: 'gone-1', op: 'user.vanished', name: 'Vanished', params: {} },
          origin: 'local',
          leftBroken: true,
          ...extra,
        },
      ],
      null,
      'normal',
      {}
    )
    return document
  }

  it('copies leftBroken onto the request and the worker folds the row as skipped', () => {
    const request = refoldRequestOf(withLeftBrokenRow(), 'fine', [])
    expect(request.entries[1].leftBroken).toBe(true)
    expect(request.entries[0].leftBroken).toBeUndefined()
    const result = runExportJob({ format: 'stl', bodies: [], refold: request })
    expect(result).not.toHaveProperty('error')
  })

  it('keeps leftBroken and suppressed independent when both are set', () => {
    const request = refoldRequestOf(withLeftBrokenRow({ suppressed: true }), 'fine', [])
    expect(request.entries[1].leftBroken).toBe(true)
    expect(request.entries[1].suppressed).toBe(true)
    expect(() => runExportJob({ format: 'stl', bodies: [], refold: request })).not.toThrow()
  })
})
