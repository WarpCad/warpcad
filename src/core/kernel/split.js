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
 *    With a `placements` list (`TODO/core-059`) the joint is the person's instead: pins,
 *    tongues, wedges (`recipes/joint.wedge.js`) and screw bosses (`recipes/joint.screwBoss.js`)
 *    at the face positions they chose, or — for pins and tongues with no position — found by
 *    the search, clear of the rest (`recipes/joint.placements.js`). Each is accepted by the
 *    same containment check the search confirms with, and a placement that does not fit is
 *    refused by number, kind and position. Without `placements`, the search runs exactly as
 *    it always has.
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
 * clearanceMm, names, placements? } }` — unnamed and `supersedes`-based, exactly like Bisect's
 * (`OperationsToolbar.vue`'s "Resize and Bisect are a fourth shape"): the body keeps its
 * identity, its geometry becomes the two-part group.
 *
 * Millimetres, Z-up, framework-free.
 *
 * @module core/kernel/split
 */

import { add, bisect, boundsOf, createGroup, hasNamedParts, hiddenNamesOf, toGeom3 } from './group.js'
import { makeWatertight, openEdgesOf } from './watertight.js'
import { JOINT_WALL_MM, clearanceField, clearanceTo } from './recipes/joint.common.js'
import {
  PIN_MAX_DIAMETER_MM,
  PIN_MAX_REACH_MM,
  PIN_MIN_DIAMETER_MM,
  pinJoint,
  pinSizing,
} from './recipes/joint.pins.js'
import { DEFAULT_SCREW_MM, PlacementRefusal, placedJoint } from './recipes/joint.placements.js'
import { INSERT_MAX_RATIO, SCREW_MAX_MM, SCREW_MIN_MM } from './recipes/joint.screwBoss.js'
import {
  TONGUE_MAX_REACH_MM,
  TONGUE_MAX_WIDTH_MM,
  TONGUE_MIN_WIDTH_MM,
  tongueGrooveJoint,
} from './recipes/joint.tongueGroove.js'
import { WEDGE_MAX_WIDTH_MM, WEDGE_MIN_WIDTH_MM } from './recipes/joint.wedge.js'
import modeling from '@jscad/modeling'

const { booleans } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./group.js').Group} Group */
/** @typedef {import('./recipes/joint.pins.js').JointGeometry} JointGeometry */
/** @typedef {import('./recipes/joint.pins.js').Connector} Connector */
/** @typedef {import('./recipes/joint.placements.js').Placement} Placement */

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
 * The connector kinds a hand placement may ask for (`TODO/core-059`) — a separate list from
 * {@link JOINT_TYPES}, which is what the Split sheet's joint picker offers.
 */
export const PLACEMENT_KINDS = Object.freeze(/** @type {const} */ (['pins', 'tongue', 'wedge', 'screwBoss']))

/** The most connectors one split may place — a hard limit, as every tool-call input has. */
export const MAX_PLACEMENTS = 16

/** Each kind's `sizeMm` range, mm: a pin's diameter, a tongue's or wedge's width, a screw's size. */
const SIZE_RANGE_MM = Object.freeze({
  pins: [PIN_MIN_DIAMETER_MM, PIN_MAX_DIAMETER_MM],
  tongue: [TONGUE_MIN_WIDTH_MM, TONGUE_MAX_WIDTH_MM],
  wedge: [WEDGE_MIN_WIDTH_MM, WEDGE_MAX_WIDTH_MM],
  screwBoss: [SCREW_MIN_MM, SCREW_MAX_MM],
})

/**
 * @typedef {object} SplitParams
 * @property {'x' | 'y' | 'z'} axis The cut plane's normal.
 * @property {number} offsetMm Where the plane crosses the axis, from the body's minimum face.
 * @property {'pins' | 'tongue' | 'none'} [joint] Default `pins`.
 * @property {number} [clearanceMm] Per side, default {@link DEFAULT_JOINT_CLEARANCE_MM}.
 * @property {[string, string]} [names] Piece A's and piece B's part names.
 * @property {PlacementParams[]} [placements] Hand-placed connectors (`TODO/core-059`); when
 *   given, `joint` is not used.
 */

/**
 * One hand-placed connector, as a record carries it. `uMm`/`vMm` are document millimetres
 * along the cut face's two axes — for a cut across `x` those are `y` and `z`, across `y` they
 * are `z` and `x`, across `z` they are `x` and `y` (`joint.common.js`'s `faceAxes`). Leave
 * both out on `pins` or `tongue` to let the search place it, clear of the rest.
 *
 * @typedef {object} PlacementParams
 * @property {'pins' | 'tongue' | 'wedge' | 'screwBoss'} kind
 * @property {number} [uMm]
 * @property {number} [vMm]
 * @property {number} [sizeMm] A pin's diameter, a tongue's width, a wedge's width at its wide
 *   end, a screw boss's screw size. Default: the search's starting size; M3 for a screw boss.
 * @property {number} [lengthMm] A tongue's rib length, at least twice its width; default 4×.
 * @property {number} [insertMm] A screw boss's heat-set insert bore; leave out for a
 *   self-tapping screw.
 */

/**
 * @param {unknown} given
 * @returns {Placement[] | null}
 */
function readPlacements(given) {
  if (given === undefined) return null
  if (!Array.isArray(given)) {
    throw new Error(`${OP}: placements must be a list of connectors, got ${JSON.stringify(given)}`)
  }
  if (given.length === 0) {
    throw new Error(
      `${OP}: placements must list at least one connector — leave it out to let the search place the joint, or choose no joint`
    )
  }
  if (given.length > MAX_PLACEMENTS) {
    throw new Error(`${OP}: placements may list at most ${MAX_PLACEMENTS} connectors, got ${given.length}`)
  }
  return given.map((entry, index) => readPlacement(entry, index))
}

/**
 * @param {unknown} entry
 * @param {number} index
 * @returns {Placement}
 */
function readPlacement(entry, index) {
  const at = `${OP}: placement ${index + 1}`
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`${at} must be an object with a kind, got ${JSON.stringify(entry)}`)
  }
  const raw = /** @type {Record<string, unknown>} */ (entry)
  const kind = /** @type {Placement['kind']} */ (raw.kind)
  if (!PLACEMENT_KINDS.includes(kind)) {
    throw new Error(`${at}: kind must be one of ${PLACEMENT_KINDS.join(', ')}, got ${JSON.stringify(raw.kind)}`)
  }
  const named = `${at} (${kind})`
  /** @param {string} key @returns {number | null} */
  const finite = (key) => {
    const value = raw[key]
    if (value === undefined) return null
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${named}: ${key} must be a finite number of millimetres, got ${JSON.stringify(value)}`)
    }
    return value
  }
  const uMm = finite('uMm')
  const vMm = finite('vMm')
  if ((uMm === null) !== (vMm === null)) {
    throw new Error(`${named}: give both uMm and vMm, or neither to let the search place it`)
  }
  const searched = uMm === null
  if (searched && kind !== 'pins' && kind !== 'tongue') {
    throw new Error(`${named} needs uMm and vMm — only pins and tongue can be placed by the search`)
  }
  const sizeMm = finite('sizeMm')
  const lengthMm = finite('lengthMm')
  const insertMm = finite('insertMm')
  if (searched && (sizeMm !== null || lengthMm !== null)) {
    throw new Error(`${named}: the search picks its own size — give uMm and vMm to set sizeMm or lengthMm`)
  }
  if (sizeMm !== null) {
    const [low, high] = SIZE_RANGE_MM[kind]
    if (sizeMm < low || sizeMm > high) {
      throw new Error(`${named}: sizeMm must be ${low} to ${high} mm, got ${sizeMm}`)
    }
  }
  if (lengthMm !== null && kind !== 'tongue') {
    throw new Error(`${named}: lengthMm is only for a tongue`)
  }
  if (insertMm !== null) {
    if (kind !== 'screwBoss') throw new Error(`${named}: insertMm is only for a screwBoss`)
    const screwMm = sizeMm ?? DEFAULT_SCREW_MM
    if (!(insertMm > screwMm && insertMm <= INSERT_MAX_RATIO * screwMm)) {
      throw new Error(
        `${named}: insertMm (the heat-set insert's bore) must be larger than the screw's ${screwMm} mm and at most ` +
          `${INSERT_MAX_RATIO}× it, got ${insertMm}`
      )
    }
  }
  return { kind, uMm, vMm, sizeMm, lengthMm, insertMm }
}

/**
 * @param {Record<string, any>} params
 * @returns {{ axisIndex: number, axis: string, offsetMm: number, joint: 'pins' | 'tongue' | 'none', clearanceMm: number, names: [string, string] | null, placements: Placement[] | null }}
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
  const placements = readPlacements(params.placements)
  return { axisIndex, axis: AXES[axisIndex], offsetMm, joint, clearanceMm, names, placements }
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
 * @returns {JointPlan}
 */
export function planJoint(value, params) {
  const read = readParams(params)
  const { cutMm, piece, lower, upper } = cut(value, read)
  return planOn(piece.solid, lower, upper, read, cutMm)
}

/**
 * What a split adds and removes: `pins` unioned onto piece A, then `holes` cut from it;
 * `sockets` cut from piece B. `connectors` says where each one is.
 *
 * @typedef {object} JointPlan
 * @property {'pins' | 'tongue' | 'placements' | 'none'} kind
 * @property {Geom3[]} pins
 * @property {Geom3[]} sockets
 * @property {Geom3[]} holes
 * @property {Connector[]} connectors
 * @property {string} summary
 */

/**
 * @param {Geom3} solid The uncut piece.
 * @param {Geom3} lower
 * @param {Geom3} upper
 * @param {ReturnType<typeof readParams>} read
 * @param {number} cutMm
 * @returns {JointPlan}
 */
function planOn(solid, lower, upper, read, cutMm) {
  if (read.placements !== null) return planPlaced(solid, lower, upper, read, read.placements, cutMm)
  if (read.joint === 'none') return { kind: 'none', pins: [], sockets: [], holes: [], connectors: [], summary: 'no joint' }
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
 * The joint from a hand-given placement list (`TODO/core-059`).
 *
 * @param {Geom3} solid The uncut piece.
 * @param {Geom3} lower
 * @param {Geom3} upper
 * @param {ReturnType<typeof readParams>} read
 * @param {Placement[]} placements
 * @param {number} cutMm
 * @returns {JointPlan}
 */
function planPlaced(solid, lower, upper, read, placements, cutMm) {
  // Deep and wide enough for a pin or a tongue search either; a hand placement is decided by
  // its exact containment check, and only reads the field to word a refusal.
  const reach = Math.max(PIN_MAX_REACH_MM, TONGUE_MAX_REACH_MM)
  const widest = Math.max(PIN_MAX_DIAMETER_MM, TONGUE_MAX_WIDTH_MM) / 2
  const field = clearanceField(solid, read.axisIndex, cutMm, {
    maxDepthMm: reach + read.clearanceMm,
    maxClearMm: Math.hypot(widest + read.clearanceMm + JOINT_WALL_MM, 10),
  })
  try {
    return placedJoint({ field, lower, upper, clearanceMm: read.clearanceMm, placements })
  } catch (error) {
    if (error instanceof PlacementRefusal) throw new Error(`${OP}: ${error.message}`)
    throw error
  }
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

  const joined = plan.pins.length > 0 ? booleans.union(lower, ...plan.pins) : lower
  // A screw boss's bore runs through its own boss, so it is cut after the union.
  const pieceA = plan.holes.length > 0 ? booleans.subtract(joined, ...plan.holes) : joined
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

/**
 * What the Split sheet's **Place connectors** overlay draws and asks (`TODO/ui-067`): the cut
 * face's clearance field as a grid of cells, the joint the automatic search would place, and a
 * verdict for each hand placement given. Everything a person sees there comes from the same
 * checks Apply runs — `placedJoint`, with its refusals worded by number, kind and position.
 *
 * @typedef {object} FacePreview
 * @property {'x' | 'y' | 'z'} uAxis The document axis the face's `u` runs along.
 * @property {'x' | 'y' | 'z'} vAxis
 * @property {[number, number]} uRange The face's extent along `u`, mm.
 * @property {[number, number]} vRange
 * @property {number} columns
 * @property {number} rows
 * @property {number[]} fits Row-major, `rows × columns`: `1` where the smallest pin fits
 *   (solid on both sides of the cut with room for its socket and wall), `0` where nothing does.
 * @property {PlacementParams[]} auto The connectors the automatic search finds for `seed`
 *   (empty when `seed` is not asked for, or the search finds nothing).
 * @property {string} autoError Why the search found nothing, or `''`.
 * @property {{ ok: boolean, reason: string }[]} verdicts One per placement given, in order.
 * @property {string} overall A refusal of the list as a whole (two placements overlapping),
 *   or `''` when every placement fits alone and together; `''` for an empty list.
 */

/**
 * Preview a split's cut face for hand placement.
 *
 * @param {Geom3 | Group} value The uncut body.
 * @param {{ axis: string, offsetMm: number, clearanceMm?: number, placements?: PlacementParams[], seed?: 'pins' | 'tongue' | null }} params
 * @returns {FacePreview}
 * @throws {Error} The op's own refusal for a cut that is outside the body, crosses several
 *   parts or is not watertight.
 */
export function previewSplitFace(value, params) {
  const { placements: given = [], seed = null, ...rest } = params
  const read = readParams({ ...rest, joint: 'pins' })
  const placements = given.length === 0 ? [] : given.map((entry, index) => readPlacement(entry, index))
  const { cutMm, piece, lower, upper } = cut(value, read)
  const reach = Math.max(PIN_MAX_REACH_MM, TONGUE_MAX_REACH_MM)
  const widest = Math.max(PIN_MAX_DIAMETER_MM, TONGUE_MAX_WIDTH_MM) / 2
  const field = clearanceField(piece.solid, read.axisIndex, cutMm, {
    maxDepthMm: reach + read.clearanceMm,
    maxClearMm: Math.hypot(widest + read.clearanceMm + JOINT_WALL_MM, 10),
  })

  const { radiusMm, socketRadiusMm, socketDepthMm } = pinSizing(PIN_MIN_DIAMETER_MM, read.clearanceMm)
  const wallNeed = Math.hypot(socketRadiusMm + JOINT_WALL_MM, field.depthStepMm / 2)
  const baseNeed = Math.hypot(radiusMm, field.depthStepMm / 2)
  const fits = field.points.map((point) =>
    point.baseClearMm >= baseNeed && clearanceTo(field, point, socketDepthMm + JOINT_WALL_MM) >= wallNeed ? 1 : 0
  )

  /** @type {PlacementParams[]} */
  let auto = []
  let autoError = ''
  if (seed !== null) {
    const args = { field, lower, upper, clearanceMm: read.clearanceMm }
    const plan = seed === 'pins' ? pinJoint(args) : tongueGrooveJoint(args)
    if (plan === null) autoError = `${OP}: the automatic search finds no room for a ${seed === 'pins' ? 'pin' : 'tongue'} on this cut face`
    else {
      auto = plan.connectors.map((connector) => ({
        kind: connector.kind,
        uMm: Number(connector.uMm.toFixed(3)),
        vMm: Number(connector.vMm.toFixed(3)),
        sizeMm: Number(connector.sizeMm.toFixed(3)),
        ...(connector.kind === 'tongue' && connector.lengthMm !== undefined
          ? { lengthMm: Number(connector.lengthMm.toFixed(3)) }
          : {}),
      }))
    }
  }

  const verdicts = placements.map((placement, index) => {
    try {
      placedJoint({ field, lower, upper, clearanceMm: read.clearanceMm, placements: [placement] })
      return { ok: true, reason: '' }
    } catch (error) {
      if (!(error instanceof PlacementRefusal)) throw error
      return { ok: false, reason: error.message.replace(/^placement 1\b/, `placement ${index + 1}`) }
    }
  })
  let overall = ''
  if (placements.length > 1 && verdicts.every((verdict) => verdict.ok)) {
    try {
      placedJoint({ field, lower, upper, clearanceMm: read.clearanceMm, placements })
    } catch (error) {
      if (!(error instanceof PlacementRefusal)) throw error
      overall = error.message
    }
  }
  return {
    uAxis: AXES[field.u],
    vAxis: AXES[field.v],
    uRange: field.uRange,
    vRange: field.vRange,
    columns: field.columns,
    rows: field.rows,
    fits,
    auto,
    autoError,
    verdicts,
    overall,
  }
}
