import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { evaluate } from './kernel/index.js'
import { add, boundsOf, createGroup, volumeOf } from './kernel/group.js'
import {
  EXPORT_FORMATS,
  ExportError,
  exportBodies,
  exportFilename,
  resolveExportScope,
  slugifyName,
} from './export.js'

const { primitives, geometries } = modeling

/** @typedef {import('./export.js').ExportBody} ExportBody */

// ---------------------------------------------------------------------------
// An INDEPENDENT reader for the bytes `exportBodies` produces. Nothing below
// imports the serializer packages: the spec is only worth having if the parser
// that judges the output shares no code with the thing that wrote it, so a bug in
// the serializer cannot cancel itself out on the way back in.
// ---------------------------------------------------------------------------

/**
 * @typedef {object} ParsedMesh
 * @property {number} triangleCount
 * @property {number[][][]} triangles Each `[[x,y,z],[x,y,z],[x,y,z]]`.
 */

/**
 * Parse a binary STL by its fixed layout: 80-byte header, uint32 count, then 50 bytes
 * per triangle (12 float32 + a uint16 attribute).
 *
 * @param {Uint8Array} bytes
 * @returns {ParsedMesh}
 */
function parseBinaryStl(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(80, true)
  // The declared count must match the payload exactly, or a slicer reads garbage.
  expect(bytes.byteLength).toBe(84 + 50 * count)
  const triangles = []
  for (let index = 0; index < count; index += 1) {
    const base = 84 + 50 * index
    const triangle = []
    for (let vertex = 0; vertex < 3; vertex += 1) {
      triangle.push([
        view.getFloat32(base + 12 + vertex * 12, true),
        view.getFloat32(base + 16 + vertex * 12, true),
        view.getFloat32(base + 20 + vertex * 12, true),
      ])
    }
    triangles.push(triangle)
  }
  return { triangleCount: count, triangles }
}

/**
 * Parse an OBJ's `v` / `f` lines. Face indices are 1-based, may carry `/vt/vn`
 * suffixes, and a polygon with more than three corners is fanned.
 *
 * @param {Uint8Array} bytes
 * @returns {ParsedMesh & { vertexCount: number }}
 */
function parseObj(bytes) {
  const text = new TextDecoder().decode(bytes)
  /** @type {number[][]} */
  const vertices = []
  /** @type {number[][][]} */
  const triangles = []
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts[0] === 'v') vertices.push(parts.slice(1, 4).map(Number))
    if (parts[0] === 'f') {
      const corners = parts.slice(1).map((token) => vertices[Number(token.split('/')[0]) - 1])
      for (const corner of corners) expect(corner).toBeDefined()
      for (let index = 2; index < corners.length; index += 1) {
        triangles.push([corners[0], corners[index - 1], corners[index]])
      }
    }
  }
  return { triangleCount: triangles.length, triangles, vertexCount: vertices.length }
}

/**
 * @param {number[][][]} triangles
 * @returns {[number[], number[]]}
 */
function boundsOfTriangles(triangles) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const triangle of triangles) {
    for (const vertex of triangle) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], vertex[axis])
        max[axis] = Math.max(max[axis], vertex[axis])
      }
    }
  }
  return [min, max]
}

/**
 * Signed volume by the divergence theorem: the sum of `a · (b × c) / 6` over every
 * triangle. Positive for an outward-wound closed surface, and (unlike a bounding box)
 * sensitive to a missing face or flipped winding.
 *
 * @param {number[][][]} triangles
 * @returns {number}
 */
function signedVolume(triangles) {
  let volume = 0
  for (const [a, b, c] of triangles) {
    volume +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) -
        a[1] * (b[0] * c[2] - b[2] * c[0]) +
        a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6
  }
  return volume
}

/**
 * Undirected edges that only one triangle touches. Zero means the surface is closed;
 * a slicer's "non-manifold edges" warning is exactly this number being positive.
 * Vertices are welded by rounding to 1e-3 mm, well above float32 noise and well below
 * any real feature.
 *
 * @param {number[][][]} triangles
 * @returns {number}
 */
function unmatchedEdges(triangles) {
  /** @param {number[]} vertex */
  const key = (vertex) => vertex.map((value) => Math.round(value * 1000)).join(',')
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const [a, b, c] of triangles) {
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const edge = [key(from), key(to)].sort().join('|')
      counts.set(edge, (counts.get(edge) ?? 0) + 1)
    }
  }
  let unmatched = 0
  for (const count of counts.values()) if (count % 2 !== 0) unmatched += 1
  return unmatched
}

/**
 * The **stricter** reading of the same question, and the one `e2e/export-ui.e2e.js`
 * already applies to a downloaded file: every undirected edge must be used by exactly
 * two triangles, once each way. {@link unmatchedEdges} above counts parity only, so it
 * would forgive four faces meeting on one edge, or two faces wound the same way.
 * Both are asserted from `io-004` on, because a slicer objects to either.
 *
 * @param {number[][][]} triangles
 * @returns {{ open: number, edges: number }}
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
  return { open, edges: edges.size }
}

/**
 * Triangles with no area. Inserting a vertex into an edge is exactly the operation that
 * produces one by accident (three collinear corners), so the repair has to be checked
 * for them rather than assumed clean.
 *
 * @param {number[][][]} triangles
 * @returns {number}
 */
function degenerateTriangles(triangles) {
  let count = 0
  for (const [a, b, c] of triangles) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    if (!(Math.hypot(...cross) / 2 > 1e-12)) count += 1
  }
  return count
}

/**
 * @param {string} name
 * @param {any} geometry
 * @returns {ExportBody}
 */
const body = (name, geometry) => ({ id: name.toLowerCase().replace(/\s+/g, '-'), name, geometry })

const cube10 = () => primitives.cuboid({ size: [10, 10, 10] })

describe('EXPORT_FORMATS', () => {
  it('names an extension and mime type for each of the three v1 formats', () => {
    expect(Object.keys(EXPORT_FORMATS).sort()).toEqual(['glb', 'obj', 'stl'])
    expect(EXPORT_FORMATS.stl.extension).toBe('stl')
    expect(EXPORT_FORMATS.obj.extension).toBe('obj')
    // glTF is binary .glb: one file, no sidecar .bin to lose (io-003's decision).
    expect(EXPORT_FORMATS.glb.extension).toBe('glb')
    expect(EXPORT_FORMATS.glb.mimeType).toBe('model/gltf-binary')
  })
})

describe('slugifyName', () => {
  it('lowercases and hyphenates a display name', () => {
    expect(slugifyName('Union 1')).toBe('union-1')
    expect(slugifyName('  Cube   1 ')).toBe('cube-1')
  })

  it('drops characters that are unsafe in a filename', () => {
    expect(slugifyName('a/b\\c:d*e?"f<g>h|i')).toBe('a-b-c-d-e-f-g-h-i')
    expect(slugifyName('../../etc/passwd')).toBe('etc-passwd')
  })

  it('falls back to "body" when nothing usable is left', () => {
    expect(slugifyName('')).toBe('body')
    expect(slugifyName('***')).toBe('body')
    expect(slugifyName(undefined)).toBe('body')
  })
})

describe('exportFilename', () => {
  it('uses the slugged display name for one body', () => {
    expect(exportFilename([body('Union 1', cube10())], 'stl')).toBe('union-1.stl')
    expect(exportFilename([body('Cube 1', cube10())], 'obj')).toBe('cube-1.obj')
    expect(exportFilename([body('Cube 1', cube10())], 'glb')).toBe('cube-1.glb')
  })

  it('uses warpcad-scene for several bodies or the whole scene', () => {
    const two = [body('Cube 1', cube10()), body('Cube 2', cube10())]
    expect(exportFilename(two, 'stl')).toBe('warpcad-scene.stl')
    expect(exportFilename(two, 'glb')).toBe('warpcad-scene.glb')
    expect(exportFilename([], 'obj')).toBe('warpcad-scene.obj')
  })

  it('refuses a format it does not know rather than inventing an extension', () => {
    // @ts-expect-error deliberately not an ExportFormat
    expect(() => exportFilename([], 'step')).toThrow(/unknown export format "step"/)
  })
})

describe('resolveExportScope', () => {
  const a = body('Cube 1', cube10())
  const b = body('Cube 2', cube10())
  const c = body('Cube 3', cube10())

  it('exports the whole scene when nothing is selected', () => {
    const scope = resolveExportScope([a, b, c], [])
    expect(scope.scope).toBe('scene')
    expect(scope.bodies).toEqual([a, b, c])
  })

  it('exports just the selected bodies, in scene order, when something is selected', () => {
    const scope = resolveExportScope([a, b, c], [c.id, a.id])
    expect(scope.scope).toBe('selection')
    expect(scope.bodies).toEqual([a, c])
  })

  it('ignores an id that is not a body, but refuses a selection that matches nothing', () => {
    expect(resolveExportScope([a, b], [b.id, 'gone']).bodies).toEqual([b])
    // A stale selection must not quietly widen to the whole scene: the user asked for
    // "just this" and would receive a file with everything in it.
    expect(() => resolveExportScope([a, b], ['gone'])).toThrow(ExportError)
  })

  it('exports the whole parent body for a drilled-in sub-part selection', () => {
    // The selection store keeps `ids` as the body id when a sub-part is drilled into,
    // so the scope is already the parent; a part name is not a body id.
    const scope = resolveExportScope([a, b], [a.id])
    expect(scope.bodies).toEqual([a])
  })
})

describe('exportBodies — STL', () => {
  it('exports a 10 mm cube as a parseable binary STL with the right size, volume and 12 triangles', () => {
    const result = exportBodies([body('Cube 1', cube10())], 'stl')
    expect(result.bytes).toBeInstanceOf(Uint8Array)
    expect(result.filename).toBe('cube-1.stl')
    expect(result.mimeType).toBe(EXPORT_FORMATS.stl.mimeType)
    expect(result.triangleCount).toBe(12)

    const mesh = parseBinaryStl(result.bytes)
    expect(mesh.triangleCount).toBe(12)
    const [min, max] = boundsOfTriangles(mesh.triangles)
    for (let axis = 0; axis < 3; axis += 1) {
      expect(min[axis]).toBeCloseTo(-5, 4)
      expect(max[axis]).toBeCloseTo(5, 4)
    }
    expect(signedVolume(mesh.triangles)).toBeCloseTo(1000, 3)
    expect(unmatchedEdges(mesh.triangles)).toBe(0)
  })

  it('exports a real evaluated union: volume matches the kernel and the surface is watertight', () => {
    // The end-to-end kernel path: op records → the fold → a body → STL bytes → an
    // independent parser. This is scenario 11's byte-level bar, minus only the
    // browser download that the not-yet-built ui-034 owns.
    const { byId } = evaluate([
      { id: 'cube', op: 'primitive.cuboid', params: { size: [20, 20, 20] } },
      { id: 'cyl', op: 'primitive.cylinder', params: { diameter: 12, height: 40, center: [10, 0, 0] } },
      { id: 'u', op: 'boolean.union', target: 'cube', operands: ['cyl'] },
    ])
    const union = /** @type {any} */ (byId.get('u'))
    const result = exportBodies([body('Union 1', union)], 'stl')
    expect(result.filename).toBe('union-1.stl')

    const mesh = parseBinaryStl(result.bytes)
    const kernelVolume = volumeOf(union)
    // float32 coordinates and a re-triangulation move the volume by a hair, not more.
    expect(signedVolume(mesh.triangles) / kernelVolume).toBeCloseTo(1, 4)
    expect(unmatchedEdges(mesh.triangles)).toBe(0)
    const [min, max] = boundsOfTriangles(mesh.triangles)
    expect(min[0]).toBeCloseTo(-10, 3)
    expect(max[0]).toBeCloseTo(16, 3)
    expect(min[2]).toBeCloseTo(-20, 3)
    expect(max[2]).toBeCloseTo(20, 3)
  })

  it('stays watertight on a curved boolean (cube minus a Ø6 bore), the case three.js STLExporter fails', () => {
    // docs/decisions/persistence-export.md measured 100 of 362 edges unmatched for
    // three.js's exporter on exactly this shape, fed by the render mesh bridge.
    const { byId } = evaluate([
      { id: 'cube', op: 'primitive.cuboid', params: { size: [10, 10, 10] } },
      { id: 'bore', op: 'primitive.cylinder', params: { diameter: 6, height: 20, segments: 32 } },
      { id: 'd', op: 'boolean.subtract', target: 'cube', operands: ['bore'] },
    ])
    const drilled = /** @type {any} */ (byId.get('d'))
    const mesh = parseBinaryStl(exportBodies([body('Drilled', drilled)], 'stl').bytes)
    expect(unmatchedEdges(mesh.triangles)).toBe(0)
    expect(signedVolume(mesh.triangles) / volumeOf(drilled)).toBeCloseTo(1, 4)
  })
})

describe('exportBodies — OBJ', () => {
  it('exports a 10 mm cube as a parseable OBJ with 8 shared vertices and 12 triangles', () => {
    const result = exportBodies([body('Cube 1', cube10())], 'obj')
    expect(result.filename).toBe('cube-1.obj')
    expect(result.mimeType).toBe(EXPORT_FORMATS.obj.mimeType)
    expect(result.triangleCount).toBe(12)

    const mesh = parseObj(result.bytes)
    // Shared, not per-face, vertices: a cube's 8 corners.
    expect(mesh.vertexCount).toBe(8)
    expect(mesh.triangleCount).toBe(12)
    const [min, max] = boundsOfTriangles(mesh.triangles)
    for (let axis = 0; axis < 3; axis += 1) {
      expect(min[axis]).toBeCloseTo(-5, 6)
      expect(max[axis]).toBeCloseTo(5, 6)
    }
    expect(signedVolume(mesh.triangles)).toBeCloseTo(1000, 6)
    expect(unmatchedEdges(mesh.triangles)).toBe(0)
  })

  it('agrees with the STL of the same solid on triangle count and volume', () => {
    const { byId } = evaluate([
      { id: 'cube', op: 'primitive.cuboid', params: { size: [20, 20, 20] } },
      { id: 'cyl', op: 'primitive.cylinder', params: { diameter: 12, height: 40, center: [10, 0, 0] } },
      { id: 'u', op: 'boolean.union', target: 'cube', operands: ['cyl'] },
    ])
    const union = /** @type {any} */ (byId.get('u'))
    const stl = parseBinaryStl(exportBodies([body('U', union)], 'stl').bytes)
    const obj = parseObj(exportBodies([body('U', union)], 'obj').bytes)
    expect(obj.triangleCount).toBe(stl.triangleCount)
    expect(signedVolume(obj.triangles)).toBeCloseTo(signedVolume(stl.triangles), 2)
  })
})

describe('exportBodies — several bodies and Group-valued bodies', () => {
  it('writes several bodies into ONE file, not one file each', () => {
    // io-003's decision (a): the simplest honest answer, and what a slicer plate or a
    // mesh viewer expects from "export these". The filename says so: warpcad-scene.
    const a = body('Cube 1', cube10())
    const b = body('Cube 2', primitives.cuboid({ size: [4, 4, 4], center: [30, 0, 0] }))
    const result = exportBodies([a, b], 'stl')
    expect(result.filename).toBe('warpcad-scene.stl')
    const mesh = parseBinaryStl(result.bytes)
    expect(mesh.triangleCount).toBe(24)
    expect(signedVolume(mesh.triangles)).toBeCloseTo(1000 + 64, 3)
    const [min, max] = boundsOfTriangles(mesh.triangles)
    expect(min[0]).toBeCloseTo(-5, 4)
    expect(max[0]).toBeCloseTo(32, 4)
    expect(unmatchedEdges(mesh.triangles)).toBe(0)
  })

  it('exports a Group-valued body as one combined solid (its visible parts, unioned)', () => {
    // A hardware/kit part is a Group. The export is what you would print: the
    // combined solid, matching `combine()`, not a pile of overlapping part shells.
    let group = createGroup('bracket')
    group = add(group, primitives.cuboid({ size: [10, 10, 10] }), 'base')
    group = add(group, primitives.cuboid({ size: [10, 10, 10], center: [5, 0, 0] }), 'arm')
    const mesh = parseBinaryStl(exportBodies([body('Bracket', group)], 'stl').bytes)
    expect(signedVolume(mesh.triangles) / volumeOf(group)).toBeCloseTo(1, 4)
    // Overlapping parts fused: 15 wide, not two shells poking through each other.
    expect(volumeOf(group)).toBeCloseTo(1500, 3)
    expect(unmatchedEdges(mesh.triangles)).toBe(0)
  })

  it('leaves a hidden part out, exactly as the group itself does', () => {
    let group = createGroup('with-hidden')
    group = add(group, primitives.cuboid({ size: [10, 10, 10] }), 'shown')
    group = add(group, primitives.cuboid({ size: [50, 50, 50] }), 'tap-clearance', { hidden: true })
    const mesh = parseBinaryStl(exportBodies([body('Part', group)], 'stl').bytes)
    expect(signedVolume(mesh.triangles)).toBeCloseTo(1000, 3)
  })

  it('exports a real composite library item (hardware.bolt) end to end', () => {
    const { byId } = evaluate([{ id: 'b', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 30 } }])
    const bolt = /** @type {any} */ (byId.get('b'))
    const mesh = parseBinaryStl(exportBodies([body('Bolt 1', bolt)], 'stl').bytes)
    expect(mesh.triangleCount).toBeGreaterThan(0)
    expect(signedVolume(mesh.triangles) / volumeOf(bolt)).toBeCloseTo(1, 3)
  })
})

describe('exportBodies — every exported surface is watertight (io-004)', () => {
  // `io-003` measured 0 unmatched edges on two shapes and read that as a property of the
  // kernel-side serializer. It is not: driving `ui-034` found ordinary shapes where the
  // serializer's own T-junction repair silently gives up — a plain Union placed off the
  // origin (6 open edges) and a placed bolt (40, all on the hex head's rim). The table
  // below is the general claim instead of the two-shape one, and it is asserted on the
  // BYTES, through the parsers above, in both kernel-side formats.
  /** @type {[string, () => any, number][]} Name, geometry, kernel volume tolerance (relative). */
  const shapes = [
    [
      // io-004 reproduction 1: what ACCEPTANCE scenario 11 step 2 builds by hand.
      'a Union placed away from the origin',
      () => {
        const { byId } = evaluate([
          { id: 'cyl', op: 'primitive.cylinder', params: { diameter: 40, height: 50, center: [-100.89, 66.93, 25] } },
          { id: 'cube', op: 'primitive.cuboid', params: { size: [40, 40, 40], center: [-95, 75, 20] } },
          { id: 'u', op: 'boolean.union', target: 'cyl', operands: ['cube'] },
        ])
        return byId.get('u')
      },
      1e-4,
    ],
    [
      // io-004 reproduction 2: a Group body, exported as its combine()d solid.
      'a placed hardware.bolt (m10 hex, 30 long)',
      () => {
        const { byId } = evaluate([{ id: 'b', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 30 } }])
        return byId.get('b')
      },
      1e-4,
    ],
    [
      'a hardware.nut',
      () => {
        const { byId } = evaluate([{ id: 'n', op: 'hardware.nut', params: { spec: 'm4', fit: 'loose' } }])
        return byId.get('n')
      },
      1e-4,
    ],
    [
      'a kit.boardFrame',
      () => {
        const { byId } = evaluate([
          {
            id: 'f',
            op: 'kit.boardFrame',
            params: { outerWidth: 40, outerHeight: 30, innerWidth: 30, innerHeight: 20, cornerRadius: 3 },
          },
        ])
        return byId.get('f')
      },
      1e-4,
    ],
    [
      // io-003's own two measured shapes, which must STAY at 0 — this is the closed
      // finding whose subsystem this task extends (CLAUDE.md, Verification).
      "io-003's union (a 20 mm cube and a Ø12 cylinder)",
      () => {
        const { byId } = evaluate([
          { id: 'cube', op: 'primitive.cuboid', params: { size: [20, 20, 20] } },
          { id: 'cyl', op: 'primitive.cylinder', params: { diameter: 12, height: 40, center: [10, 0, 0] } },
          { id: 'u', op: 'boolean.union', target: 'cube', operands: ['cyl'] },
        ])
        return byId.get('u')
      },
      1e-4,
    ],
    [
      "io-003's bored cube (10 mm cube minus a Ø6 bore)",
      () => {
        const { byId } = evaluate([
          { id: 'cube', op: 'primitive.cuboid', params: { size: [10, 10, 10] } },
          { id: 'bore', op: 'primitive.cylinder', params: { diameter: 6, height: 20, segments: 32 } },
          { id: 'd', op: 'boolean.subtract', target: 'cube', operands: ['bore'] },
        ])
        return byId.get('d')
      },
      1e-4,
    ],
    [
      // A body the user has MOVED and TURNED. Kernel geometry carries transforms
      // lazily, so a repair that rebuilt the solid from `geometry.polygons` instead of
      // `toPolygons()` would export it unmoved — or, if it copied the transform matrix
      // onto the rebuilt solid, apply the move twice. Both show up here as a volume or
      // a bounding box that does not match the kernel's.
      'a union that has then been translated and rotated',
      () => {
        const { byId } = evaluate([
          { id: 'cube', op: 'primitive.cuboid', params: { size: [20, 20, 20] } },
          { id: 'cyl', op: 'primitive.cylinder', params: { diameter: 12, height: 40, center: [10, 0, 0] } },
          { id: 'u', op: 'boolean.union', target: 'cube', operands: ['cyl'] },
          { id: 'r', op: 'transform.rotate', target: 'u', params: { angles: [0, 0, 37] } },
          { id: 't', op: 'transform.translate', target: 'r', params: { vector: [-100.89, 66.93, 25] } },
        ])
        return byId.get('t')
      },
      1e-4,
    ],
  ]

  for (const [label, make, tolerance] of shapes) {
    for (const format of /** @type {const} */ (['stl', 'obj'])) {
      it(`writes ${label} as a closed manifold ${format.toUpperCase()}`, () => {
        const geometry = make()
        const result = exportBodies([body('Part 1', geometry)], format)
        const mesh = format === 'stl' ? parseBinaryStl(result.bytes) : parseObj(result.bytes)

        // The bar io-004 was filed for, both readings of it.
        expect(openEdges(mesh.triangles).open, 'undirected edges not used by exactly two faces').toBe(0)
        expect(unmatchedEdges(mesh.triangles)).toBe(0)

        // ...without having quietly changed the solid to get there.
        const kernelVolume = volumeOf(geometry)
        expect(Math.abs(signedVolume(mesh.triangles) / kernelVolume - 1)).toBeLessThan(tolerance)
        expect(signedVolume(mesh.triangles), 'outward winding, so the volume is positive').toBeGreaterThan(0)
        expect(degenerateTriangles(mesh.triangles), 'no zero-area triangles introduced').toBe(0)

        const [kernelMin, kernelMax] = boundsOf(geometry)
        const [min, max] = boundsOfTriangles(mesh.triangles)
        for (let axis = 0; axis < 3; axis += 1) {
          expect(min[axis]).toBeCloseTo(kernelMin[axis], 2)
          expect(max[axis]).toBeCloseTo(kernelMax[axis], 2)
        }
      })
    }
  }

  it('keeps several bodies in one file watertight, each of them', () => {
    const { byId } = evaluate([
      { id: 'cyl', op: 'primitive.cylinder', params: { diameter: 40, height: 50, center: [-100.89, 66.93, 25] } },
      { id: 'cube', op: 'primitive.cuboid', params: { size: [40, 40, 40], center: [-95, 75, 20] } },
      { id: 'u', op: 'boolean.union', target: 'cyl', operands: ['cube'] },
      { id: 'b', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 30 } },
    ])
    const union = /** @type {any} */ (byId.get('u'))
    const bolt = /** @type {any} */ (byId.get('b'))
    const mesh = parseBinaryStl(exportBodies([body('Union 1', union), body('Bolt 1', bolt)], 'stl').bytes)
    expect(openEdges(mesh.triangles).open).toBe(0)
    expect(signedVolume(mesh.triangles) / (volumeOf(union) + volumeOf(bolt))).toBeCloseTo(1, 4)
  })
})

describe('exportBodies — refusals, by name', () => {
  it('refuses an empty scene instead of writing a file with no solids in it', () => {
    let caught
    try {
      exportBodies([], 'stl')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ExportError)
    expect(/** @type {ExportError} */ (caught).code).toBe('nothing-to-export')
    expect(/** @type {ExportError} */ (caught).message).toMatch(/Nothing to export/)
  })

  it('refuses a body with zero triangles, naming it, in both formats', () => {
    const empty = geometries.geom3.create()
    for (const format of /** @type {const} */ (['stl', 'obj'])) {
      let caught
      try {
        exportBodies([body('Cube 1', cube10()), body('Ghost', empty)], format)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(ExportError)
      expect(/** @type {ExportError} */ (caught).code).toBe('empty-geometry')
      expect(/** @type {ExportError} */ (caught).bodyName).toBe('Ghost')
      expect(/** @type {ExportError} */ (caught).message).toMatch(/Ghost/)
    }
  })

  it('names the body when its geometry cannot be reduced to a solid', () => {
    // A group with no visible parts makes combine() throw; the user needs to be told
    // WHICH body, not shown the kernel's internal message alone.
    const hollow = add(createGroup('hollow'), primitives.cuboid({ size: [1, 1, 1] }), 'only', { hidden: true })
    let caught
    try {
      exportBodies([body('Cube 1', cube10()), body('Hollow One', hollow)], 'stl')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ExportError)
    expect(/** @type {ExportError} */ (caught).code).toBe('evaluation-failed')
    expect(/** @type {ExportError} */ (caught).bodyName).toBe('Hollow One')
    expect(/** @type {ExportError} */ (caught).message).toMatch(/Hollow One/)
  })

  it('sends glTF to the render module rather than half-supporting it here', () => {
    let caught
    try {
      exportBodies([body('Cube 1', cube10())], 'glb')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ExportError)
    expect(/** @type {ExportError} */ (caught).code).toBe('unsupported-format')
    expect(/** @type {ExportError} */ (caught).message).toMatch(/render\/export/)
  })

  it('refuses an unknown format', () => {
    // @ts-expect-error deliberately not an ExportFormat
    expect(() => exportBodies([body('Cube 1', cube10())], 'step')).toThrow(/unknown export format "step"/)
  })
})
