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
 * Framework-free and pure.
 *
 * @module io/meshPart
 */

import { MESH_ASSET_OP, decodeMeshAsset, meshBounds } from './meshAsset.js'
import { USER_PART_PREFIX, slugify } from '../core/userPart.js'

/** The op that builds a body from an `asset.mesh`. */
export const IMPORT_MESH_OP = 'import.mesh'

/** The id of the `import.mesh` record inside a mesh part — the part's `result`. */
export const MESH_MODEL_ID = 'model'

/** The units **Import model file…** offers, as millimetres per file unit. */
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
 * @param {{ records: readonly any[] }} definition
 * @returns {{ asset: any, model: any } | null}
 */
function meshRecordsOf(definition) {
  const records = Array.isArray(definition?.records) ? definition.records : []
  const model = records.find((record) => record?.op === IMPORT_MESH_OP)
  if (model === undefined) return null
  const asset = records.find((record) => record?.op === MESH_ASSET_OP && record.id === model.target)
  return asset === undefined ? null : { asset, model }
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
  const { asset, model } = found
  const unitScale = typeof model.params?.unitScale === 'number' ? model.params.unitScale : 1
  const units = /** @type {MeshUnits | undefined} */ (
    /** @type {MeshUnits[]} */ (Object.keys(UNIT_SCALES)).find((key) => UNIT_SCALES[key] === unitScale)
  )
  return {
    assetId: asset.id,
    name: typeof model.params?.name === 'string' ? model.params.name : '',
    triangleCount: asset.params?.triangleCount ?? 0,
    unitScale,
    units: units ?? null,
    unitsConfirmed: model.params?.unitsConfirmed === true,
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
  if (meshRecordsOf(definition) === null) throw new Error(`${definition.name} is not an imported model`)
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
 * "42 × 18 × 6 mm". Decodes the asset (validated), so call it once per row, not per frame.
 *
 * @param {{ records: readonly any[] }} definition
 * @returns {[number, number, number]}
 * @throws {Error} When the part is not a mesh part, or its asset fails validation.
 */
export function meshPartSizeMm(definition) {
  const found = meshRecordsOf(definition)
  if (found === null) throw new Error('not an imported model')
  const { positions } = decodeMeshAsset(found.asset)
  const { min, max } = meshBounds(positions)
  const scale = typeof found.model.params?.unitScale === 'number' ? found.model.params.unitScale : 1
  return [(max[0] - min[0]) * scale, (max[1] - min[1]) * scale, (max[2] - min[2]) * scale]
}
