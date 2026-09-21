/**
 * Output-equivalence harness for `makeWatertight` (`TODO/perf-001`).
 *
 * A faster repair that stops finding a T-junction is a regression, not an optimisation.
 * `src/core/export.spec.js`'s `io-004` block and `src/render/export.spec.js`'s `io-005`
 * block assert the *property* (0 open edges, volume, bounds); this harness asserts the
 * much stricter thing those cannot: that the optimised repair produces **exactly the
 * same output**, vertex for vertex and byte for byte, as the implementation before it.
 *
 * It snapshots, per shape:
 * - the repaired solid's polygon count, total vertex count, and a SHA-256 over every
 *   vertex coordinate in order — i.e. the precise set and ordering of inserted vertices;
 * - SHA-256 of the whole written STL, OBJ and GLB file.
 *
 * Usage:
 *   node bench/watertight-equivalence.mjs --out before.json
 *   node bench/watertight-equivalence.mjs --out after.json --compare before.json
 *
 * Exits non-zero if any shape differs from the comparison snapshot.
 *
 * The shape list is the union of both specs' tables plus the benchmark scenes, so the
 * two closed findings' own reproductions are what the comparison runs on.
 *
 * @module bench/watertight-equivalence
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

import modeling from '@jscad/modeling'

import { evaluate } from '../src/core/kernel/index.js'
import { toGeom3 } from '../src/core/kernel/group.js'
import { makeWatertight } from '../src/core/kernel/watertight.js'
import { exportBodies } from '../src/core/export.js'
import { SCENES } from './fixtures/export-scenes.js'

const { geometries } = modeling

// `GLTFExporter`'s binary path needs `FileReader` (see `export-benchmark.mjs`).
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    constructor() {
      this.result = null
      this.onloadend = null
      this.onerror = null
    }

    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((buffer) => {
          this.result = buffer
          this.onloadend?.()
        })
        .catch((error) => this.onerror?.(error))
    }
  }
}

const args = process.argv.slice(2)
/** @param {string} flag */
const option = (flag) => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}

/** @param {any} geometry @returns {any} */
const one = (records, id) => evaluate(records).byId.get(id)

/**
 * Every shape `io-004` and `io-005` assert on, verbatim from their spec tables, plus
 * the benchmark scenes' bodies.
 *
 * @type {[string, () => any][]}
 */
const SHAPES = [
  [
    'io-004/io-005 #1 — a Union placed away from the origin',
    () =>
      one(
        [
          { id: 'cyl', op: 'primitive.cylinder', params: { diameter: 40, height: 50, center: [-100.89, 66.93, 25] } },
          { id: 'cube', op: 'primitive.cuboid', params: { size: [40, 40, 40], center: [-95, 75, 20] } },
          { id: 'u', op: 'boolean.union', target: 'cyl', operands: ['cube'] },
        ],
        'u'
      ),
  ],
  [
    'io-004 #2 — a placed hardware.bolt (m10 hex, 30 long)',
    () => one([{ id: 'b', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 30 } }], 'b'),
  ],
  ['io-004 #3 — a hardware.nut', () => one([{ id: 'n', op: 'hardware.nut', params: { spec: 'm4', fit: 'loose' } }], 'n')],
  [
    'io-004 #4 — a kit.boardFrame',
    () =>
      one(
        [
          {
            id: 'f',
            op: 'kit.boardFrame',
            params: { outerWidth: 40, outerHeight: 30, innerWidth: 30, innerHeight: 20, cornerRadius: 3 },
          },
        ],
        'f'
      ),
  ],
  [
    "io-004 #5 — io-003's union (a 20 mm cube and a Ø12 cylinder)",
    () =>
      one(
        [
          { id: 'cube', op: 'primitive.cuboid', params: { size: [20, 20, 20] } },
          { id: 'cyl', op: 'primitive.cylinder', params: { diameter: 12, height: 40, center: [10, 0, 0] } },
          { id: 'u', op: 'boolean.union', target: 'cube', operands: ['cyl'] },
        ],
        'u'
      ),
  ],
  [
    "io-004 #6 — io-003's bored cube (10 mm cube minus a Ø6 bore)",
    () =>
      one(
        [
          { id: 'cube', op: 'primitive.cuboid', params: { size: [10, 10, 10] } },
          { id: 'bore', op: 'primitive.cylinder', params: { diameter: 6, height: 20, segments: 32 } },
          { id: 'd', op: 'boolean.subtract', target: 'cube', operands: ['bore'] },
        ],
        'd'
      ),
  ],
  [
    'io-004 #7 — a union that has then been translated and rotated',
    () =>
      one(
        [
          { id: 'cube', op: 'primitive.cuboid', params: { size: [20, 20, 20] } },
          { id: 'cyl', op: 'primitive.cylinder', params: { diameter: 12, height: 40, center: [10, 0, 0] } },
          { id: 'u', op: 'boolean.union', target: 'cube', operands: ['cyl'] },
          { id: 'r', op: 'transform.rotate', target: 'u', params: { angles: [0, 0, 37] } },
          { id: 't', op: 'transform.translate', target: 'r', params: { vector: [-100.89, 66.93, 25] } },
        ],
        't'
      ),
  ],
  ['io-005 #3 — a raspberrypi.bplus', () => one([{ id: 'p', op: 'raspberrypi.bplus', params: {} }], 'p')],
  // Shapes the benchmark measures, so the timed path and the compared path are the same.
  ['bench — large single solid (sphere segments:96 ∪ cube)', () => SCENES['large-solid'].build()[0].geometry],
  ['bench — huge single solid (sphere segments:192 ∪ cube)', () => SCENES['huge-solid'].build()[0].geometry],
]

/** @param {any} solid @returns {string} */
function vertexDigest(solid) {
  const hash = createHash('sha256')
  for (const polygon of geometries.geom3.toPolygons(solid)) {
    for (const vertex of polygon.vertices) hash.update(`${vertex[0]},${vertex[1]},${vertex[2]};`)
    hash.update('|')
  }
  return hash.digest('hex').slice(0, 16)
}

/** @param {Uint8Array} bytes */
const bytesDigest = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 16)

const snapshot = {}
const { exportGltf } = await import('../src/render/export.js')

for (const [label, make] of SHAPES) {
  const geometry = make()
  const solid = toGeom3(geometry)
  const repaired = makeWatertight(solid)
  const polygons = geometries.geom3.toPolygons(repaired)
  const body = [{ id: 'x', name: 'Part 1', geometry }]

  snapshot[label] = {
    polygonsIn: geometries.geom3.toPolygons(solid).length,
    polygonsOut: polygons.length,
    verticesOut: polygons.reduce((sum, polygon) => sum + polygon.vertices.length, 0),
    vertexDigest: vertexDigest(repaired),
    stl: bytesDigest(exportBodies(body, 'stl').bytes),
    obj: bytesDigest(exportBodies(body, 'obj').bytes),
    glb: bytesDigest((await exportGltf(body)).bytes),
    stlTriangles: exportBodies(body, 'stl').triangleCount,
  }
  const row = snapshot[label]
  console.log(
    `${label}\n  polygons ${row.polygonsIn} → ${row.polygonsOut} · vertices ${row.verticesOut} · verts ${row.vertexDigest} · stl ${row.stl} (${row.stlTriangles} tri) · obj ${row.obj} · glb ${row.glb}`
  )
}

const out = option('--out')
if (out) {
  writeFileSync(out, JSON.stringify(snapshot, null, 2))
  console.log(`\nwrote ${out}`)
}

const compare = option('--compare')
if (compare) {
  const previous = JSON.parse(readFileSync(compare, 'utf8'))
  let differences = 0
  for (const label of Object.keys(snapshot)) {
    const before = previous[label]
    if (!before) {
      console.log(`\n?  ${label}: not in the comparison snapshot`)
      continue
    }
    for (const field of Object.keys(snapshot[label])) {
      if (before[field] !== snapshot[label][field]) {
        differences += 1
        console.log(`\nX  ${label} · ${field}: ${before[field]} → ${snapshot[label][field]}`)
      }
    }
  }
  console.log(
    differences === 0
      ? `\nIDENTICAL — ${Object.keys(snapshot).length} shapes, every repaired vertex list and every written STL / OBJ / GLB byte unchanged.`
      : `\n${differences} DIFFERENCE(S)`
  )
  if (differences > 0) process.exitCode = 1
}
