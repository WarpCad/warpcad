// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The caps every gear op checks **before** a profile is built (TODO/core-041).
 *
 * `./dimensions.js` rejects what cannot make a gear; this rejects what should not reach the
 * generator at all — a non-number, or a size that would sample millions of vertices — so a
 * hostile record (`teeth: 1e6`, `moduleMm: Infinity`) fails in microseconds with a named
 * error instead of hanging the kernel worker. The same numbers are the Inspector's field
 * ranges (`GEAR_SPUR_UI.paramRanges`), so a field can never offer a value the op refuses.
 *
 * Framework-free and kernel-free: no Vue, no DOM, no `@jscad/modeling`.
 *
 * @module core/gear/limits
 */

import { GearParameterError } from './dimensions.js'

/**
 * @typedef {object} GearLimit
 * @property {number} min Inclusive, unless `minExclusive`.
 * @property {number} max Inclusive.
 * @property {boolean} [integer]
 * @property {boolean} [minExclusive]
 */

/**
 * The registry's gear caps. Teeth 3…500, module 0.05…50 mm and pressure angle 5…35° are
 * the TODO's; thickness and profile shift are bounded so no finite input can grow the
 * solid past what the kernel tessellates in a frame's worth of work.
 *
 * @type {Readonly<Record<'teeth' | 'moduleMm' | 'pressureAngleDeg' | 'thicknessMm' | 'profileShift', Readonly<GearLimit>>>}
 */
export const GEAR_LIMITS = Object.freeze({
  teeth: Object.freeze({ min: 3, max: 500, integer: true }),
  moduleMm: Object.freeze({ min: 0.05, max: 50 }),
  pressureAngleDeg: Object.freeze({ min: 5, max: 35 }),
  thicknessMm: Object.freeze({ min: 0, max: 1000, minExclusive: true }),
  profileShift: Object.freeze({ min: -1, max: 2 }),
})

/** Params that must be finite numbers when present but carry no range of their own. */
const FINITE_ONLY = Object.freeze(['clearanceMm', 'backlashMm'])

/** A gear param outside the registry's caps, or not a number at all. */
export class GearLimitError extends GearParameterError {
  /**
   * @param {string} message
   * @param {string} param
   */
  constructor(message, param) {
    super(message)
    this.name = 'GearLimitError'
    /** @type {string} */
    this.param = param
  }
}

/** A bore that would cut through the teeth or the whole gear. */
export class GearBoreError extends GearParameterError {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'GearBoreError'
  }
}

/**
 * @param {unknown} value
 * @param {string} name
 * @param {Readonly<GearLimit>} limit
 * @param {string} op
 */
function checkRange(value, name, limit, op) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GearLimitError(`${op}: ${name} must be a finite number, got ${String(value)}`, name)
  }
  if (limit.integer && !Number.isInteger(value)) {
    throw new GearLimitError(`${op}: ${name} must be a whole number, got ${value}`, name)
  }
  const belowMin = limit.minExclusive ? value <= limit.min : value < limit.min
  if (belowMin || value > limit.max) {
    const lower = limit.minExclusive ? `more than ${limit.min}` : `${limit.min}`
    throw new GearLimitError(`${op}: ${name} must be between ${lower} and ${limit.max}, got ${value}`, name)
  }
}

/**
 * Check canonical gear params against {@link GEAR_LIMITS}. Cheap and allocation-free: it
 * reads numbers and compares them, and never builds a profile.
 *
 * @param {Record<string, unknown>} params Canonical names (after `./aliases.js`).
 * @param {{ op: string, required: readonly string[] }} options `required` params must be
 *   present; every other limited param is checked only when given.
 * @returns {void}
 * @throws {GearLimitError}
 */
export function checkGearLimits(params, { op, required }) {
  for (const name of required) {
    if (params[name] === undefined) throw new GearLimitError(`${op}: ${name} is required`, name)
  }
  // Teeth first: it is the one param that scales the work, so it is refused before anything else.
  for (const name of /** @type {(keyof typeof GEAR_LIMITS)[]} */ (Object.keys(GEAR_LIMITS))) {
    if (params[name] !== undefined) checkRange(params[name], name, GEAR_LIMITS[name], op)
  }
  for (const name of FINITE_ONLY) {
    const value = params[name]
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new GearLimitError(`${op}: ${name} must be a finite number, got ${String(value)}`, name)
    }
  }
  const bore = params.boreMm
  if (bore !== undefined && (typeof bore !== 'number' || !Number.isFinite(bore) || bore < 0)) {
    throw new GearLimitError(`${op}: boreMm must be a finite number, 0 or more, got ${String(bore)}`, 'boreMm')
  }
}
