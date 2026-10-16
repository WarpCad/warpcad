// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `gear.worm` composite recipe — a single- or multi-start worm (TODO/core-047,
 * `docs/decisions/gears.md`).
 *
 * `drive-mount/DriveMount.jscad` modelled its right-ascension worm as a plain cylinder; this
 * is the part it stood in for. Like every composite it builds nothing: it expands `params`
 * into op records the same fold replays, and imports no `@jscad/modeling`.
 *
 * ## The expansion
 *
 * `profile.gear` kind `worm` (the transverse section, `src/core/gear/worm.js`) → when there is
 * a bore, `boolean.subtract` of a `profile.circle` **in 2D** (gear.spur's idiom and reason) →
 * `profile.extrudeLinear` with `leadMm` and `handedness`, which turns the section once per
 * lead through the whole length → a `transform.translate` down by half the length. Parts:
 *
 * - **`worm`** — the threaded body, bored. The only visible part.
 * - **`bore`** — the hole's negative, hidden, when `boreMm` is given.
 * - **`pitch`** — a hidden cylinder of the pitch diameter and the worm's length: the
 *   reference a Mesh operation or a snap can use.
 *
 * ## Why a twisted section, not a helical sweep of the thread
 *
 * The TODO proposed sweeping the axial rack tooth with `extrudeHelical` (the sketch's helical
 * extrude). Measured while building this, that thread has to be unioned onto a core cylinder,
 * and the union is not watertight: 10, 49, 6 and 30 open edges at 1, 2 and 4 starts and on a
 * 200 mm worm **after** `makeWatertight`, and 0.3-1.7 s per union. The transverse section
 * twisted once per lead (`profile.extrudeLinear`'s `leadMm`) is one `extrudeFromSlices` with
 * no boolean — 0 open edges with no repair, 4-60 ms to build — at the cost of more triangles
 * for the same tolerance (its lands are sampled in every slice). `gears.md`'s core-047
 * addendum has the numbers.
 *
 * ## Placement and params
 *
 * Axis local Z, centred on the origin, mid-length at Z = 0, tooth 0 on +X at the **bottom**
 * face (where the twist starts — a helical `gear.spur`'s convention). No `center` param; the
 * Library's trailing `transform.translate` places it.
 *
 * `starts` (1…4), `moduleMm` (axial — `module` through `src/core/gear/aliases.js`),
 * `pitchDiameterMm` and `lengthMm` are required; `pressureAngleDeg` (axial, default 20),
 * `handedness` (default `'right'`), `clearanceMm`, `backlashMm` and `boreMm` are optional.
 * `frictionCoefficient` is accepted and checked but changes no record: it is the assumption
 * behind the self-locking readout (`wormDimensions().selfLocking`, information, not a
 * guarantee), stored with the part for the Inspector (`ui-057`). Every value is capped and
 * the worm checked by `wormDimensions` — starts, root circle, lead angle, bore — **before** a
 * record is emitted. How finely the twist is sampled is the document's resolution.
 *
 * @module core/kernel/recipes/gear.worm
 */

import { resolveGearAliases } from '../../gear/aliases.js'
import { GearParameterError } from '../../gear/dimensions.js'
import { GearBoreError, WORM_LIMITS, checkGearLimits } from '../../gear/limits.js'
import { wormDimensions } from '../../gear/worm.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'gear.worm'

/** The params `gear.worm` takes, canonical spelling. */
export const WORM_PARAMS = Object.freeze([
  'starts',
  'moduleMm',
  'pressureAngleDeg',
  'pitchDiameterMm',
  'lengthMm',
  'handedness',
  'clearanceMm',
  'backlashMm',
  'boreMm',
  'frictionCoefficient',
])

/** The subset that shapes the section, passed on to `profile.gear` when given. */
const SECTION_PARAMS = Object.freeze(['starts', 'moduleMm', 'pitchDiameterMm', 'pressureAngleDeg', 'clearanceMm', 'backlashMm'])

/**
 * A `./worm.js` error re-raised with this op in front, keeping its class, param and code.
 *
 * @param {unknown} error
 * @param {string} op
 * @returns {unknown}
 */
export function withWormOp(error, op) {
  if (error instanceof GearParameterError && !error.message.startsWith(`${op}: `)) {
    error.message = `${op}: ${error.message.replace(/^worm(?: wheel)?: /, '')}`
  }
  return error
}

/**
 * Expand a `gear.worm` document line into the records that define it.
 *
 * @param {Record<string, unknown>} params See the module doc.
 * @param {unknown} [_tables] Unused — a worm has no size table.
 * @returns {OpRecord[]}
 * @throws {GearParameterError} Named: an alias, limit, root, lead-angle or bore error.
 */
export function worm(params, _tables) {
  const canonical = resolveGearAliases(params, { op: OP, canonical: WORM_PARAMS }).params
  checkGearLimits(canonical, { op: OP, required: ['starts', 'moduleMm', 'pitchDiameterMm', 'lengthMm'], limits: WORM_LIMITS })
  /** @type {import('../../gear/worm.js').WormDimensions} */
  let dims
  try {
    dims = wormDimensions(/** @type {any} */ (canonical), { op: OP })
  } catch (error) {
    throw withWormOp(error, OP)
  }

  const lengthMm = /** @type {number} */ (canonical.lengthMm)
  const boreMm = /** @type {number} */ (canonical.boreMm ?? 0)
  const rootDiameterMm = 2 * dims.rootRadiusMm
  if (boreMm >= rootDiameterMm) {
    throw new GearBoreError(
      `${OP}: boreMm ${boreMm} must be smaller than the root diameter (${rootDiameterMm.toFixed(3)} mm) — ` + 'a larger bore would cut through the thread'
    )
  }

  /** @type {Record<string, unknown>} */
  const sectionParams = { kind: 'worm' }
  for (const key of SECTION_PARAMS) {
    if (canonical[key] !== undefined) sectionParams[key] = canonical[key]
  }
  /** @type {OpRecord[]} */
  const records = [{ id: 'profile', op: 'profile.gear', params: sectionParams }]
  let face = 'profile'
  if (boreMm > 0) {
    records.push(
      { id: 'hole', op: 'profile.circle', params: { diameter: boreMm } },
      { id: 'face', op: 'boolean.subtract', target: 'profile', operands: ['hole'] }
    )
    face = 'face'
  }
  records.push(
    { id: 'thread', op: 'profile.extrudeLinear', target: face, params: { height: lengthMm, leadMm: dims.leadMm, handedness: dims.handedness } },
    { id: 'worm', op: 'transform.translate', target: 'thread', params: { vector: [0, 0, -lengthMm / 2] }, name: 'worm' }
  )
  if (boreMm > 0) {
    records.push({ id: 'bore', op: 'primitive.cylinder', params: { diameter: boreMm, height: lengthMm }, name: 'bore', hidden: true })
  }
  records.push({ id: 'pitch', op: 'primitive.cylinder', params: { diameter: dims.pitchDiameterMm, height: lengthMm }, name: 'pitch', hidden: true })
  return records
}
