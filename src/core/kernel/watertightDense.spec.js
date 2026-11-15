// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A dense imported mesh with a cut in it must still export as a closed surface
 * (`TODO/FIND-io-031`).
 *
 * `io-004` and `io-005` measured the export repair on shapes under 500 triangles.
 * `FIND-testing-023` then cut a generated 32,320-triangle scan with a cube and found 27 open
 * edges in the STL, where every cutter wall met the scan. They were pairs of corners closer than
 * the serializer's weld radius on opposite sides of a snap-cell boundary, and faces folded onto
 * themselves where one corner sat on two of their sides. Neither showed at low density.
 *
 * Every case runs the path an imported file takes: `solidFromMesh` at 25.4 mm per file unit (the
 * scan is authored in inches), `booleans.subtract` against a placed cuboid, `exportBodies`,
 * and then a count of open edges **on the bytes**: an edge is closed only when exactly two
 * triangles share it, once each way, with corners keyed at 1e-5 mm. That is the strict reading
 * `e2e/export-ui.e2e.js` applies, at the resolution the finding measured.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { exportBodies } from '../export.js'
import { lumpyScan, denseBox } from './__fixtures__/denseMeshes.js'
import { solidFromMesh } from './recipes/importMesh.js'
import { makeWatertight, openEdgesOf } from './watertight.js'

const { booleans, geometries, measurements, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */

/** A 32,320-triangle boolean and export takes about a second on a laptop; allow for CI. */
const DENSE_TIMEOUT_MS = 60_000

/**
 * Open edges, triangles and volume of a binary STL, with corners keyed at `quantum` mm.
 *
 * @param {Uint8Array} bytes
 * @param {number} [quantum]
 * @returns {{ triangles: number, edges: number, open: number, collapsed: number, volume: number }}
 */
function stlStats(bytes, quantum = 1e-5) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const triangles = view.getUint32(80, true)
  expect(bytes.byteLength).toBe(84 + 50 * triangles)
  /** @param {number} x @param {number} y @param {number} z */
  const key = (x, y, z) => `${Math.round(x / quantum)},${Math.round(y / quantum)},${Math.round(z / quantum)}`
  /** @type {Map<string, { uses: number, net: number }>} */
  const edges = new Map()
  let collapsed = 0
  let volume = 0
  for (let index = 0; index < triangles; index += 1) {
    const base = 84 + 50 * index + 12
    const v = Array.from({ length: 9 }, (_, at) => view.getFloat32(base + 4 * at, true))
    volume += (v[0] * (v[4] * v[8] - v[5] * v[7]) - v[1] * (v[3] * v[8] - v[5] * v[6]) + v[2] * (v[3] * v[7] - v[4] * v[6])) / 6
    const ids = [key(v[0], v[1], v[2]), key(v[3], v[4], v[5]), key(v[6], v[7], v[8])]
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[2] === ids[0]) collapsed += 1
    for (let corner = 0; corner < 3; corner += 1) {
      const from = ids[corner]
      const to = ids[(corner + 1) % 3]
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
  return { triangles, edges: edges.size, open, collapsed, volume }
}

/**
 * Export one solid as STL and read it back.
 *
 * @param {Geom3} solid
 */
function exported(solid) {
  return stlStats(exportBodies([{ id: 'part', name: 'Part', geometry: solid }], 'stl').bytes)
}

/**
 * An imported mesh as the kernel builds it, then moved off the origin as a placement click
 * would leave it (an awkward, non-round offset, as `FIND-testing-023`'s was).
 *
 * @param {{ positions: Float32Array, indices: Uint32Array }} mesh
 * @param {number} unitScale
 * @returns {Geom3}
 */
function placed(mesh, unitScale) {
  const solid = solidFromMesh({ kind: 'mesh', positions: mesh.positions, indices: mesh.indices }, { unitScale, recenter: true, matrix: null })
  return transforms.translate([-24.37, 13.61, 0], solid)
}

/** @param {Geom3} solid @returns {[number, number, number]} */
function centreOf(solid) {
  const [min, max] = measurements.measureBoundingBox(solid)
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}

/**
 * The assertions every case shares: closed on the bytes, closed by the repo's own check, the
 * kernel's volume, and the bounding box the serializer's snap grid is derived from untouched.
 *
 * @param {Geom3} result
 */
function expectClosedExport(result) {
  const stats = exported(result)
  expect(stats.triangles).toBeGreaterThan(0)
  expect(stats.open, `open edges of ${stats.edges} at 1e-5 mm`).toBe(0)
  expect(stats.collapsed, 'triangles with two corners on one 1e-5 mm key').toBe(0)
  const kernelVolume = measurements.measureVolume(result)
  expect(Math.abs(stats.volume - kernelVolume) / kernelVolume).toBeLessThan(1e-5)

  const repaired = makeWatertight(result)
  expect(openEdgesOf(repaired).openEdges).toBe(0)
  // Fused corners move by less than the weld radius, so the volume moves by far less than that.
  expect(Math.abs(measurements.measureVolume(repaired) - kernelVolume) / kernelVolume).toBeLessThan(1e-5)
  // `measureEpsilon`, and so every cell of the serializer's grid, hangs on the box.
  expect(measurements.measureBoundingBox(repaired)).toEqual(measurements.measureBoundingBox(result))
  return stats
}

describe('makeWatertight on a cut dense scan (FIND-io-031)', () => {
  /** @type {Geom3} */
  let scan
  /** @type {[number, number, number]} */
  let centre
  /** @type {[number, number, number]} The north pole: the highest corner of the scan. */
  let pole

  beforeAll(() => {
    const mesh = lumpyScan({ lon: 160, lat: 102 })
    expect(mesh.triangleCount).toBe(32_320)
    scan = placed(mesh, 25.4)
    centre = centreOf(scan)
    pole = [0, 0, -Infinity]
    for (const polygon of geometries.geom3.toPolygons(scan)) {
      for (const vertex of polygon.vertices) if (vertex[2] > pole[2]) pole = [vertex[0], vertex[1], vertex[2]]
    }
  })

  it('the uncut scan is closed and comes back from the repair untouched', () => {
    // The control: what was imported is a closed, outward-wound 254 cm³ blob.
    expect(measurements.measureVolume(scan)).toBeCloseTo(254_281.7, 0)
    expect(openEdgesOf(scan).openEdges).toBe(0)
    expect(makeWatertight(scan)).toBe(scan)
    expect(exported(scan).open).toBe(0)
  }, DENSE_TIMEOUT_MS)

  it("FIND-testing-023's reproduction: a 25 × 25 × 75 mm cube subtracted through the middle", () => {
    // Before the fix: 23 open edges of 47,945 at 1e-5 mm (holes, doubled faces, four-face edges).
    const result = booleans.subtract(scan, primitives.cuboid({ size: [25, 25, 75], center: centre }))
    const stats = expectClosedExport(result)
    expect(stats.triangles).toBeGreaterThan(30_000)
    // The cube pokes out of the blob's top, so less than its 46,875 mm³ is removed (measured).
    expect(measurements.measureVolume(result)).toBeCloseTo(210_053.1, 0)
  }, DENSE_TIMEOUT_MS)

  it('a tilted cutter, whose edges cross thousands of scan triangles diagonally', () => {
    // Before the fix: 25 open edges.
    const cutter = transforms.translate(centre, transforms.rotateX(0.35, transforms.rotateZ(0.52, primitives.cuboid({ size: [25, 25, 75] }))))
    expectClosedExport(booleans.subtract(scan, cutter))
  }, DENSE_TIMEOUT_MS)

  it('a cutter through the skin, so its walls meet the scan along a long open curve', () => {
    // Before the fix: 6 open edges.
    const cutter = transforms.translate([centre[0] + 30, centre[1], centre[2]], transforms.rotateZ(0.52, primitives.cuboid({ size: [40, 40, 120] })))
    expectClosedExport(booleans.subtract(scan, cutter))
  }, DENSE_TIMEOUT_MS)

  it('a cutter around a pole, where 160 triangles meet in one corner', () => {
    expectClosedExport(booleans.subtract(scan, primitives.cuboid({ size: [25, 25, 20], center: pole })))
  }, DENSE_TIMEOUT_MS)

  it('a cutter whose top face touches the pole corner exactly', () => {
    expectClosedExport(booleans.subtract(scan, primitives.cuboid({ size: [25, 25, 20], center: [pole[0], pole[1], pole[2] - 10] })))
  }, DENSE_TIMEOUT_MS)

  it('a cutter whose side face runs through the pole corner exactly', () => {
    expectClosedExport(
      booleans.subtract(scan, primitives.cuboid({ size: [25, 25, 20], center: [pole[0] + 12.5, pole[1], pole[2] - 5] }))
    )
  }, DENSE_TIMEOUT_MS)
})

describe('makeWatertight on a cut dense box (FIND-io-031, coplanar faces)', () => {
  /** A 40 × 30 × 20 mm box meshed as a 40 × 40 grid per face: 19,200 triangles. */
  const box = () => placed(denseBox({ n: 40, size: [40, 30, 20] }), 1)

  it('a pocket whose open top is coplanar with the box top', () => {
    const solid = box()
    // The box spans z 0 to 20; the cutter's top face lies exactly on z = 20.
    const result = booleans.subtract(solid, primitives.cuboid({ size: [12, 9, 8], center: [-24.37 + 2.17, 13.61 + 1.3, 16] }))
    expectClosedExport(result)
    expect(measurements.measureVolume(result)).toBeCloseTo(40 * 30 * 20 - 12 * 9 * 8, 3)
  }, DENSE_TIMEOUT_MS)

  it('a notch whose side is coplanar with a box side', () => {
    const solid = box()
    // The box spans x −44.37 to −4.37; the cutter's +x face lies exactly on x = −4.37.
    const result = booleans.subtract(solid, primitives.cuboid({ size: [12, 9, 8], center: [-24.37 + 20 - 6, 13.61 + 1.3, 10] }))
    expectClosedExport(result)
    expect(measurements.measureVolume(result)).toBeCloseTo(40 * 30 * 20 - 12 * 9 * 8, 3)
  }, DENSE_TIMEOUT_MS)
})
