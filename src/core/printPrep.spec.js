// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { ExportError } from './export.js'
import { runPrintPiecesJob } from './exportJob.js'
import { boundsOf, volumeOf } from './kernel/group.js'
import { splitWithJoint } from './kernel/split.js'
import { packBodies } from './kernel/transport.js'
import { bodyFit, exportPrintPieces, layFlat, printPiecesOf } from './printPrep.js'
import { DEFAULT_BUILD_VOLUME } from './buildVolume.js'
import { readZip } from './zip.js'

const { geometries, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */

/** The two-part wing `TODO/io-007`'s documentation example ends with. */
function splitWing() {
  const wing = primitives.cuboid({ size: [300, 40, 12], center: [150, 0, 6] })
  return splitWithJoint(wing, { axis: 'x', offsetMm: 150, joint: 'tongue', clearanceMm: 0.2, names: ['Wing A', 'Wing B'] })
}

/**
 * Parse a binary STL by hand (shares nothing with the serializer) and count edges that are
 * not used exactly twice in opposite directions — 0 is a closed, consistently wound mesh.
 *
 * @param {Uint8Array} bytes
 */
function stlStats(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(80, true)
  expect(bytes.byteLength).toBe(84 + 50 * count)
  const key = (/** @type {number[]} */ v) => v.map((n) => Math.round(n * 1000)).join(',')
  /** @type {Map<string, { uses: number, net: number }>} */
  const edges = new Map()
  let minZ = Infinity
  for (let i = 0; i < count; i += 1) {
    const at = 84 + 50 * i + 12
    const corners = [0, 1, 2].map((c) => [0, 1, 2].map((k) => view.getFloat32(at + 12 * c + 4 * k, true)))
    for (const corner of corners) minZ = Math.min(minZ, corner[2])
    for (let e = 0; e < 3; e += 1) {
      const a = key(corners[e])
      const b = key(corners[(e + 1) % 3])
      if (a === b) continue
      const forward = a < b
      const id = forward ? `${a}|${b}` : `${b}|${a}`
      const entry = edges.get(id) ?? { uses: 0, net: 0 }
      entry.uses += 1
      entry.net += forward ? 1 : -1
      edges.set(id, entry)
    }
  }
  let unmatched = 0
  for (const { uses, net } of edges.values()) if (uses !== 2 || net !== 0) unmatched += 1
  return { triangles: count, unmatched, minZ }
}

describe('printPiecesOf — one piece per top-level group part', () => {
  it('a split body is its two named parts; a plain body is itself', () => {
    const pieces = printPiecesOf({ id: 'wing', name: 'Wing', geometry: splitWing() })
    expect(pieces.map((piece) => piece.name)).toEqual(['Wing A', 'Wing B'])
    const cube = printPiecesOf({ id: 'cube', name: 'Cube 1', geometry: primitives.cuboid({ size: [10, 10, 10] }) })
    expect(cube.map((piece) => piece.name)).toEqual(['Cube 1'])
  })
})

describe('bodyFit — the Inspector’s verdict, judged per print piece', () => {
  it('turns from "too large" to "fits" once the body is split into pieces that each fit', () => {
    const whole = bodyFit({ id: 'w', name: 'Wing', geometry: primitives.cuboid({ size: [300, 40, 12] }) }, DEFAULT_BUILD_VOLUME)
    expect(whole.verdict).toBe('too-large')
    expect(whole.label).toBe('too large by 50 mm')
    const split = bodyFit({ id: 'w', name: 'Wing', geometry: splitWing() }, DEFAULT_BUILD_VOLUME)
    expect(split.verdict).toBe('fits')
    expect(split.pieces.map((piece) => piece.name)).toEqual(['Wing A', 'Wing B'])
  })
})

describe('layFlat — the print orientation', () => {
  it('lays a tall plate down on its largest flat face, at the origin, bottom on z = 0', () => {
    // 4 × 60 × 100 standing on its 4 × 60 end: the largest face is 60 × 100.
    const plate = primitives.cuboid({ size: [4, 60, 100], center: [50, 50, 50] })
    const { solid, mayNeedSupports } = layFlat(plate)
    const [min, max] = boundsOf(solid)
    expect(max[2] - min[2]).toBeCloseTo(4, 6)
    expect(min[2]).toBeCloseTo(0, 6)
    expect((min[0] + max[0]) / 2).toBeCloseTo(0, 6)
    expect((min[1] + max[1]) / 2).toBeCloseTo(0, 6)
    expect(volumeOf(solid)).toBeCloseTo(volumeOf(plate), 3)
    expect(mayNeedSupports).toBe(false)
  })

  it('only a face the body can actually rest on counts — never a face inside a recess', () => {
    // A T on its side: the stem's faces are large but cannot touch a bed with the bar in the way.
    const bar = primitives.cuboid({ size: [100, 10, 10], center: [0, 0, 5] })
    const stem = primitives.cuboid({ size: [10, 10, 80], center: [0, 0, 50] })
    const t = modeling.booleans.union(bar, stem)
    const { solid } = layFlat(t)
    const [min] = boundsOf(solid)
    expect(min[2]).toBeCloseTo(0, 6)
    expect(volumeOf(solid)).toBeCloseTo(volumeOf(t), 2)
  })

  it('an overhang facing the bed is flagged as "may need supports" — a heuristic', () => {
    // A mushroom: a wide cap on a thin stalk — the cap's underside faces down, off the bed.
    const stalk = primitives.cuboid({ size: [10, 10, 40], center: [0, 0, 20] })
    const cap = primitives.cuboid({ size: [60, 60, 6], center: [0, 0, 43] })
    const mushroom = transforms.translate([0, 0, 0], modeling.booleans.union(stalk, cap))
    // The cap's 60 × 60 top is the largest face, so it is laid cap-down: no overhang then.
    expect(layFlat(mushroom).mayNeedSupports).toBe(false)
    // An L-shaped bridge has a real downward face above the bed whichever big face is down.
    const left = primitives.cuboid({ size: [10, 10, 40], center: [-25, 0, 20] })
    const right = primitives.cuboid({ size: [10, 10, 40], center: [25, 0, 20] })
    const span = primitives.cuboid({ size: [60, 10, 10], center: [0, 0, 45] })
    const bridge = modeling.booleans.union(left, right, span)
    expect(layFlat(bridge, { bedFace: 'as-placed' }).mayNeedSupports).toBe(true)
  })
})

describe('exportPrintPieces — a zip of one STL per piece', () => {
  it('writes wing-a.stl and wing-b.stl, each a closed manifold lying on z = 0', () => {
    const result = exportPrintPieces([{ id: 'wing', name: 'Wing', geometry: splitWing() }])
    expect(result.filename).toBe('wing-print-pieces.zip')
    expect(result.mimeType).toBe('application/zip')
    expect(result.files.map((file) => file.filename)).toEqual(['wing-a.stl', 'wing-b.stl'])
    const entries = readZip(result.bytes)
    expect(entries.map((entry) => entry.name)).toEqual(['wing-a.stl', 'wing-b.stl'])
    for (const [index, entry] of entries.entries()) {
      expect(entry.bytes.byteLength).toBe(result.files[index].sizeBytes)
      const stats = stlStats(entry.bytes)
      expect(stats.triangles).toBeGreaterThan(0)
      expect(stats.unmatched).toBe(0)
      expect(stats.minZ).toBeCloseTo(0, 3)
    }
  })

  it('two bodies with the same name never overwrite each other in the zip', () => {
    const cube = () => primitives.cuboid({ size: [10, 10, 10] })
    const result = exportPrintPieces([
      { id: 'a', name: 'Cube', geometry: cube() },
      { id: 'b', name: 'Cube', geometry: cube() },
    ])
    expect(result.filename).toBe('warpcad-print-pieces.zip')
    expect(result.files.map((file) => file.filename)).toEqual(['cube.stl', 'cube-2.stl'])
  })

  it('a non-watertight piece is refused by name — never silently exported', () => {
    const closed = geometries.geom3.toPolygons(primitives.cuboid({ size: [10, 10, 10] }))
    const open = geometries.geom3.create(closed.slice(1))
    expect(() => exportPrintPieces([{ id: 'box', name: 'Open box', geometry: open }])).toThrow(ExportError)
    expect(() => exportPrintPieces([{ id: 'box', name: 'Open box', geometry: open }])).toThrow(/"Open box".*not watertight/)
  })

  it('nothing to export is refused, not an empty zip', () => {
    expect(() => exportPrintPieces([])).toThrow(/Nothing to export/)
  })

  it('runs unchanged from packed geometry — the export worker’s path', () => {
    const job = runPrintPiecesJob({ bodies: packBodies([{ id: 'wing', name: 'Wing', geometry: splitWing() }]) })
    expect(job.kind).toBe('zip')
    expect(job.filename).toBe('wing-print-pieces.zip')
    expect(job.files.map((file) => file.filename)).toEqual(['wing-a.stl', 'wing-b.stl'])
    expect(readZip(job.bytes)).toHaveLength(2)
  })
})

describe('print prep for split keys (TODO/core-075 stage 1)', () => {
  /** A 300 × 120 × 10 mm plank split at 150 mm with printed or bought dowels. */
  const plankSplit = (/** @type {Record<string, any>} */ extra = {}) =>
    splitWithJoint(primitives.cuboid({ size: [300, 120, 10], center: [150, 0, 5] }), {
      axis: 'x',
      offsetMm: 150,
      joint: 'dowel',
      clearanceMm: 0.2,
      names: ['Plank A', 'Plank B'],
      ...extra,
    })

  it('layFlat with a bed normal lays a dowel on its D-flat: its axis horizontal, the flat on z = 0', () => {
    const group = /** @type {any} */ (plankSplit())
    const key = group.names.find((/** @type {string} */ name) => name === 'Plank key 1')
    const meta = group.meta[key]
    const { solid, bedFaceAreaMm2 } = layFlat(group.parts[key], { bedNormal: meta.bedNormal })
    const [min, max] = boundsOf(solid)
    const size = [0, 1, 2].map((i) => max[i] - min[i])
    const diameter = meta.sizeMm
    // Lying down: the long side is in the XY plane, and it stands its diameter less the flat.
    expect(Math.max(size[0], size[1])).toBeGreaterThan(2 * diameter)
    expect(size[2]).toBeCloseTo(diameter - diameter / 5, 1)
    expect(min[2]).toBeCloseTo(0, 6)
    expect(bedFaceAreaMm2).toBeGreaterThan(0)
  })

  it('the D-flat is the dowel’s largest flat face, so even layFlat without a normal lays it down', () => {
    const group = /** @type {any} */ (plankSplit())
    const { solid } = layFlat(group.parts['Plank key 1'])
    const [min, max] = boundsOf(solid)
    expect(max[2] - min[2]).toBeLessThan(group.meta['Plank key 1'].sizeMm)
  })

  it('a bed normal the solid has no face for falls back to the largest flat face', () => {
    const plate = primitives.cuboid({ size: [4, 60, 100], center: [50, 50, 50] })
    const { solid } = layFlat(plate, { bedNormal: [0.6, 0.8, 0] })
    const [min, max] = boundsOf(solid)
    expect(max[2] - min[2]).toBeCloseTo(4, 6)
  })

  it('Print pieces writes one STL per distinct key with the count in its name, and assembly.txt', () => {
    const group = /** @type {any} */ (plankSplit())
    const keys = group.names.filter((/** @type {string} */ name) => group.meta?.[name]?.role === 'key')
    const result = exportPrintPieces([{ id: 'plank', name: 'Plank', geometry: group }])
    const names = result.files.map((file) => file.filename)
    expect(names).toEqual(['plank-a.stl', 'plank-b.stl', `plank-dowel-x${keys.length}.stl`, 'assembly.txt'])
    const entries = readZip(result.bytes)
    expect(entries.map((entry) => entry.name)).toEqual(names)
    const keyStl = stlStats(entries[2].bytes)
    expect(keyStl.unmatched).toBe(0)
    expect(keyStl.minZ).toBeCloseTo(0, 3)
    const text = new TextDecoder().decode(entries[3].bytes)
    expect(text).toContain('plank-a.stl')
    expect(text).toContain('plank-b.stl')
    expect(text).toMatch(new RegExp(`plank-dowel-x${keys.length}\\.stl.*print ${keys.length}`))
    expect(text).toMatch(/flat side down/)
    expect(text).toMatch(/Plank A.*Plank B.*along X/s)
    expect(text).toMatch(/Nothing to buy/)
    expect(result.files[3]).toMatchObject({ filename: 'assembly.txt', sizeBytes: entries[3].bytes.byteLength })
  })

  it('bought steel dowels: no key file, and assembly.txt lists what to buy', () => {
    const group = plankSplit({ jointOptions: { stock: 'steel' } })
    const result = exportPrintPieces([{ id: 'plank', name: 'Plank', geometry: group }])
    expect(result.files.map((file) => file.filename)).toEqual(['plank-a.stl', 'plank-b.stl', 'assembly.txt'])
    const text = new TextDecoder().decode(readZip(result.bytes)[2].bytes)
    expect(text).toMatch(/Hardware to buy:\n\s+\d+ × steel dowel pin Ø\d+ × \d+ mm/)
  })

  it('runs unchanged from packed geometry: the key metadata crosses the worker boundary', () => {
    const job = runPrintPiecesJob({ bodies: packBodies([{ id: 'plank', name: 'Plank', geometry: plankSplit() }]) })
    expect(job.kind).toBe('zip')
    expect(/** @type {any} */ (job).files.map((/** @type {any} */ file) => file.filename)).toContain('assembly.txt')
  })

  it('a split with no keys and no hardware writes no assembly.txt — today’s zip, unchanged', () => {
    const result = exportPrintPieces([{ id: 'wing', name: 'Wing', geometry: splitWing() }])
    expect(result.files.map((file) => file.filename)).toEqual(['wing-a.stl', 'wing-b.stl'])
  })
})

describe('print prep for butterfly keys (TODO/core-075 stage 2)', () => {
  /** The docs' "Try it": a 300 × 120 × 10 mm plank split at 150 mm with two butterfly keys on top. */
  const plankButterflies = () =>
    splitWithJoint(primitives.cuboid({ size: [300, 120, 10], center: [150, 0, 5] }), {
      axis: 'x',
      offsetMm: 150,
      joint: 'butterfly',
      jointOptions: { side: 'v+', depthMm: 5 },
      clearanceMm: 0.2,
      names: ['Plank A', 'Plank B'],
    })

  it('one STL for the two identical keys, named with the count, laid on its floor; and assembly.txt says how they go in', () => {
    const result = exportPrintPieces([{ id: 'plank', name: 'Plank', geometry: plankButterflies() }])
    const names = result.files.map((file) => file.filename)
    expect(names).toEqual(['plank-a.stl', 'plank-b.stl', 'plank-butterfly-key-x2.stl', 'assembly.txt'])
    expect(result.files[2]).toMatchObject({ role: 'key', count: 2 })
    const entries = readZip(result.bytes)
    const keyStl = stlStats(entries[2].bytes)
    expect(keyStl.unmatched).toBe(0)
    expect(keyStl.minZ).toBeCloseTo(0, 3)
    const text = new TextDecoder().decode(entries[3].bytes)
    expect(text).toMatch(/plank-butterfly-key-x2\.stl: print 2 × Butterfly key 40 × 20 × 5 mm, flat side down/)
    expect(text).toMatch(/Plank A and Plank B, along X: push Plank B against Plank A along X until the cut faces meet, then press Plank key 1, Plank key 2 into the pockets across the seam from the top/)
    expect(text).toMatch(/Nothing to buy/)
  })

  it('keys on the bottom are pressed in from the bottom', () => {
    const group = splitWithJoint(primitives.cuboid({ size: [300, 120, 10], center: [150, 0, 5] }), {
      axis: 'x',
      offsetMm: 150,
      joint: 'butterfly',
      jointOptions: { side: 'v-', depthMm: 4 },
      clearanceMm: 0.2,
      names: ['Plank A', 'Plank B'],
    })
    const result = exportPrintPieces([{ id: 'plank', name: 'Plank', geometry: group }])
    const text = new TextDecoder().decode(readZip(result.bytes).at(-1)?.bytes)
    expect(text).toMatch(/into the pockets across the seam from the bottom/)
  })
})
