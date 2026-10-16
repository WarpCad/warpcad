// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Gear rack — derived dimensions and outline (TODO/core-043, `docs/decisions/gears.md`
 * Decisions 2 and 5).
 *
 * A rack is the spur profile's straight-line limit: as the tooth count grows without bound
 * the pitch circle becomes the pitch line and every involute flank a straight line at the
 * pressure angle. The flank comes from `./involute.js`'s {@link rackHalfWidthMmAt}, which
 * says exactly that; nothing here restates it. Depths are the gear's: addendum one module
 * above the pitch line, dedendum `module + clearance` below it (call 5), and the tooth is
 * thinned by `backlashMm / 2` on the pitch line (call 4 — the same rule as gear and ring,
 * which V1 broke, defect 8).
 *
 * ── Axis conventions ──────────────────────────────────────────────────────────────────
 * Millimetres. The tooth row runs along **+X**, the teeth point **+Y**, and the pitch line
 * is `y = 0`; the bar is centred on `x = 0` and is a **true length**: `teeth · circularPitch`
 * long, so it ends half a space beyond each end tooth's centre and two racks butted end to
 * end continue the pitch exactly. Tooth `i` is centred on `x = (i + ½ − teeth/2) · p`. The
 * backing bar is `heightMm` thick behind the root line (default `4 · module`, V1's fixed
 * `4 · addendum`, defect 11). `teeth` defaults to 10 (V1 always made 41, defect 2).
 *
 * A tooth whose flanks meet below the addendum line is clipped at the apex
 * (`'pointed-tip'`); a space whose flanks meet above the root line comes to a point there
 * (`'pointed-root'`). No tooth, or no space, throws.
 *
 * Framework-free and kernel-free: no Vue, no DOM, no three.js, no `@jscad/modeling`.
 *
 * @module core/gear/rack
 */

import {
  ADDENDUM_COEFFICIENT,
  GearParameterError,
  GearToothVanishedError,
  PRESSURE_ANGLE_RANGE_DEG,
  defaultClearanceMm,
  moduleMmToCircularPitchMm,
} from './dimensions.js'
import { rackHalfWidthMmAt } from './involute.js'

/** A rack's tooth count when none is given. */
export const DEFAULT_RACK_TEETH = 10
/** The backing bar's thickness behind the root line when none is given, in modules. */
export const DEFAULT_RACK_HEIGHT_MODULES = 4

/** @typedef {[number, number]} Vec2Mm */
/** @typedef {'pointed-tip' | 'pointed-root'} RackWarning */

/**
 * @typedef {object} RackParams
 * @property {number} [teeth=10] Integer ≥ 1 (the registry caps it at 200).
 * @property {number} moduleMm Module, mm (> 0).
 * @property {number} [pressureAngleDeg=20] Degrees, 0…45.
 * @property {number} [clearanceMm] Root depth beyond one module, mm. Default `0.25 · moduleMm`.
 * @property {number} [backlashMm=0] Total play of the rack and its pinion, mm; thins the
 *   rack tooth by half of it on the pitch line.
 * @property {number} [heightMm] The backing bar behind the root line, mm (> 0). Default
 *   `4 · moduleMm`.
 */

/**
 * @typedef {object} RackDimensions
 * @property {'rack'} kind
 * @property {number} teeth
 * @property {number} moduleMm
 * @property {number} pressureAngleDeg
 * @property {number} transversePressureAngleDeg The same angle: a rack has no helix here.
 * @property {number} clearanceMm Resolved (default applied).
 * @property {number} backlashMm
 * @property {number} heightMm Resolved (default applied).
 * @property {number} circularPitchMm `π · module`, tooth to tooth along the pitch line.
 * @property {number} lengthMm `teeth · circularPitchMm`.
 * @property {number} addendumMm
 * @property {number} dedendumMm
 * @property {number} toothThicknessAtPitchMm `circularPitch / 2 − backlash / 2`.
 * @property {number} tipYMm The tooth tip as built: `+module`, or a pointed tooth's apex.
 * @property {number} rootYMm The space bottom as built: `−(module + clearance)`, or a
 *   pointed space's apex.
 * @property {number} backYMm `rootYMm − heightMm`.
 * @property {number} tipHalfWidthMm Half the tip land; 0 when pointed.
 * @property {number} rootHalfWidthMm Half the tooth's width at `rootYMm`.
 * @property {boolean} pointedTip
 * @property {boolean} pointedRoot
 */

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 */
function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GearParameterError(`${name} must be a finite number`)
  }
  return value
}

/**
 * Derived dimensions of a rack.
 *
 * @param {RackParams} params
 * @returns {RackDimensions}
 * @throws {GearParameterError} for parameters that cannot make a rack.
 * @throws {GearToothVanishedError} when no tooth is left.
 */
export function rackDimensions(params) {
  const teeth = params.teeth ?? DEFAULT_RACK_TEETH
  if (typeof teeth !== 'number' || !Number.isInteger(teeth) || teeth < 1) {
    throw new GearParameterError('teeth must be a whole number, 1 or more')
  }
  const moduleMm = finite(params.moduleMm, 'moduleMm')
  if (!(moduleMm > 0)) throw new GearParameterError('moduleMm must be greater than 0')
  const pressureAngleDeg = finite(params.pressureAngleDeg ?? 20, 'pressureAngleDeg')
  const [minDeg, maxDeg] = PRESSURE_ANGLE_RANGE_DEG
  if (pressureAngleDeg < minDeg || pressureAngleDeg > maxDeg) {
    throw new GearParameterError(`pressureAngleDeg must be between ${minDeg}° and ${maxDeg}°`)
  }
  const clearanceMm = finite(params.clearanceMm ?? defaultClearanceMm(moduleMm), 'clearanceMm')
  const backlashMm = finite(params.backlashMm ?? 0, 'backlashMm')
  const heightMm = finite(params.heightMm ?? DEFAULT_RACK_HEIGHT_MODULES * moduleMm, 'heightMm')
  if (!(heightMm > 0)) throw new GearParameterError('heightMm must be greater than 0 — a rack needs a backing bar')

  const circularPitchMm = moduleMmToCircularPitchMm(moduleMm)
  const toothThicknessAtPitchMm = circularPitchMm / 2 - backlashMm / 2
  if (!(toothThicknessAtPitchMm > 0)) {
    throw new GearToothVanishedError('backlash leaves no tooth on the pitch line — reduce backlashMm')
  }
  if (!(toothThicknessAtPitchMm < circularPitchMm)) {
    throw new GearParameterError('a negative backlash that large leaves no space between the teeth')
  }
  const addendumMm = ADDENDUM_COEFFICIENT * moduleMm
  const dedendumMm = moduleMm + clearanceMm
  if (!(addendumMm > -dedendumMm)) {
    throw new GearToothVanishedError('the root line is above the tip line — raise clearanceMm')
  }

  const flank = { toothThicknessAtPitchMm, transversePressureAngleDeg: pressureAngleDeg }
  const tanAlpha = Math.tan((pressureAngleDeg * Math.PI) / 180)
  let tipYMm = addendumMm
  let tipHalfWidthMm = rackHalfWidthMmAt(flank, tipYMm)
  const pointedTip = !(tipHalfWidthMm > 0)
  if (pointedTip) {
    // tan α > 0 here: at 0° the half-width is s/2 > 0 everywhere.
    tipYMm = toothThicknessAtPitchMm / 2 / tanAlpha
    tipHalfWidthMm = 0
  }
  let rootYMm = -dedendumMm
  let rootHalfWidthMm = rackHalfWidthMmAt(flank, rootYMm)
  const pointedRoot = rootHalfWidthMm >= circularPitchMm / 2
  if (pointedRoot) {
    rootYMm = (toothThicknessAtPitchMm / 2 - circularPitchMm / 2) / tanAlpha
    rootHalfWidthMm = circularPitchMm / 2
  }

  return {
    kind: 'rack',
    teeth,
    moduleMm,
    pressureAngleDeg,
    transversePressureAngleDeg: pressureAngleDeg,
    clearanceMm,
    backlashMm,
    heightMm,
    circularPitchMm,
    lengthMm: teeth * circularPitchMm,
    addendumMm,
    dedendumMm,
    toothThicknessAtPitchMm,
    tipYMm,
    rootYMm,
    backYMm: rootYMm - heightMm,
    tipHalfWidthMm,
    rootHalfWidthMm,
    pointedTip,
    pointedRoot,
  }
}

/**
 * The closed outline of a rack, CCW, and its dimensions.
 *
 * @param {RackParams} params
 * @returns {RackDimensions & { outline: Vec2Mm[], warnings: RackWarning[] }}
 * @throws {GearParameterError} as {@link rackDimensions}.
 */
export function rackProfile(params) {
  const dims = rackDimensions(params)
  const { teeth, circularPitchMm: p, lengthMm, tipYMm, rootYMm, backYMm, tipHalfWidthMm, rootHalfWidthMm } = dims
  const halfLengthMm = lengthMm / 2

  // Bottom edge, up the right end (mid-space), then the teeth right to left, then down the
  // left end: counter-clockwise.
  /** @type {Vec2Mm[]} */
  const outline = [
    [-halfLengthMm, backYMm],
    [halfLengthMm, backYMm],
    [halfLengthMm, rootYMm],
  ]
  for (let i = teeth - 1; i >= 0; i--) {
    const centreMm = (i + 0.5) * p - halfLengthMm
    if (!dims.pointedRoot) outline.push([centreMm + rootHalfWidthMm, rootYMm])
    outline.push([centreMm + tipHalfWidthMm, tipYMm])
    if (!dims.pointedTip) outline.push([centreMm - tipHalfWidthMm, tipYMm])
    if (!dims.pointedRoot) outline.push([centreMm - rootHalfWidthMm, rootYMm])
    else if (i > 0) outline.push([centreMm - p / 2, rootYMm])
  }
  outline.push([-halfLengthMm, rootYMm])

  /** @type {RackWarning[]} */
  const warnings = []
  if (dims.pointedTip) warnings.push('pointed-tip')
  if (dims.pointedRoot) warnings.push('pointed-root')
  return { ...dims, outline, warnings }
}
