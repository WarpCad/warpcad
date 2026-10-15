// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `kit.phone` composite recipe — a stand-in for a phone in a case, to *subtract*
 * from a plate so the phone can lie flat despite its camera plateau.
 *
 * It is a stand-in, not a model of any handset: a rounded-rectangle slab (the phone and
 * its case) with a second, shallower rounded-rectangle block fused to its **back** face
 * at the top end (the camera plateau). Defaults are an iPhone 17 Pro in a TechWeave case,
 * as best estimated; every dimension is a parameter because the case, not the phone,
 * sets most of them and nobody should trust a spec sheet over calipers.
 *
 * ## Orientation
 *
 * Back face down. The body's underside sits on the plateau's underside plus
 * `plateauHeight`, so the plateau protrudes *below* the slab, toward −Z, exactly as the
 * phone does when it lies screen-up. Placed with the slab's underside level with a
 * plate's top face and subtracted from the plate, only the plateau cuts — a pocket of
 * `plateauHeight` deep, with the plate's top face left flat everywhere else the phone
 * rests. The plateau sits at the +Y end; rotate the stand-in about Z for the other end.
 *
 * ## Two paths (`TODO/core-057`)
 *
 * - **Model path** — a record that carries `model`, `case` or any enlarge/clearance param.
 *   The handset's published size comes from `phoneModels.js`, a case preset adds its
 *   margins, `caseEnlarge*` add more, and the result is **named records, not a union**:
 *   `body` and one part per raised feature (`plateau`, `plateau2`, …), so a Subtract can
 *   address the plateau alone with `{ id, pieces: 'plateau' }`.
 * - **Legacy path** — a record with none of those params (every document saved before
 *   core-057): the old single fused `phone` body, byte for byte.
 *
 * ### Which numbers win on the model path
 *
 * A numeric param (`width`, `plateauHeight`, …) **present in the record is an override**
 * and is kept when the model or case changes; an absent one follows the table. The
 * Inspector only writes a field the user actually changed, so "present" means "edited".
 * One migration rule: a record carrying the **complete** legacy set of eight numerics
 * (what the old Library wrote) treats each one still equal to the old default as
 * never-edited, so choosing a model on an old record changes its size.
 *
 * Like `kit.board`, nothing here builds geometry: it expands into other op records and
 * is centred on its bounding box so a Library drop lands under the pointer.
 *
 * @module core/kernel/recipes/kit.phone
 */

import { centringVector, requireCornerRadiusMm, requirePositiveMm } from './kit.board.js'
import {
  DEFAULT_PHONE_MODEL,
  LEGACY_PHONE_CASE,
  PHONE_CASES,
  PHONE_MODELS,
  TECHWEAVE_IPHONE_17_PRO,
} from './phoneModels.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'kit.phone'

/**
 * How far the plateau prism is extruded *into* the slab so the union overlaps instead of
 * meeting face to face — coplanar faces are the classic BSP non-manifold seam
 * (`kit.boardFrame.js` explains the same hazard). It is inside the slab, so it changes
 * nothing visible.
 */
const WELD_OVERLAP_MM = 1

/**
 * Expand a `kit.phone` document line into the op records that define it — the model path
 * when the record names a model, a case or an enlarge, the legacy single body otherwise.
 *
 * @param {object} params
 * @param {number} [params.width] Phone-in-case width, X, mm.
 * @param {number} [params.length] Phone-in-case length, Y, mm.
 * @param {number} [params.thickness] Slab thickness excluding the plateau, Z, mm.
 * @param {number} [params.cornerRadius] Slab corner radius, mm.
 * @param {number} [params.plateauWidth] Camera plateau width, X, mm.
 * @param {number} [params.plateauLength] Camera plateau length, Y, mm.
 * @param {number} [params.plateauHeight] How far the plateau protrudes below the slab, mm.
 * @param {number} [params.plateauCornerRadius] Plateau corner radius, mm.
 * @param {string} [params.model] Handset id from `phoneModels.js` (model path).
 * @param {string} [params.case] Case preset id (model path).
 * @param {number} [params.caseEnlarge] Added to all three outer dimensions, mm.
 * @param {number} [params.caseEnlargeX] Added to the width on top of `caseEnlarge`, mm.
 * @param {number} [params.caseEnlargeY] Added to the length on top of `caseEnlarge`, mm.
 * @param {number} [params.caseEnlargeZ] Added to the thickness on top of `caseEnlarge`, mm.
 * @param {number} [params.plateauClearance] Slack added around every plateau, mm.
 * @param {[number, number, number]} [params.center] Bounding-box centre; defaults to origin.
 * @returns {OpRecord[]}
 */
export function phone(params) {
  if (usesModelPath(params)) return buildPhone(params)
  return legacyPhone(params)
}

/**
 * The pre-core-057 recipe: one fused body named `phone`.
 *
 * @param {Record<string, any>} params
 * @returns {OpRecord[]}
 */
function legacyPhone(params) {
  const {
    width = 77,
    length = 157,
    thickness = 9,
    cornerRadius = 12,
    plateauWidth = 74,
    plateauLength = 46,
    plateauHeight = 4,
    plateauCornerRadius = 10,
    center,
  } = params

  requirePositiveMm(width, 'width', OP)
  requirePositiveMm(length, 'length', OP)
  requirePositiveMm(thickness, 'thickness', OP)
  requirePositiveMm(plateauWidth, 'plateauWidth', OP)
  requirePositiveMm(plateauLength, 'plateauLength', OP)
  requirePositiveMm(plateauHeight, 'plateauHeight', OP)
  requireCornerRadiusMm(cornerRadius, Math.min(width, length), 'cornerRadius', OP)
  requireCornerRadiusMm(
    plateauCornerRadius,
    Math.min(plateauWidth, plateauLength),
    'plateauCornerRadius',
    OP
  )
  if (plateauWidth > width || plateauLength > length) {
    throw new Error(
      `${OP}: the plateau (${plateauWidth} × ${plateauLength} mm) must fit inside the ` +
        `phone (${width} × ${length} mm)`
    )
  }

  // The plateau hugs the +Y end: its far edge is flush with the slab's.
  const plateauY = (length - plateauLength) / 2

  return [
    {
      id: 'phone.body.profile',
      op: 'profile.roundedRectangle',
      params: { size: [width, length], roundRadius: cornerRadius },
    },
    {
      id: 'phone.body.prism',
      op: 'profile.extrudeLinear',
      params: { height: thickness },
      target: 'phone.body.profile',
    },
    {
      id: 'phone.body',
      op: 'transform.translate',
      params: { vector: [0, 0, plateauHeight] },
      target: 'phone.body.prism',
    },
    {
      id: 'phone.plateau.profile',
      op: 'profile.roundedRectangle',
      params: { size: [plateauWidth, plateauLength], roundRadius: plateauCornerRadius },
    },
    {
      id: 'phone.plateau.prism',
      op: 'profile.extrudeLinear',
      params: { height: plateauHeight + WELD_OVERLAP_MM },
      target: 'phone.plateau.profile',
    },
    {
      id: 'phone.plateau',
      op: 'transform.translate',
      params: { vector: [0, plateauY, 0] },
      target: 'phone.plateau.prism',
    },
    {
      id: 'phone.solid',
      op: 'boolean.union',
      params: {},
      target: 'phone.body',
      operands: ['phone.plateau'],
    },
    {
      id: 'phone',
      op: 'transform.translate',
      params: { vector: centringVector(center, thickness + plateauHeight, OP) },
      target: 'phone.solid',
      name: 'phone',
    },
  ]
}

// ---------------------------------------------------------------------------------------
// TODO/core-057: the model path.
// ---------------------------------------------------------------------------------------

/** Params whose presence puts a record on the model path. */
const MODEL_PATH_KEYS = Object.freeze([
  'model',
  'case',
  'caseEnlarge',
  'caseEnlargeX',
  'caseEnlargeY',
  'caseEnlargeZ',
  'plateauClearance',
])

/** What the pre-core-057 Library wrote, key by key. */
const LEGACY_NUMERICS = Object.freeze({
  width: 77,
  length: 157,
  thickness: 9,
  cornerRadius: 12,
  plateauWidth: 74,
  plateauLength: 46,
  plateauHeight: 4,
  plateauCornerRadius: 10,
})

/**
 * @param {Record<string, any>} params
 * @returns {boolean}
 */
function usesModelPath(params) {
  return MODEL_PATH_KEYS.some((key) => params[key] !== undefined && params[key] !== null)
}

/**
 * A non-negative, finite millimetre value or a clear error naming the op and parameter.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function requireNonNegativeMm(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${OP}: ${label} must be a non-negative number of millimetres, got ${String(value)}`)
  }
  return value
}

/**
 * Numeric overrides that count: present, and not an untouched legacy default when the
 * record still carries the whole legacy set (see the module note).
 *
 * @param {Record<string, any>} params
 * @returns {Record<string, number>}
 */
function overridesOf(params) {
  const keys = Object.keys(LEGACY_NUMERICS)
  const wholeLegacySet = keys.every((key) => typeof params[key] === 'number')
  /** @type {Record<string, number>} */
  const overrides = {}
  for (const key of keys) {
    const value = params[key]
    if (value === undefined || value === null) continue
    if (wholeLegacySet && value === LEGACY_NUMERICS[/** @type {keyof typeof LEGACY_NUMERICS} */ (key)]) continue
    overrides[key] = value
  }
  return overrides
}

/**
 * Resolve the handset, the case and every size **before** the enlarge fields — what the
 * Inspector shows in a numeric field the record does not carry.
 *
 * @param {Record<string, any>} params
 * @param {readonly import('./phoneModels.js').PhoneModel[]} [models]
 * @returns {{ model: import('./phoneModels.js').PhoneModel, caseId: string, width: number,
 *   length: number, thickness: number, cornerRadius: number,
 *   plateaus: import('./phoneModels.js').PhonePlateau[], flush: boolean }}
 */
export function resolvePhone(params, models = PHONE_MODELS) {
  const modelId = params.model ?? DEFAULT_PHONE_MODEL
  const model = models.find((row) => row.id === modelId)
  if (!model) {
    throw new Error(
      `${OP}: unknown model "${String(modelId)}" — expected one of ` + models.map((row) => row.id).join(', ')
    )
  }
  const caseId = params.case ?? LEGACY_PHONE_CASE
  const preset = Object.hasOwn(PHONE_CASES, caseId) ? PHONE_CASES[caseId] : undefined
  if (!preset) {
    throw new Error(
      `${OP}: unknown case "${String(caseId)}" — expected one of ` + Object.keys(PHONE_CASES).join(', ')
    )
  }
  const overrides = overridesOf(params)
  const twill = caseId === LEGACY_PHONE_CASE && model.id === DEFAULT_PHONE_MODEL

  const width = overrides.width ?? model.widthMm + preset.addWidthMm
  const length = overrides.length ?? model.heightMm + preset.addLengthMm
  const thickness = overrides.thickness ?? model.depthMm + preset.addDepthMm
  const shortSide = Math.min(width, length)
  // A derived radius is clamped so a thin override cannot make the *table* invalid; an
  // explicit radius is not clamped, it is refused by name below.
  const derivedRadius = twill
    ? TECHWEAVE_IPHONE_17_PRO.cornerRadiusMm
    : Math.min(model.cornerRadiusMm + preset.addWidthMm / 2, shortSide / 2 - 0.01)
  const cornerRadius = overrides.cornerRadius ?? derivedRadius

  const principal = twill ? { ...model.plateaus[0], ...TECHWEAVE_IPHONE_17_PRO.plateau } : model.plateaus[0]
  const plateaus = [
    {
      ...principal,
      widthMm: overrides.plateauWidth ?? principal.widthMm,
      lengthMm: overrides.plateauLength ?? principal.lengthMm,
      heightMm: overrides.plateauHeight ?? principal.heightMm,
      cornerRadiusMm: overrides.plateauCornerRadius ?? principal.cornerRadiusMm,
    },
    ...model.plateaus.slice(1),
  ]
  return { model, caseId, width, length, thickness, cornerRadius, plateaus, flush: twill }
}

/**
 * The records of the model path, with the handset table injectable so a spec can pose a
 * three-part model without the table having to ship one.
 *
 * @param {Record<string, any>} params
 * @param {readonly import('./phoneModels.js').PhoneModel[]} [models]
 * @returns {OpRecord[]}
 */
export function buildPhone(params, models = PHONE_MODELS) {
  const clearance = requireNonNegativeMm(params.plateauClearance ?? 0, 'plateauClearance')
  const all = requireNonNegativeMm(params.caseEnlarge ?? 0, 'caseEnlarge')
  const enlargeX = all + requireNonNegativeMm(params.caseEnlargeX ?? 0, 'caseEnlargeX')
  const enlargeY = all + requireNonNegativeMm(params.caseEnlargeY ?? 0, 'caseEnlargeY')
  const enlargeZ = all + requireNonNegativeMm(params.caseEnlargeZ ?? 0, 'caseEnlargeZ')

  const base = resolvePhone(params, models)
  const width = base.width + enlargeX
  const length = base.length + enlargeY
  const thickness = base.thickness + enlargeZ

  requirePositiveMm(width, 'width', OP)
  requirePositiveMm(length, 'length', OP)
  requirePositiveMm(thickness, 'thickness', OP)
  requireCornerRadiusMm(base.cornerRadius, Math.min(width, length), 'cornerRadius', OP)

  // A case grows around the handset, so the plateau keeps its place relative to the handset's
  // own +Y edge; TechWeave's plateau was flush with the slab edge and stays flush.
  const extraY = length - base.model.heightMm
  const maxHeight = Math.max(...base.plateaus.map((p) => p.heightMm))

  /** @type {OpRecord[]} */
  const records = []
  const lift = centringVector(params.center, thickness + maxHeight, OP)

  records.push(
    {
      id: 'phone.body.profile',
      op: 'profile.roundedRectangle',
      params: { size: [width, length], roundRadius: base.cornerRadius },
    },
    {
      id: 'phone.body.prism',
      op: 'profile.extrudeLinear',
      params: { height: thickness },
      target: 'phone.body.profile',
    },
    {
      id: 'phone.body',
      op: 'transform.translate',
      params: { vector: [lift[0], lift[1], lift[2] + maxHeight] },
      target: 'phone.body.prism',
      name: 'body',
    }
  )

  base.plateaus.forEach((part, index) => {
    const w = part.widthMm + 2 * clearance
    const l = part.lengthMm + 2 * clearance
    requirePositiveMm(part.widthMm, index === 0 ? 'plateauWidth' : `${part.name}.widthMm`, OP)
    requirePositiveMm(part.lengthMm, index === 0 ? 'plateauLength' : `${part.name}.lengthMm`, OP)
    requirePositiveMm(part.heightMm, index === 0 ? 'plateauHeight' : `${part.name}.heightMm`, OP)
    const gap = (base.flush && index === 0 ? part.fromTopMm : part.fromTopMm + extraY / 2) - clearance
    const centreY = length / 2 - gap - l / 2
    const EPS = 1e-9
    if (
      w > width + EPS ||
      l > length + EPS ||
      Math.abs(part.xMm) + w / 2 > width / 2 + EPS ||
      gap < -EPS ||
      gap + l > length + EPS
    ) {
      throw new Error(
        `${OP}: the plateau (${w} × ${l} mm) must fit inside the phone (${width} × ${length} mm)`
      )
    }
    const radius = part.cornerRadiusMm + clearance
    const radiusLabel = index === 0 ? 'plateauCornerRadius' : `${part.name}.cornerRadiusMm`
    requireCornerRadiusMm(Math.min(radius, Math.max(0, Math.min(w, l) / 2 - 0.01)), Math.min(w, l), radiusLabel, OP)
    const explicitRadius = index === 0 && params.plateauCornerRadius !== undefined
    if (explicitRadius) requireCornerRadiusMm(params.plateauCornerRadius, Math.min(w, l), radiusLabel, OP)
    const roundRadius = Math.min(radius, Math.max(0, Math.min(w, l) / 2 - 0.01))

    const id = `phone.${part.name}`
    records.push(
      {
        id: `${id}.profile`,
        op: 'profile.roundedRectangle',
        params: { size: [w, l], roundRadius },
      },
      {
        id: `${id}.prism`,
        op: 'profile.extrudeLinear',
        // Reaches WELD_OVERLAP_MM into the slab so the seam is never coplanar, as in the
        // legacy union: the part is a stand-in cut, so the overlap sits inside the body.
        params: { height: part.heightMm + WELD_OVERLAP_MM },
        target: `${id}.profile`,
      },
      {
        id,
        op: 'transform.translate',
        params: { vector: [lift[0] + part.xMm, lift[1] + centreY, lift[2] + (maxHeight - part.heightMm)] },
        target: `${id}.prism`,
        name: part.name,
      }
    )
  })
  return records
}

/**
 * The Library's and the Inspector's name for a placed phone: `<Model> in <Case> case`, the
 * bare model for the `None` case, plain `Phone` when no model is named.
 *
 * @param {Record<string, any>} params
 * @returns {string}
 */
export function phoneDisplayName(params) {
  if (params.model === undefined && params.case === undefined) return 'Phone'
  const model = PHONE_MODELS.find((row) => row.id === (params.model ?? DEFAULT_PHONE_MODEL))
  const preset = Object.hasOwn(PHONE_CASES, params.case ?? '') ? PHONE_CASES[params.case] : undefined
  const modelLabel = model?.label ?? 'Phone'
  if (params.case === 'none' || preset === undefined) return modelLabel
  return `${modelLabel} in ${preset.label} case`
}
