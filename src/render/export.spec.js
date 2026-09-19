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
import { add, createGroup } from '../core/kernel/group.js'
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
