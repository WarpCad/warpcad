// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * An imported model as a library part (`TODO/io-009`): a `user.<slug>` definition whose
 * records are `[asset.mesh, import.mesh]`, so it rides the existing `core-037` machinery —
 * save, rename, delete, export part file, load warnings, composite drop — unchanged. There is
 * no second kind of library entry.
 *
 * The part exposes **no parameters**: a mesh has no parametric sizes, and the Inspector says
 * so. Its one setting is the **Units** the file is read in (STL carries none), which lives on
 * the `import.mesh` record's `unitScale` and is changed in the definition — a new version —
 * before placement, never as a per-instance edit. `unitsConfirmed` is what turns the row's
 * "Units assumed: mm" badge off.
 *
 * ## An assembly (`TODO/io-024`)
 *
 * A 3MF can hold many placed components. Its part is `[asset.mesh …, import.mesh …,
 * group.assemble]`: one `asset.mesh` per **distinct** mesh, one `import.mesh` per placed part,
 * each with its own `matrix` (millimetres, applied after `unitScale`), and one flat
 * `group.assemble` named `model` over them, so the existing group selection, sub-part addressing,
 * Align and Subtract work on each part unchanged. `recenter` is off on every record: the whole
 * assembly's offset is baked into each matrix at import, so it lands centred and the parts keep
 * their places relative to each other. A 3MF of one part is the ordinary `[asset.mesh,
 * import.mesh]` pair. A 3MF states its units, so its records carry `unitsStated: true`, and
 * {@link withUnits} refuses to re-read it.
 *
 * Framework-free and pure.
 *
 * @module io/meshPart
 */

import { MESH_ASSET_OP, decodeMeshAsset, meshBounds } from './meshAsset.js'
import { emptyPlacedBounds, growPlacedBounds } from './meshMatrix.js'
import { USER_PART_PREFIX, slugify } from '../core/userPart.js'

/** The op that builds a body from an `asset.mesh`. */
export const IMPORT_MESH_OP = 'import.mesh'

/** The id of the `import.mesh` record inside a mesh part — the part's `result`. */
export const MESH_MODEL_ID = 'model'

/** The units **File → Import model…** offers, as millimetres per file unit. */
export const UNIT_SCALES = Object.freeze({ mm: 1, cm: 10, inch: 25.4 })

/** @typedef {keyof typeof UNIT_SCALES} MeshUnits */
/** @typedef {import('./meshAsset.js').MeshAssetRecord} MeshAssetRecord */

/**
 * @typedef {object} MeshPartDefinition A plain part definition, before `validateUserPart`.
 * @property {string} op
 * @property {string} name
 * @property {number} version
 * @property {string} result
 * @property {any[]} records
 * @property {any[]} params
 */

/**
 * @typedef {object} MeshPartInfo What the Library row shows for a mesh part.
 * @property {string} assetId
 * @property {string} name The file's base name, as imported.
 * @property {number} triangleCount
 * @property {number} unitScale Millimetres per file unit.
 * @property {MeshUnits | null} units Which offered unit that scale is; `null` for another one
 *   (set by the assistant, say).
 * @property {boolean} unitsConfirmed Whether the person chose or confirmed the units.
 * @property {boolean} unitsStated Whether the file stated its units (3MF does), so there is
 *   nothing to choose (`TODO/io-024`).
 * @property {number} partCount Placed meshes: 1 for an STL, one per component for a 3MF.
 * @property {string} sizeKey What the size depends on: a cache key for {@link meshPartSizeMm}.
 */

/**
 * @typedef {object} AssemblyPart One placed mesh of an imported assembly.
 * @property {string} name
 * @property {string} assetId The `asset.mesh` it draws.
 * @property {number} triangleCount
 * @property {readonly number[]} matrix 16 numbers, `mat4` order, millimetres, offset baked in.
 */

/**
 * The part an import becomes.
 *
 * @param {{ record: MeshAssetRecord, name: string, triangleCount: number, op?: string, units?: MeshUnits }} options
 *   `op` defaults to `user.<slug of name>`; the store passes a free one when that is taken.
 * @returns {MeshPartDefinition}
 */
export function meshPartDefinition({ record, name, triangleCount, op, units = 'mm' }) {
  const label = String(name).trim() || 'Imported model'
  return {
    op: op ?? `${USER_PART_PREFIX}${slugify(label)}`,
    name: label,
    version: 1,
    result: MESH_MODEL_ID,
    records: [
      { id: record.id, op: MESH_ASSET_OP, params: { ...record.params } },
      {
        id: MESH_MODEL_ID,
        op: IMPORT_MESH_OP,
        target: record.id,
        params: { name: label, triangleCount, unitScale: UNIT_SCALES[units], unitsConfirmed: false, recenter: true },
      },
    ],
    params: [],
  }
}

/**
 * The part an imported assembly becomes (`TODO/io-024`): one `asset.mesh` per distinct mesh, one
 * `import.mesh` per part, and a flat `group.assemble` over them — or, for one part, the ordinary
 * mesh pair.
 *
 * @param {{ assets: readonly MeshAssetRecord[], parts: readonly AssemblyPart[], name: string, op?: string, unitScale?: number }} options
 * @returns {MeshPartDefinition}
 */
export function meshAssemblyDefinition({ assets, parts, name, op, unitScale = 1 }) {
  const label = String(name).trim() || 'Imported model'
  if (parts.length === 0) throw new Error('an assembly needs at least one part')
  const single = parts.length === 1
  const placed = parts.map((part, index) => ({
    id: single ? MESH_MODEL_ID : `p${index + 1}`,
    op: IMPORT_MESH_OP,
    target: part.assetId,
    params: {
      name: single ? label : part.name,
      triangleCount: part.triangleCount,
      unitScale,
      unitsConfirmed: true,
      unitsStated: true,
      recenter: false,
      matrix: [...part.matrix],
    },
  }))
  const used = new Set(parts.map((part) => part.assetId))
  return {
    op: op ?? `${USER_PART_PREFIX}${slugify(label)}`,
    name: label,
    version: 1,
    result: MESH_MODEL_ID,
    records: [
      ...assets.filter((asset) => used.has(asset.id)).map((asset) => ({ id: asset.id, op: MESH_ASSET_OP, params: { ...asset.params } })),
      ...placed,
      ...(single
        ? []
        : [{ id: MESH_MODEL_ID, op: 'group.assemble', operands: placed.map((record) => record.id), params: { names: parts.map((part) => part.name) } }]),
    ],
    params: [],
  }
}

/**
 * Every `import.mesh` of a mesh part, each with its asset — or `null` when the part is not one.
 * Every one of them, not the first: the first is one component of an assembly (`TODO/io-024`).
 *
 * @param {{ records: readonly any[] }} definition
 * @returns {{ asset: any, model: any }[] | null}
 */
function meshRecordsOf(definition) {
  const records = Array.isArray(definition?.records) ? definition.records : []
  const assets = new Map(records.filter((record) => record?.op === MESH_ASSET_OP).map((record) => [record.id, record]))
  const found = []
  for (const model of records) {
    if (model?.op !== IMPORT_MESH_OP) continue
    const asset = assets.get(model.target)
    if (asset === undefined) return null
    found.push({ asset, model })
  }
  return found.length === 0 ? null : found
}

/**
 * The Library row's facts for a mesh part, or `null` when the part is not one.
 *
 * @param {{ records: readonly any[] }} definition
 * @returns {MeshPartInfo | null}
 */
export function meshPartInfo(definition) {
  const found = meshRecordsOf(definition)
  if (found === null) return null
  const { asset, model } = found[0]
  const unitScale = typeof model.params?.unitScale === 'number' ? model.params.unitScale : 1
  const units = /** @type {MeshUnits | undefined} */ (
    /** @type {MeshUnits[]} */ (Object.keys(UNIT_SCALES)).find((key) => UNIT_SCALES[key] === unitScale)
  )
  const single = found.length === 1
  const name = single && typeof model.params?.name === 'string' ? model.params.name : String(/** @type {any} */ (definition).name ?? '')
  return {
    assetId: asset.id,
    name,
    triangleCount: found.reduce((total, entry) => total + (entry.asset.params?.triangleCount ?? 0), 0),
    unitScale,
    units: units ?? null,
    unitsConfirmed: found.every((entry) => entry.model.params?.unitsConfirmed === true),
    unitsStated: found.every((entry) => entry.model.params?.unitsStated === true),
    partCount: found.length,
    sizeKey: single
      ? `${asset.id}|${unitScale}`
      : `${String(/** @type {any} */ (definition).op ?? '')}@${String(/** @type {any} */ (definition).version ?? '')}`,
  }
}

/**
 * The definition read in other units — or the same units, confirmed. A new version, so a
 * project that already placed the old one keeps it (`core-037`'s version rule).
 *
 * @template {MeshPartDefinition} T
 * @param {T} definition A mesh part.
 * @param {MeshUnits} units
 * @returns {T}
 * @throws {Error} For units not offered, or a definition that is not a mesh part.
 */
export function withUnits(definition, units) {
  if (!Object.hasOwn(UNIT_SCALES, units)) throw new Error(`units must be one of ${Object.keys(UNIT_SCALES).join(', ')}`)
  const found = meshRecordsOf(definition)
  if (found === null) throw new Error(`${definition.name} is not an imported model`)
  if (found.some((entry) => entry.model.params?.unitsStated === true)) {
    throw new Error(`${definition.name}'s file states its units, so they are not chosen here`)
  }
  return {
    ...definition,
    version: definition.version + 1,
    records: definition.records.map((record) =>
      record.op === IMPORT_MESH_OP
        ? { ...record, params: { ...record.params, unitScale: UNIT_SCALES[units], unitsConfirmed: true } }
        : record
    ),
  }
}

/**
 * A mesh part's bounding-box size in millimetres, at its current units — the row's
 * "42 × 18 × 6 mm"; for an assembly, the whole model's box. Decodes the assets (validated), so
 * call it once per row, not per frame.
 *
 * @param {{ records: readonly any[] }} definition
 * @returns {[number, number, number]}
 * @throws {Error} When the part is not a mesh part, or its asset fails validation.
 */
export function meshPartSizeMm(definition) {
  const found = meshRecordsOf(definition)
  if (found === null) throw new Error('not an imported model')
  if (found.length === 1 && found[0].model.params?.matrix === undefined) {
    const { positions } = decodeMeshAsset(found[0].asset)
    const { min, max } = meshBounds(positions)
    const scale = typeof found[0].model.params?.unitScale === 'number' ? found[0].model.params.unitScale : 1
    return [(max[0] - min[0]) * scale, (max[1] - min[1]) * scale, (max[2] - min[2]) * scale]
  }
  // An assembly: every part where its matrix puts it (`TODO/io-024`).
  const bounds = emptyPlacedBounds()
  for (const { asset, model } of found) {
    const scale = typeof model.params?.unitScale === 'number' ? model.params.unitScale : 1
    growPlacedBounds(bounds, decodeMeshAsset(asset).positions, scale, Array.isArray(model.params?.matrix) ? model.params.matrix : null)
  }
  const { min, max } = bounds
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
}
