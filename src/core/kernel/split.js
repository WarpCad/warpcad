// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Split one body into two printable pieces along an axis plane, with a joint so they go back
 * together (`TODO/io-007`) — `modify.splitWithJoint`.
 *
 * ## What it does
 *
 * 1. Refuses a body that is **not watertight** (`watertight.js`'s `openEdgesOf` after the
 *    export's own repair): a split of an open surface gives pieces no slicer can print, and
 *    the place to say so is here, before the user has a joint they cannot use.
 * 2. Cuts with the existing {@link bisect} — the same half-space boolean `modify.bisect` uses,
 *    and the same offset rule: `offsetMm` is measured **from the body's minimum face** along
 *    the axis. Unlike Bisect, the plane must fall strictly inside the body; a plane on or
 *    beyond a face is refused by name, because it would leave an empty piece.
 * 3. Plans a joint on the cut face (`recipes/joint.pins.js` or
 *    `recipes/joint.tongueGroove.js`): pins or a tongue are unioned onto piece **A** (the
 *    minimum side), sockets or a groove — wider and deeper by `clearanceMm` — are cut out of
 *    piece **B**.
 * 4. Returns a **group of two named parts**, A then B — `["Wing A", "Wing B"]` when the record
 *    carries those `names` (the Split sheet passes the body's own name plus a letter) — so each
 *    piece stays addressable and the group tools, the Inspector's parts list and Export → Print
 *    pieces all apply to it unchanged.
 *
 * ## Multi-split is N applications
 *
 * Splitting a body that is already a group of parts cuts **only the part the plane crosses**
 * and keeps every other part, in order, with its colour: piece A keeps the crossed part's
 * name (or `names[0]`), piece B is inserted right after it as `names[1]`. A plane that crosses
 * two parts at once is refused by name — which part to joint would be a guess. A group with
 * holes is not part-addressable (`hasNamedParts`), so it is combined and cut as one solid.
 *
 * ## Record shape
 *
 * `{ op: 'modify.splitWithJoint', target, supersedes: target, params: { axis, offsetMm, joint,
 * clearanceMm, names } }` — unnamed and `supersedes`-based, exactly like Bisect's
 * (`OperationsToolbar.vue`'s "Resize and Bisect are a fourth shape"): the body keeps its
 * identity, its geometry becomes the two-part group.
 *
 * Millimetres, Z-up, framework-free.
 *
 * @module core/kernel/split
 */

import { add, bisect, boundsOf, createGroup, hasNamedParts, hiddenNamesOf, toGeom3 } from './group.js'
import { makeWatertight, openEdgesOf } from './watertight.js'
import { JOINT_WALL_MM, clearanceField } from './recipes/joint.common.js'
import { PIN_MAX_DIAMETER_MM, PIN_MAX_REACH_MM, pinJoint } from './recipes/joint.pins.js'
import { TONGUE_MAX_REACH_MM, TONGUE_MAX_WIDTH_MM, tongueGrooveJoint } from './recipes/joint.tongueGroove.js'
import modeling from '@jscad/modeling'

const { booleans } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./group.js').Group} Group */
/** @typedef {import('./recipes/joint.pins.js').JointGeometry} JointGeometry */

/** The op name, for messages. */
const OP = 'modify.splitWithJoint'

/** The joint types, in the order the Split sheet lists them. */
export const JOINT_TYPES = Object.freeze(/** @type {const} */ (['pins', 'tongue', 'none']))

/**
 * Default clearance per side, mm — the "snug fit" the AI's printing defaults already state
 * (`src/ai/prompt.js`: 0.2 mm per side). The project has no printer-tolerance setting yet, so
 * this is the default the sheet opens with.
 */
export const DEFAULT_JOINT_CLEARANCE_MM = 0.2

/** The most clearance accepted, mm: beyond this the joint is a rattle, not a fit. */
export const MAX_JOINT_CLEARANCE_MM = 2

const AXES = /** @type {const} */ (['x', 'y', 'z'])

/**
 * @typedef {object} SplitParams
 * @property {'x' | 'y' | 'z'} axis The cut plane's normal.
 * @property {number} offsetMm Where the plane crosses the axis, from the body's minimum face.
 * @property {'pins' | 'tongue' | 'none'} [joint] Default `pins`.
 * @property {number} [clearanceMm] Per side, default {@link DEFAULT_JOINT_CLEARANCE_MM}.
 * @property {[string, string]} [names] Piece A's and piece B's part names.
 */

/**
 * @param {Record<string, any>} params
 * @returns {{ axisIndex: number, axis: string, offsetMm: number, joint: 'pins' | 'tongue' | 'none', clearanceMm: number, names: [string, string] | null }}
 */
function readParams(params) {
  const axisIndex = AXES.indexOf(params?.axis)
  if (axisIndex < 0) throw new Error(`${OP}: axis must be one of x, y, z, got ${JSON.stringify(params?.axis)}`)
  const offsetMm = params.offsetMm
  if (typeof offsetMm !== 'number' || !Number.isFinite(offsetMm)) {
    throw new Error(`${OP}: offsetMm must be a finite number of millimetres, got ${JSON.stringify(offsetMm)}`)
  }
  const joint = params.joint ?? 'pins'
  if (!JOINT_TYPES.includes(joint)) {
    throw new Error(`${OP}: joint must be one of ${JOINT_TYPES.join(', ')}, got ${JSON.stringify(joint)}`)
  }
  const clearanceMm = params.clearanceMm ?? DEFAULT_JOINT_CLEARANCE_MM
  if (typeof clearanceMm !== 'number' || !Number.isFinite(clearanceMm) || clearanceMm < 0 || clearanceMm > MAX_JOINT_CLEARANCE_MM) {
    throw new Error(
      `${OP}: clearanceMm must be between 0 and ${MAX_JOINT_CLEARANCE_MM} mm, got ${JSON.stringify(clearanceMm)}`
    )
  }
  let names = null
  if (params.names !== undefined) {
    const given = params.names
    const valid =
      Array.isArray(given) &&
      given.length === 2 &&
      given.every((name) => typeof name === 'string' && name.trim() !== '' && !name.includes(',')) &&
      given[0] !== given[1]
    if (!valid) {
      throw new Error(
        `${OP}: names must be two different, non-empty part names with no commas, got ${JSON.stringify(given)}`
      )
    }
    names = /** @type {[string, string]} */ ([given[0], given[1]])
  }
  return { axisIndex, axis: AXES[axisIndex], offsetMm, joint, clearanceMm, names }
}

/**
 * Warnings the Split sheet shows before Apply — things that are allowed but probably wrong.
 *
 * @param {{ joint?: string, clearanceMm?: number }} params
 * @returns {string[]}
 */
export function splitWarnings(params) {
  const joint = params.joint ?? 'pins'
  if (joint === 'none') return []
  /** @type {string[]} */
  const warnings = []
  if (params.clearanceMm === 0) {
    warnings.push(
      'Zero clearance: a printed pin or tongue comes out slightly fatter than modelled, so with no gap the pieces may not go together. 0.2 mm is a snug fit.'
    )
  }
  return warnings
}

/**
 * Which visible part of a group the plane crosses, or the whole value as one solid.
 *
 * @param {Geom3 | Group} value
 * @param {number} axisIndex
 * @param {number} cutMm
 * @returns {{ group: Group | null, partName: string | null, solid: Geom3 }}
 */
function crossedPiece(value, axisIndex, cutMm) {
  if (!hasNamedParts(value)) return { group: null, partName: null, solid: toGeom3(value) }
  const crossed = value.names.filter((name) => {
    const part = value.parts[name]
    if (part.polygons.length === 0) return false
    const [min, max] = boundsOf(part)
    return min[axisIndex] < cutMm - 1e-6 && max[axisIndex] > cutMm + 1e-6
  })
  if (crossed.length === 0) {
    throw new Error(`${OP}: the cut plane at ${AXES[axisIndex]} = ${fmt(cutMm)} mm passes between parts and crosses none of them`)
  }
  if (crossed.length > 1) {
    throw new Error(
      `${OP}: the cut plane crosses ${crossed.length} parts (${crossed.join(', ')}) — split one part at a time`
    )
  }
  return { group: value, partName: crossed[0], solid: value.parts[crossed[0]] }
}

/** @param {number} mm */
function fmt(mm) {
  return String(Number(mm.toFixed(3)))
}

/**
 * The cut, checked and resolved: the piece being cut, both halves and the clearance field.
 *
 * @param {Geom3 | Group} value
 * @param {ReturnType<typeof readParams>} read
 */
function cut(value, read) {
  const { axisIndex, axis, offsetMm } = read
  const [min, max] = boundsOf(value)
  const cutMm = min[axisIndex] + offsetMm
  if (!(offsetMm > 1e-6 && cutMm < max[axisIndex] - 1e-6)) {
    throw new Error(
      `${OP}: the cut plane at ${axis} = ${fmt(cutMm)} mm is outside the body (${axis} ${fmt(min[axisIndex])} to ${fmt(max[axisIndex])} mm) — ` +
        `offset is measured from the minimum face and must be between 0 and ${fmt(max[axisIndex] - min[axisIndex])}`
    )
  }
  const piece = crossedPiece(value, axisIndex, cutMm)
  const open = openEdgesOf(makeWatertight(piece.solid)).openEdges
  if (open > 0) {
    throw new Error(
      `${OP}: "${piece.partName ?? 'the body'}" is not watertight (${open} open edge${open === 1 ? '' : 's'}) — ` +
        'its pieces would not print; repair it before splitting'
    )
  }
  const pieceMin = boundsOf(piece.solid)[0][axisIndex]
  const halves = /** @type {Group} */ (bisect(piece.solid, axis, cutMm - pieceMin))
  const lower = halves.parts.negative
  const upper = halves.parts.positive
  return { cutMm, piece, lower, upper }
}

/**
 * Plan the joint for a split without building the pieces — what the op adds and removes.
 * Exported for the volume identity a spec checks, and for a caller that wants to describe the
 * joint before applying it.
 *
 * @param {Geom3 | Group} value
 * @param {SplitParams | Record<string, any>} params
 * @returns {{ kind: 'pins' | 'tongue' | 'none', pins: Geom3[], sockets: Geom3[], summary: string }}
 */
export function planJoint(value, params) {
  const read = readParams(params)
  const { cutMm, piece, lower, upper } = cut(value, read)
  return planOn(piece.solid, lower, upper, read, cutMm)
}

/**
 * @param {Geom3} solid The uncut piece.
 * @param {Geom3} lower
 * @param {Geom3} upper
 * @param {ReturnType<typeof readParams>} read
 * @param {number} cutMm
 * @returns {{ kind: 'pins' | 'tongue' | 'none', pins: Geom3[], sockets: Geom3[], summary: string }}
 */
function planOn(solid, lower, upper, read, cutMm) {
  if (read.joint === 'none') return { kind: 'none', pins: [], sockets: [], summary: 'no joint' }
  const reach = read.joint === 'pins' ? PIN_MAX_REACH_MM : TONGUE_MAX_REACH_MM
  const widest = read.joint === 'pins' ? PIN_MAX_DIAMETER_MM / 2 : TONGUE_MAX_WIDTH_MM / 2
  const field = clearanceField(solid, read.axisIndex, cutMm, {
    maxDepthMm: reach + read.clearanceMm,
    maxClearMm: Math.hypot(widest + read.clearanceMm + JOINT_WALL_MM, 10),
  })
  const args = { field, lower, upper, clearanceMm: read.clearanceMm }
  const plan = read.joint === 'pins' ? pinJoint(args) : tongueGrooveJoint(args)
  if (plan) return plan
  const thinnest = Math.min(field.uRange[1] - field.uRange[0], field.vRange[1] - field.vRange[0])
  if (read.joint === 'pins') {
    throw new Error(
      `${OP}: no room for a pin on the cut face (it is ${fmt(thinnest)} mm across at its narrowest, and a pin needs ` +
        `its socket plus a ${JOINT_WALL_MM} mm wall) — choose Tongue and groove, or no joint`
    )
  }
  throw new Error(
    `${OP}: no room for a tongue and groove on the cut face (${fmt(thinnest)} mm across at its narrowest) — ` +
      'choose no joint, or cut somewhere thicker'
  )
}

/**
 * Split a body into two pieces with a joint. See the module doc for every rule.
 *
 * @param {Geom3 | Group} value
 * @param {SplitParams | Record<string, any>} params
 * @returns {Group} Two parts, A then B — or, for a group, its parts with the crossed one split.
 */
export function splitWithJoint(value, params) {
  const read = readParams(params)
  const { cutMm, piece, lower, upper } = cut(value, read)
  const plan = planOn(piece.solid, lower, upper, read, cutMm)

  const pieceA = plan.pins.length > 0 ? booleans.union(lower, ...plan.pins) : lower
  const pieceB = plan.sockets.length > 0 ? booleans.subtract(upper, ...plan.sockets) : upper

  if (piece.group === null || piece.partName === null) {
    const [nameA, nameB] = read.names ?? ['A', 'B']
    return add(add(createGroup('split'), pieceA, nameA), pieceB, nameB)
  }

  const source = piece.group
  const crossed = piece.partName
  const nameA = read.names?.[0] ?? crossed
  const nameB = read.names?.[1] ?? `${crossed} B`
  for (const name of [nameA, nameB]) {
    if (name !== crossed && Object.hasOwn(source.parts, name)) {
      throw new Error(`${OP}: the body already has a part named "${name}" — choose another name for the new piece`)
    }
  }
  /** @param {string} name */
  const colorOf = (name) => {
    const color = source.colors?.[name]
    return color ? { color: color.color, colorAlpha: color.alpha } : {}
  }
  let group = createGroup(source.name)
  for (const name of source.names) {
    if (name === crossed) {
      group = add(group, pieceA, nameA, colorOf(crossed))
      group = add(group, pieceB, nameB, colorOf(crossed))
    } else {
      group = add(group, source.parts[name], name, colorOf(name))
    }
  }
  for (const name of hiddenNamesOf(source)) {
    group = add(group, source.parts[name], name, { hidden: true, ...colorOf(name) })
  }
  return group
}
