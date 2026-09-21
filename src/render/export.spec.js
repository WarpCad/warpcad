// @vitest-environment jsdom
//
// `GLTFExporter`'s binary path builds a Blob and reads it back with a FileReader,
// neither of which plain Node has under Vitest, so this file opts into jsdom for them.
// No WebGL context is involved: the exporter walks a scene graph of `BufferGeometry`
// (CLAUDE.md: "always mock at the boundary" — nothing here needs a GPU, so nothing is
// mocked), the same reason `mesh.spec.js` runs without a renderer.

import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { ExportError } from '../core/export.js'
import { evaluate } from '../core/kernel/index.js'
import { add, boundsOf, createGroup, volumeOf } from '../core/kernel/group.js'
import { exportGltf } from './export.js'

const { primitives, geometries } = modeling

/**
 * @typedef {object} ParsedGlb
 * @property {any} json The JSON chunk.
 * @property {Uint8Array} bin The BIN chunk.
 */

/**
 * Parse a GLB container by its fixed layout (an independent reader — nothing here
 * shares code with the exporter): a 12-byte header (`glTF`, version, total length),
 * then length-prefixed chunks, the first JSON and the second BIN.
 *
 * @param {Uint8Array} bytes
 * @returns {ParsedGlb}
 */
function parseGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  expect(view.getUint32(0, true)).toBe(0x46546c67) // 'glTF'
  expect(view.getUint32(4, true)).toBe(2)
  // The declared length must be the real length, or a loader rejects the file.
  expect(view.getUint32(8, true)).toBe(bytes.byteLength)
  const jsonLength = view.getUint32(12, true)
  expect(view.getUint32(16, true)).toBe(0x4e4f534a) // 'JSON'
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)))
  const binHeader = 20 + jsonLength
  const binLength = view.getUint32(binHeader, true)
  expect(view.getUint32(binHeader + 4, true)).toBe(0x004e4942) // 'BIN\0'
  return { json, bin: bytes.subarray(binHeader + 8, binHeader + 8 + binLength) }
}

/**
 * Multiply two column-major 4x4 matrices (`a · b`).
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function multiply(a, b) {
  const out = new Array(16).fill(0)
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let k = 0; k < 4; k += 1) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k]
    }
  }
  return out
}

/**
 * A glTF node's local matrix, from either its `matrix` or its TRS.
 *
 * @param {any} node
 * @returns {number[]}
 */
function nodeMatrix(node) {
  if (node.matrix) return node.matrix
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  // prettier-ignore
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

/**
 * The world-space bounding box, in **metres**, of every mesh in the file: each
 * POSITION accessor's min/max corners pushed through the node chain above it.
 *
 * @param {any} json
 * @returns {[number[], number[]]}
 */
function worldBounds(json) {
  /** @type {Map<number, number[]>} */
  const worldOf = new Map()
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  /**
   * @param {number} index
   * @param {number[]} parent
   */
  const walk = (index, parent) => {
    const world = multiply(parent, nodeMatrix(json.nodes[index]))
    worldOf.set(index, world)
    for (const child of json.nodes[index].children ?? []) walk(child, world)
  }
  for (const root of json.scenes[json.scene ?? 0].nodes) walk(root, identity)

  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const [index, world] of worldOf) {
    const meshIndex = json.nodes[index].mesh
    if (meshIndex === undefined) continue
    for (const primitive of json.meshes[meshIndex].primitives) {
      const accessor = json.accessors[primitive.attributes.POSITION]
      for (const x of [accessor.min[0], accessor.max[0]]) {
        for (const y of [accessor.min[1], accessor.max[1]]) {
          for (const z of [accessor.min[2], accessor.max[2]]) {
            for (let axis = 0; axis < 3; axis += 1) {
              const value = world[axis] * x + world[4 + axis] * y + world[8 + axis] * z + world[12 + axis]
              min[axis] = Math.min(min[axis], value)
              max[axis] = Math.max(max[axis], value)
            }
          }
        }
      }
    }
  }
  return [min, max]
}

/**
 * @param {any} json
 * @returns {number}
 */
function triangleTotal(json) {
  let count = 0
  for (const mesh of json.meshes) {
    for (const primitive of mesh.primitives) {
      const accessor = json.accessors[primitive.indices ?? primitive.attributes.POSITION]
      count += accessor.count / 3
    }
  }
  return count
}

/**
 * Read a `VEC3`/`FLOAT` accessor out of the BIN chunk, by the spec's own layout:
 * `bufferView.byteOffset + accessor.byteOffset`, then `count` elements of three
 * little-endian float32, `byteStride` apart when the view declares one.
 *
 * Deliberately hand-rolled rather than run through three.js's `GLTFLoader`: the
 * exporter that wrote these bytes *is* three.js, and a check is only worth having if
 * the reader shares no code with the writer (the same rule `src/core/export.spec.js`
 * states for STL and OBJ).
 *
 * @param {ParsedGlb} glb
 * @param {number} index Accessor index.
 * @returns {number[][]} One `[x, y, z]` per element.
 */
function readVec3(glb, index) {
  const accessor = glb.json.accessors[index]
  expect(accessor.type).toBe('VEC3')
  expect(accessor.componentType).toBe(5126) // FLOAT
  const view = glb.json.bufferViews[accessor.bufferView]
  const stride = view.byteStride ?? 12
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const data = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength)
  const out = []
  for (let element = 0; element < accessor.count; element += 1) {
    const at = start + element * stride
    out.push([data.getFloat32(at, true), data.getFloat32(at + 4, true), data.getFloat32(at + 8, true)])
  }
  return out
}

/**
 * Every triangle of every mesh in the file, in the file's own millimetre vertex data
 * (the root node's mm→m, Z-up→Y-up matrix is deliberately *not* applied — that
 * conversion has its own test, and watertightness is a property of the mesh data).
 *
 * @param {ParsedGlb} glb
 * @returns {number[][][]} Each `[[x,y,z],[x,y,z],[x,y,z]]`.
 */
function trianglesOfGlb(glb) {
  /** @type {number[][][]} */
  const triangles = []
  for (const mesh of glb.json.meshes) {
    for (const primitive of mesh.primitives) {
      // The exporter writes non-indexed triangles for these geometries; an index
      // buffer would have to be honoured rather than assumed away, so assert it.
      expect(primitive.indices, 'non-indexed POSITION, as the mesh bridge builds').toBeUndefined()
      expect(primitive.mode ?? 4, 'TRIANGLES').toBe(4)
      const positions = readVec3(glb, primitive.attributes.POSITION)
      for (let at = 0; at + 2 < positions.length; at += 3) {
        triangles.push([positions[at], positions[at + 1], positions[at + 2]])
      }
    }
  }
  return triangles
}

/**
 * Undirected edges not used by exactly two triangles walking it in opposite
 * directions — the strict reading, character for character the one
 * `src/core/export.spec.js`'s `io-004` block applies to STL and OBJ, so the three
 * formats are held to one bar rather than to three similar-sounding ones.
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
 * Triangles with no area. This is the specific trap `io-005` exists to avoid: the
 * repair inserts vertices into polygons and the bridge fans them from one corner, so a
 * collinear inserted vertex next to the apex is a zero-area triangle — which a
 * renderer draws as nothing and whose face normal is undefined.
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
 * Signed volume by the divergence theorem: positive when the winding is outward.
 *
 * @param {number[][][]} triangles
 * @returns {number}
 */
function signedVolume(triangles) {
  let total = 0
  for (const [a, b, c] of triangles) {
    total +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
  }
  return total
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
 * @param {string} name
 * @param {any} geometry
 */
const body = (name, geometry) => ({ id: name.toLowerCase().replace(/\s+/g, '-'), name, geometry })

describe('exportGltf', () => {
  it('writes a valid binary glTF 2.0 container with one mesh node per body', async () => {
    const result = await exportGltf([body('Cube 1', primitives.cuboid({ size: [10, 10, 10] }))])
    expect(result.filename).toBe('cube-1.glb')
    expect(result.mimeType).toBe('model/gltf-binary')
    expect(result.bytes).toBeInstanceOf(Uint8Array)

    const { json, bin } = parseGlb(result.bytes)
    expect(json.asset.version).toBe('2.0')
    expect(bin.byteLength).toBeGreaterThan(0)
    expect(json.meshes).toHaveLength(1)
    expect(result.triangleCount).toBe(12)
    expect(triangleTotal(json)).toBe(12)
    // The body's name survives, so a viewer's scene tree says "Cube 1", not "Mesh_0".
    expect(json.nodes.map((/** @type {any} */ node) => node.name)).toContain('Cube 1')
  })

  it('converts millimetres to metres and Z-up to glTF Y-up', async () => {
    // A 10 mm cube whose centre sits 20 mm out along the document's +Y. glTF is
    // metres and Y-up, so the viewer must see a 10 mm box: ±5 mm on X, ±5 mm on the
    // vertical axis (which is the document's Z), and — because the up-axis change is
    // a rotation — the document's +Y arriving as glTF -Z.
    const result = await exportGltf([body('Offset', primitives.cuboid({ size: [10, 10, 10], center: [0, 20, 0] }))])
    const [min, max] = worldBounds(parseGlb(result.bytes).json)
    const expectedMin = [-0.005, -0.005, -0.025]
    const expectedMax = [0.005, 0.005, -0.015]
    for (let axis = 0; axis < 3; axis += 1) {
      expect(min[axis]).toBeCloseTo(expectedMin[axis], 6)
      expect(max[axis]).toBeCloseTo(expectedMax[axis], 6)
    }
  })

  it('writes several bodies into ONE file, one node each', async () => {
    const result = await exportGltf([
      body('Cube 1', primitives.cuboid({ size: [10, 10, 10] })),
      body('Ball', primitives.sphere({ radius: 5, segments: 16, center: [30, 0, 0] })),
    ])
    expect(result.filename).toBe('warpcad-scene.glb')
    const { json } = parseGlb(result.bytes)
    expect(json.meshes).toHaveLength(2)
    const names = json.nodes.map((/** @type {any} */ node) => node.name)
    expect(names).toContain('Cube 1')
    expect(names).toContain('Ball')
    const [min, max] = worldBounds(json)
    expect(min[0]).toBeCloseTo(-0.005, 6)
    expect(max[0]).toBeCloseTo(0.035, 6)
  })

  it('exports a Group-valued body as one combined mesh, like STL and OBJ', async () => {
    let group = createGroup('bracket')
    group = add(group, primitives.cuboid({ size: [10, 10, 10] }), 'base')
    group = add(group, primitives.cuboid({ size: [10, 10, 10], center: [5, 0, 0] }), 'arm')
    const { json } = parseGlb((await exportGltf([body('Bracket', group)])).bytes)
    expect(json.meshes).toHaveLength(1)
    const [min, max] = worldBounds(json)
    expect(max[0] - min[0]).toBeCloseTo(0.015, 6) // 15 mm: fused, not two shells
  })

  it('refuses exactly what STL and OBJ refuse, by name', async () => {
    await expect(exportGltf([])).rejects.toMatchObject({ name: 'ExportError', code: 'nothing-to-export' })
    const empty = exportGltf([body('Ghost', geometries.geom3.create())])
    await expect(empty).rejects.toBeInstanceOf(ExportError)
    await expect(empty).rejects.toMatchObject({ code: 'empty-geometry', bodyName: 'Ghost' })
    const hollow = add(createGroup('hollow'), primitives.cuboid({ size: [1, 1, 1] }), 'only', { hidden: true })
    await expect(exportGltf([body('Hollow One', hollow)])).rejects.toMatchObject({
      code: 'evaluation-failed',
      bodyName: 'Hollow One',
    })
  })
})

describe('exportGltf — every exported surface is watertight (io-005)', () => {
  // `io-003` reasoned that a glTF consumer is "a viewer or a game engine, which does not
  // need [a watertight solid]" and left the `.glb` on the raw render mesh. Measured, that
  // mesh is open on every interesting shape — 44 of 262 undirected edges on a plain Union
  // placed off the origin, 271 of 920 on a Raspberry Pi board, and 42 / 88 even on the two
  // shapes the kernel path was always right about, because `geom3ToBufferGeometry`
  // fan-triangulates raw boolean output with no T-junction pass at all.
  //
  // `docs/decisions/persistence-export.md` sub-decision 4 records the decision to close it
  // anyway. The table below is that claim, asserted on the BYTES through the independent
  // accessor reader above, at the same bar `src/core/export.spec.js`'s `io-004` block holds
  // STL and OBJ to — so the three formats never disagree about what a body is.
  /** @type {[string, () => any][]} */
  const shapes = [
    [
      // io-005 reproduction 1, and what ACCEPTANCE scenario 11 step 2 builds by hand.
      'a Union placed away from the origin',
      () => {
        const { byId } = evaluate([
          { id: 'cyl', op: 'primitive.cylinder', params: { diameter: 40, height: 50, center: [-100.89, 66.93, 25] } },
          { id: 'cube', op: 'primitive.cuboid', params: { size: [40, 40, 40], center: [-95, 75, 20] } },
          { id: 'u', op: 'boolean.union', target: 'cyl', operands: ['cube'] },
        ])
        return byId.get('u')
      },
    ],
    [
      // A Group body, exported as its combine()d solid.
      'a placed hardware.bolt (m10 hex, 30 long)',
      () => {
        const { byId } = evaluate([{ id: 'b', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 30 } }])
        return byId.get('b')
      },
    ],
    [
      // The largest body the library can build, and the worst measured case (271 of 920).
      'a raspberrypi.bplus',
      () => {
        const { byId } = evaluate([{ id: 'p', op: 'raspberrypi.bplus', params: {} }])
        return byId.get('p')
      },
    ],
    [
      // io-003's own two measured shapes. The kernel path was always right about these and
      // the render mesh never was, so they are the closed finding this task re-checks.
      "io-003's union (a 20 mm cube and a Ø12 cylinder)",
      () => {
        const { byId } = evaluate([
          { id: 'cube', op: 'primitive.cuboid', params: { size: [20, 20, 20] } },
          { id: 'cyl', op: 'primitive.cylinder', params: { diameter: 12, height: 40, center: [10, 0, 0] } },
          { id: 'u', op: 'boolean.union', target: 'cube', operands: ['cyl'] },
        ])
        return byId.get('u')
      },
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
    ],
  ]

  for (const [label, make] of shapes) {
    it(`writes ${label} as a closed manifold .glb`, async () => {
      const geometry = make()
      const glb = parseGlb((await exportGltf([body('Part 1', geometry)])).bytes)
      const triangles = trianglesOfGlb(glb)

      // The bar io-005 was filed for.
      expect(openEdges(triangles).open, 'undirected edges not used by exactly two faces').toBe(0)

      // ...without having quietly changed the solid to get there.
      const kernelVolume = volumeOf(geometry)
      expect(Math.abs(signedVolume(triangles) / kernelVolume - 1)).toBeLessThan(1e-4)
      expect(signedVolume(triangles), 'outward winding, so the volume is positive').toBeGreaterThan(0)
      expect(degenerateTriangles(triangles), 'no zero-area triangles introduced by the repair').toBe(0)

      const [kernelMin, kernelMax] = boundsOf(geometry)
      const [min, max] = boundsOfTriangles(triangles)
      for (let axis = 0; axis < 3; axis += 1) {
        expect(min[axis]).toBeCloseTo(kernelMin[axis], 2)
        expect(max[axis]).toBeCloseTo(kernelMax[axis], 2)
      }
    })
  }

  it('leaves a body that was already closed exactly as it was', async () => {
    // A plain cuboid has no T-junction to repair, so the repair must be a no-op rather
    // than a re-triangulation: 12 triangles, not 24. This is what keeps a centroid fan
    // from being applied where a corner fan was already fine.
    const result = await exportGltf([body('Cube 1', primitives.cuboid({ size: [10, 10, 10] }))])
    expect(result.triangleCount).toBe(12)
    const triangles = trianglesOfGlb(parseGlb(result.bytes))
    expect(triangles).toHaveLength(12)
    expect(openEdges(triangles).open).toBe(0)
    expect(degenerateTriangles(triangles)).toBe(0)
  })

  it('still writes a multi-body scene as one root with one mesh node per body', async () => {
    // The repair runs per solid, so it is exactly the kind of change that could turn one
    // file into N — assert the file shape survives it, closed geometry and all.
    const { byId } = evaluate([
      { id: 'cube', op: 'primitive.cuboid', params: { size: [20, 20, 20] } },
      { id: 'cyl', op: 'primitive.cylinder', params: { diameter: 12, height: 40, center: [10, 0, 0] } },
      { id: 'u', op: 'boolean.union', target: 'cube', operands: ['cyl'] },
      { id: 'bore', op: 'primitive.cylinder', params: { diameter: 6, height: 40, center: [60, 0, 0] } },
      { id: 'plate', op: 'primitive.cuboid', params: { size: [30, 30, 10], center: [60, 0, 0] } },
      { id: 'd', op: 'boolean.subtract', target: 'plate', operands: ['bore'] },
    ])
    const glb = parseGlb(
      (await exportGltf([body('Union 1', byId.get('u')), body('Plate 1', byId.get('d'))])).bytes
    )
    expect(glb.json.scenes[glb.json.scene ?? 0].nodes, 'one root').toHaveLength(1)
    expect(glb.json.meshes).toHaveLength(2)
    const names = glb.json.nodes.map((/** @type {any} */ node) => node.name)
    expect(names).toContain('Union 1')
    expect(names).toContain('Plate 1')
    // Two closed shells in one file read as 0 open edges together, since neither shares
    // an edge with the other.
    expect(openEdges(trianglesOfGlb(glb)).open).toBe(0)
    expect(degenerateTriangles(trianglesOfGlb(glb))).toBe(0)
  })
})
