// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `asset.mesh` → `import.mesh` pair in the kernel (`TODO/io-009`): an imported model's
 * stored triangles in, a `Geom3` out.
 *
 * ## Two ops, so the mesh stays source data
 *
 * Inside a mesh part (`src/io/meshPart.js`) the records are `[asset.mesh, import.mesh]`. The
 * `asset.mesh` build validates and decodes its params into a {@link MeshValue} — not a
 * solid, never named, never a body — and `import.mesh` takes it as its `target` and builds
 * the body. So the body is derived like every other body, the asset is what it is derived
 * from, and "never persist a mesh as document state" holds: what is persisted is the
 * validator's canonical encoding, and the solid is rebuilt from it.
 *
 * ## Placement
 *
 * `unitScale` (millimetres per file unit — STL has no units) is applied first; then, with
 * `recenter` (the default), the mesh is moved so its bounding box is centred on X = Y = 0 with
 * its lowest point on Z = 0. A scan's origin is wherever the scanner left it; this puts the
 * part *on* the ground plane under the drop point instead.
 *
 * ## Watertight
 *
 * Every triangle becomes a polygon whose corners are **the same vertex arrays** wherever the
 * weld shared them, so coincident corners are bit-identical and the export repair
 * (`../watertight.js`, run by `export.js` before serializing) sees closed edges. The repair
 * itself is not run here: it is for serialization only and must not feed a boolean.
 *
 * ## Reuse
 *
 * A part's expansion copies its records on every fold, so neither op can lean on the fold
 * cache's record identity. Instead `meshAsset.js` memoises the decode by the data string
 * itself (after re-checking every field), and the build is memoised by the decoded value and
 * placement, a few entries each. Geometry values are
 * immutable in this kernel, so handing the same `Geom3` to two folds is safe.
 *
 * @module core/kernel/recipes/importMesh
 */

import modeling from '@jscad/modeling'

import { decodeMeshAsset } from '../../../io/meshAsset.js'

const { geom3 } = modeling.geometries

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../../../io/meshAsset.js').IndexedMesh} IndexedMesh */

/**
 * What an `asset.mesh` record folds to: decoded, validated triangles. Only `import.mesh`
 * consumes one.
 *
 * @typedef {object} MeshValue
 * @property {'mesh'} kind
 * @property {Float32Array} positions
 * @property {Uint32Array | Uint16Array} indices
 */

/** The narrowest and widest unit scale accepted (millimetres per file unit). */
export const UNIT_SCALE_RANGE = Object.freeze({ min: 1e-3, max: 1e3 })

const BUILD_MEMO_SIZE = 4

/** @type {WeakMap<Float32Array, MeshValue>} decoded positions (shared by `meshAsset.js`'s memo) → value */
const decoded = new WeakMap()
/** @type {WeakMap<MeshValue, Map<string, Geom3>>} */
const built = new WeakMap()
/** @type {MeshValue[]} The values `built` holds builds for, oldest first. */
const builtOrder = []

/**
 * Whether a fold value is a decoded mesh.
 *
 * @param {unknown} value
 * @returns {value is MeshValue}
 */
export function isMeshValue(value) {
  return value !== null && typeof value === 'object' && /** @type {any} */ (value).kind === 'mesh'
}

/**
 * The `asset.mesh` build: validate and decode the params into a {@link MeshValue}.
 *
 * @param {Record<string, any>} params
 * @returns {MeshValue}
 * @throws {Error} naming why the data was refused.
 */
export function meshValueOf(params) {
  /** @type {IndexedMesh} */
  let mesh
  try {
    // Every field, count and cap is checked on every call, before `meshAsset.js`'s own memo
    // can answer — so a memo hit can never skip a refusal.
    mesh = decodeMeshAsset(params)
  } catch (error) {
    throw new Error(`asset.mesh: ${error instanceof Error ? error.message : String(error)}`)
  }
  const known = decoded.get(mesh.positions)
  if (known !== undefined) return known
  /** @type {MeshValue} */
  const value = Object.freeze({ kind: /** @type {'mesh'} */ ('mesh'), positions: mesh.positions, indices: mesh.indices })
  decoded.set(mesh.positions, value)
  return value
}

/**
 * Read and check `import.mesh`'s placement params.
 *
 * @param {Record<string, any>} params
 * @returns {{ unitScale: number, recenter: boolean }}
 * @throws {Error}
 */
function placementOf(params) {
  const unitScale = params?.unitScale ?? 1
  if (typeof unitScale !== 'number' || !Number.isFinite(unitScale) || unitScale < UNIT_SCALE_RANGE.min || unitScale > UNIT_SCALE_RANGE.max) {
    throw new Error(
      `import.mesh: unitScale must be a number from ${UNIT_SCALE_RANGE.min} to ${UNIT_SCALE_RANGE.max} (millimetres per file unit), got ${JSON.stringify(unitScale)}`
    )
  }
  const recenter = params?.recenter ?? true
  if (typeof recenter !== 'boolean') throw new Error('import.mesh: recenter must be true or false')
  return { unitScale, recenter }
}

/**
 * Build the solid for a decoded mesh at a placement. Pure; memoised.
 *
 * @param {MeshValue} mesh
 * @param {{ unitScale: number, recenter: boolean }} placement
 * @returns {Geom3}
 */
export function solidFromMesh(mesh, placement) {
  const key = `${placement.unitScale}|${placement.recenter}`
  const known = built.get(mesh)?.get(key)
  if (known !== undefined) return known

  const { positions, indices } = mesh
  const { unitScale, recenter } = placement
  const vertexCount = positions.length / 3
  let offsetX = 0
  let offsetY = 0
  let offsetZ = 0
  if (recenter) {
    let minX = Infinity
    let minY = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const x = positions[vertex * 3] * unitScale
      const y = positions[vertex * 3 + 1] * unitScale
      const z = positions[vertex * 3 + 2] * unitScale
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (z < minZ) minZ = z
    }
    offsetX = -(minX + maxX) / 2
    offsetY = -(minY + maxY) / 2
    offsetZ = -minZ
  }
  /** @type {[number, number, number][]} One array per welded vertex, shared by every polygon using it. */
  const vertices = new Array(vertexCount)
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    vertices[vertex] = [
      positions[vertex * 3] * unitScale + offsetX + 0,
      positions[vertex * 3 + 1] * unitScale + offsetY + 0,
      positions[vertex * 3 + 2] * unitScale + offsetZ + 0,
    ]
  }
  const polygons = new Array(indices.length / 3)
  for (let triangle = 0; triangle < polygons.length; triangle += 1) {
    polygons[triangle] = {
      vertices: [vertices[indices[triangle * 3]], vertices[indices[triangle * 3 + 1]], vertices[indices[triangle * 3 + 2]]],
    }
  }
  const solid = geom3.create(/** @type {any} */ (polygons))

  let byPlacement = built.get(mesh)
  if (byPlacement === undefined) {
    byPlacement = new Map()
    built.set(mesh, byPlacement)
    builtOrder.push(mesh)
    if (builtOrder.length > BUILD_MEMO_SIZE) built.delete(/** @type {MeshValue} */ (builtOrder.shift()))
  }
  byPlacement.set(key, solid)
  return solid
}

/**
 * The `import.mesh` build: its target's decoded mesh, placed.
 *
 * @param {{ params: Record<string, any>, inputs: readonly any[] }} args `inputs` are raw
 *   operands (`{ value, pieces }`) — the registry entry asks for them un-combined.
 * @returns {Geom3}
 * @throws {Error} For a target that is not an `asset.mesh`, or bad placement params.
 */
export function importMesh({ params, inputs }) {
  const operand = inputs[0]
  const value = operand && typeof operand === 'object' && 'value' in operand ? operand.value : operand
  if (!isMeshValue(value)) {
    throw new Error('import.mesh: its target must be an asset.mesh record (the imported model\'s stored triangles)')
  }
  return solidFromMesh(value, placementOf(params))
}
