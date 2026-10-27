// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A split's joint built from a hand-given list of connectors (`TODO/core-059`) rather than one
 * auto-placed joint: pins, tongues, wedges and screw bosses, each at a face position the
 * person chose — or, for pins and tongues, left to the search to find, clear of the others.
 * `TODO/core-075` adds loose dowels and **butterfly keys**; a butterfly's position is a point on
 * (or near) the cut face's outline, and its side, when not given, is the nearest edge's.
 *
 * ## One check, two callers
 *
 * A hand placement is accepted by the **same** exact containment check the search confirms
 * its own winners with — each kind's `…Misfit` (`joint.pins.js`'s {@link pinMisfit},
 * `joint.tongueGroove.js`'s {@link tongueMisfit}, and the new kinds' own), all built on
 * `joint.common.js`'s `contains`. The clearance field (`clearanceTo`, via {@link solidAt})
 * then explains a refusal: a placement on a hole is "not on solid material", one near an edge
 * "would break out of piece B". The field never accepts a placement on its own — it is a grid
 * and may be coarse — it only words the refusal the boolean has already made.
 *
 * ## Order
 *
 * Hand placements are checked first, in list order, each against the face and then against
 * every earlier one. Then each search entry runs with every connector placed so far as a
 * keep-out, so a search never lands on a hand-placed connector even when it is listed first.
 * Pins and sockets come back in **list order**, a search entry's one or two pins where the
 * entry sits.
 *
 * Every refusal names the placement by its 1-based position in the list, its kind and — when
 * it has one — its position on the face. The op prefixes its own name.
 *
 * Millimetres, document frame, Z-up. Framework-free.
 *
 * @module core/kernel/recipes/joint.placements
 */

import { JOINT_WALL_MM, footprintsOverlap, solidAt } from './joint.common.js'
import {
  BUTTERFLY_MAX_WIDTH_MM,
  BUTTERFLY_MIN_WIDTH_MM,
  butterfliesAt,
  butterflyFace,
  butterflyJoint,
  butterflyMisfit,
  nearestSide,
} from './joint.butterfly.js'
import { DOWEL_MAX_DIAMETER_MM, DOWEL_MIN_DIAMETER_MM, dowelJoint, dowelMisfit, dowelsAt } from './joint.dowel.js'
import { PIN_MAX_DIAMETER_MM, PIN_MIN_DIAMETER_MM, pinJoint, pinMisfit, pinsAt } from './joint.pins.js'
import { SCREW_BOSS_WALL_MM, screwBossAt, screwBossMisfit } from './joint.screwBoss.js'
import {
  TONGUE_MAX_WIDTH_MM,
  TONGUE_MIN_WIDTH_MM,
  ribAlongU,
  tongueAt,
  tongueGrooveJoint,
  tongueMisfit,
} from './joint.tongueGroove.js'
import { WEDGE_MAX_WIDTH_MM, WEDGE_MIN_WIDTH_MM, wedgeAt, wedgeMisfit } from './joint.wedge.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./joint.common.js').ClearanceField} ClearanceField */
/** @typedef {import('./joint.common.js').Footprint} Footprint */
/** @typedef {import('./joint.pins.js').JointGeometry} JointGeometry */
/** @typedef {import('./joint.pins.js').Connector} Connector */

/**
 * One placement as the op read it: kind and fields checked for type and range, nothing yet
 * checked against the solid. `uMm`/`vMm` are `null` for a search entry.
 *
 * @typedef {object} Placement
 * @property {'pins' | 'tongue' | 'wedge' | 'screwBoss' | 'dowel' | 'butterfly'} kind
 * @property {number | null} uMm
 * @property {number | null} vMm
 * @property {number | null} sizeMm `null` for the kind's default at this face.
 * @property {number | null} lengthMm A tongue's rib length; `null` for its default.
 * @property {number | null} insertMm A screw boss's insert bore; `null` for self-tapping.
 * @property {'printed' | 'steel' | 'filament'} [stock] A dowel's (`TODO/core-075`); default printed.
 * @property {'u-' | 'u+' | 'v-' | 'v+' | null} [side] A butterfly's surface; `null` for the nearest edge's.
 * @property {number | null} [depthMm] A butterfly's depth; `null` for its default.
 * @property {boolean} [through] A butterfly that runs the full thickness.
 */

/** A refusal of one placement; the op prefixes its own name. */
export class PlacementRefusal extends Error {}

/** Default screw for a screw boss with no `sizeMm`, mm (M3). */
export const DEFAULT_SCREW_MM = 3

/** A tongue's default rib length, × its width. */
const TONGUE_DEFAULT_LENGTH_RATIO = 4

/** @param {number} mm */
function fmt(mm) {
  return String(Number(mm.toFixed(3)))
}

const AXIS_NAMES = /** @type {const} */ (['x', 'y', 'z'])

/**
 * The default size of a kind on a face of this narrower side — for pins, tongues, wedges and
 * dowels the size the search starts at (35 % of the narrower side, clamped to the kind's
 * range). Exported for the Split sheet's pieces list (`TODO/core-075`), which sizes a tapped
 * dowel the way Apply will.
 *
 * @param {Placement['kind']} kind
 * @param {number} minorMm
 * @returns {number}
 */
export function defaultSize(kind, minorMm) {
  /** @param {number} low @param {number} high */
  const start = (low, high) => Math.min(high, Math.max(low, minorMm * 0.35))
  if (kind === 'pins') return start(PIN_MIN_DIAMETER_MM, PIN_MAX_DIAMETER_MM)
  if (kind === 'tongue') return start(TONGUE_MIN_WIDTH_MM, TONGUE_MAX_WIDTH_MM)
  if (kind === 'wedge') return start(WEDGE_MIN_WIDTH_MM, WEDGE_MAX_WIDTH_MM)
  if (kind === 'dowel') return start(DOWEL_MIN_DIAMETER_MM, DOWEL_MAX_DIAMETER_MM)
  // A butterfly's waist starts at the face's narrower side: on a 10 mm plank, a 40 mm key.
  if (kind === 'butterfly') return Math.min(BUTTERFLY_MAX_WIDTH_MM, Math.max(BUTTERFLY_MIN_WIDTH_MM, minorMm))
  return DEFAULT_SCREW_MM
}

/**
 * Build a split's joint from a placement list. Throws a {@link PlacementRefusal} naming the
 * first placement that does not fit, or that overlaps another.
 *
 * @param {object} args
 * @param {ClearanceField} args.field The uncut solid's clearance field at this cut.
 * @param {Geom3} args.lower Piece A.
 * @param {Geom3} args.upper Piece B.
 * @param {number} args.clearanceMm
 * @param {Placement[]} args.placements At least one.
 * @param {Geom3} [args.solid] The **uncut** solid — needed for a butterfly key, which is
 *   clipped to it (`TODO/core-075`).
 * @returns {JointGeometry}
 */
export function placedJoint({ field, lower, upper, clearanceMm, placements, solid }) {
  /** The butterfly's view of the face, made only when a list has one. */
  const face = () => {
    if (solid === undefined) throw new Error('placedJoint: a butterfly key needs the uncut solid')
    return butterflyFace(solid, field.axisIndex, field.cutMm)
  }
  const uName = AXIS_NAMES[field.u]
  const vName = AXIS_NAMES[field.v]
  const minorMm = Math.min(field.uRange[1] - field.uRange[0], field.vRange[1] - field.vRange[0])
  const alongU = ribAlongU(field)

  /** @param {number} index @param {string} kind @param {{ uMm: number, vMm: number } | null} at @param {boolean} [searched] */
  const label = (index, kind, at, searched = false) =>
    at === null
      ? `placement ${index + 1} (${kind})`
      : `placement ${index + 1} (${kind}${searched ? ' found by search' : ''} at ${uName} = ${fmt(at.uMm)}, ${vName} = ${fmt(at.vMm)} mm)`

  /** @type {(JointGeometry | null)[]} one per list entry, in list order */
  const built = placements.map(() => null)
  /** @type {{ index: number, connector: Connector }[]} */
  const placed = []

  // Hand placements first, so every search keeps clear of all of them.
  placements.forEach((placement, index) => {
    if (placement.uMm === null || placement.vMm === null) return
    const at = { uMm: placement.uMm, vMm: placement.vMm }
    const name = label(index, placement.kind, at)
    const [u0, u1] = field.uRange
    const [v0, v1] = field.vRange
    if (at.uMm < u0 || at.uMm > u1 || at.vMm < v0 || at.vMm > v1) {
      throw new PlacementRefusal(
        `${name} is outside the cut face (${uName} ${fmt(u0)} to ${fmt(u1)}, ${vName} ${fmt(v0)} to ${fmt(v1)} mm)`
      )
    }
    const sizeMm = placement.sizeMm ?? defaultSize(placement.kind, minorMm)
    const geometry =
      placement.kind === 'butterfly'
        ? buildButterfly({ face: face(), clearanceMm, placement, at, sizeMm, name })
        : buildPlaced({ field, lower, upper, clearanceMm, placement, at, sizeMm, alongU, name })
    for (const connector of geometry.connectors) {
      for (const other of placed) {
        if (footprintsOverlap(other.connector.footprint, connector.footprint)) {
          throw new PlacementRefusal(
            `${name} overlaps ${label(other.index, other.connector.kind, other.connector, other.connector.source === 'search')} — ` +
              'their sockets would share a wall; move one apart'
          )
        }
      }
      placed.push({ index, connector })
    }
    built[index] = geometry
  })

  // Then the searches, each clear of everything placed so far.
  placements.forEach((placement, index) => {
    if (placement.uMm !== null && placement.vMm !== null) return
    const keepOut = placed.map((entry) => entry.connector.footprint)
    const args = { field, lower, upper, clearanceMm, keepOut }
    const geometry =
      placement.kind === 'pins'
        ? pinJoint(args)
        : placement.kind === 'dowel'
          ? dowelJoint({ ...args, stock: placement.stock ?? 'printed' })
          : placement.kind === 'butterfly'
            ? butterflyJoint({
                face: face(),
                clearanceMm,
                keepOut,
                side: placement.side ?? null,
                depthMm: placement.depthMm ?? null,
                through: placement.through ?? false,
              })
            : tongueGrooveJoint(args)
    if (geometry === null) {
      const what =
        placement.kind === 'pins'
          ? 'a pin'
          : placement.kind === 'dowel'
            ? 'a dowel'
            : placement.kind === 'butterfly'
              ? 'a butterfly key'
              : 'a tongue'
      throw new PlacementRefusal(
        `${label(index, placement.kind, null)}: the search found no room for ${what} ` +
          'on the cut face clear of the other connectors — place it by hand, or remove it'
      )
    }
    built[index] = geometry
    for (const connector of geometry.connectors) placed.push({ index, connector })
  })

  // Belt and braces: a search keeps clear by construction, but nothing leaves here that
  // overlaps, whoever placed it.
  assertSeparate(placed, label)

  const parts = /** @type {JointGeometry[]} */ (built)
  return {
    kind: 'placements',
    pins: parts.flatMap((part) => part.pins),
    sockets: parts.flatMap((part) => part.sockets),
    holes: parts.flatMap((part) => part.holes),
    connectors: parts.flatMap((part) => part.connectors),
    ...keysAndHardware(parts),
    summary: parts.map((part) => part.summary).join('; '),
  }
}

/**
 * The key parts and bought hardware of several joint pieces, only when there are any
 * (`TODO/core-075`) — so a placement list of today's kinds builds exactly what it did.
 *
 * @param {JointGeometry[]} parts
 * @returns {Pick<JointGeometry, 'keys' | 'hardware'>}
 */
function keysAndHardware(parts) {
  const keys = parts.flatMap((part) => part.keys ?? [])
  const hardware = parts.flatMap((part) => part.hardware ?? [])
  return { ...(keys.length > 0 ? { keys } : {}), ...(hardware.length > 0 ? { hardware } : {}) }
}

/**
 * Refuse, by name, the first connector whose footprint overlaps an earlier one's.
 *
 * @param {{ index: number, connector: Connector }[]} entries In list order.
 * @param {(index: number, kind: string, at: { uMm: number, vMm: number } | null, searched?: boolean) => string} label
 */
export function assertSeparate(entries, label) {
  for (let j = 1; j < entries.length; j += 1) {
    for (let i = 0; i < j; i += 1) {
      const a = entries[i]
      const b = entries[j]
      if (footprintsOverlap(a.connector.footprint, b.connector.footprint)) {
        throw new PlacementRefusal(
          `${label(b.index, b.connector.kind, b.connector, b.connector.source === 'search')} overlaps ` +
            `${label(a.index, a.connector.kind, a.connector, a.connector.source === 'search')} — ` +
            'their sockets would share a wall; move one apart'
        )
      }
    }
  }
}

/**
 * Check and build one hand-placed butterfly key (`TODO/core-075`): on the side it was given, or
 * the side of the outline edge nearest it.
 *
 * @param {object} args
 * @param {import('./joint.butterfly.js').ButterflyFace} args.face
 * @param {number} args.clearanceMm
 * @param {Placement} args.placement
 * @param {{ uMm: number, vMm: number }} args.at
 * @param {number} args.sizeMm
 * @param {string} args.name
 * @returns {JointGeometry}
 */
function buildButterfly({ face, clearanceMm, placement, at, sizeMm, name }) {
  const side = placement.side ?? nearestSide(face, at.uMm, at.vMm)
  if (side === null) throw new PlacementRefusal(`${name} is not near the cut face's outline — a butterfly key sits on an outer surface`)
  const key = { ...at, widthMm: sizeMm, side, depthMm: placement.depthMm ?? null, through: placement.through ?? false }
  const misfit = butterflyMisfit({ face, clearanceMm, key })
  if (misfit === null) return butterfliesAt({ face, clearanceMm, keys: [key], source: 'placed' })
  if (misfit === 'off') {
    throw new PlacementRefusal(`${name} has no outer surface on that side of the cut face — tap on the edge of the face`)
  }
  if (misfit === 'floor') {
    throw new PlacementRefusal(
      `${name}: its pocket would leave less than a ${JOINT_WALL_MM} mm floor, or break through the far side — ` +
        'make it shallower, move it off a hole, or cut it right through (through)'
    )
  }
  throw new PlacementRefusal(
    `${name}: its pocket and ${JOINT_WALL_MM} mm wall would break out of the side of a piece — ` +
      'move it away from an end, a corner or a hole, or make it smaller'
  )
}

/**
 * Check and build one hand placement.
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {Geom3} args.lower
 * @param {Geom3} args.upper
 * @param {number} args.clearanceMm
 * @param {Placement} args.placement
 * @param {{ uMm: number, vMm: number }} args.at
 * @param {number} args.sizeMm
 * @param {boolean} args.alongU
 * @param {string} args.name
 * @returns {JointGeometry}
 */
function buildPlaced({ field, lower, upper, clearanceMm, placement, at, sizeMm, alongU, name }) {
  const common = { field, lower, upper, clearanceMm }
  /** @type {'wall' | 'wallA' | 'base' | 'bore' | null} */
  let misfit
  /** @type {() => JointGeometry} */
  let build
  /** @type {string} what B's wall is around, for the refusal */
  let socket = 'socket'
  if (placement.kind === 'pins') {
    misfit = pinMisfit({ ...common, diameterMm: sizeMm, centre: at })
    build = () => pinsAt({ field, clearanceMm, diameterMm: sizeMm, centres: [at], source: 'placed' })
  } else if (placement.kind === 'tongue') {
    const lengthMm = placement.lengthMm ?? TONGUE_DEFAULT_LENGTH_RATIO * sizeMm
    if (!(lengthMm >= 2 * sizeMm)) {
      throw new PlacementRefusal(
        `${name}: lengthMm must be at least twice the tongue's width (${fmt(2 * sizeMm)} mm), got ${fmt(lengthMm)}`
      )
    }
    const rib = { ...at, widthMm: sizeMm, lengthMm, alongU }
    socket = 'groove'
    misfit = tongueMisfit({ ...common, rib })
    build = () => tongueAt({ field, clearanceMm, rib, source: 'placed' })
  } else if (placement.kind === 'dowel') {
    const stock = placement.stock ?? 'printed'
    misfit = dowelMisfit({ ...common, diameterMm: sizeMm, stock, centre: at })
    build = () => dowelsAt({ field, clearanceMm, diameterMm: sizeMm, stock, centres: [at], source: 'placed' })
  } else if (placement.kind === 'wedge') {
    const wedge = { ...at, widthMm: sizeMm, alongU }
    misfit = wedgeMisfit({ ...common, wedge })
    build = () => wedgeAt({ field, clearanceMm, wedge })
  } else {
    const boss = { ...at, sizeMm, ...(placement.insertMm === null ? {} : { insertMm: placement.insertMm }) }
    misfit = screwBossMisfit({ ...common, boss })
    build = () => screwBossAt({ field, lower, clearanceMm, boss })
  }
  if (misfit === null) return build()
  if (!solidAt(field, at.uMm, at.vMm)) {
    throw new PlacementRefusal(`${name} is not on solid material — the cut face has a hole there, or ends before it`)
  }
  if (misfit === 'wall') {
    const wallMm = placement.kind === 'screwBoss' ? `${JOINT_WALL_MM}–${SCREW_BOSS_WALL_MM}` : `${JOINT_WALL_MM}`
    throw new PlacementRefusal(
      `${name}: its ${socket} and ${wallMm} mm wall would break out of piece B — move it away from the edge or a hole, or make it smaller`
    )
  }
  if (misfit === 'wallA') {
    throw new PlacementRefusal(
      `${name}: its ${socket} and ${JOINT_WALL_MM} mm wall would break out of piece A — move it away from the edge or a hole, or make it smaller`
    )
  }
  if (misfit === 'base') {
    throw new PlacementRefusal(`${name}: piece A is not solid under it — move it onto the material, or make it smaller`)
  }
  throw new PlacementRefusal(
    `${name}: its screw bore through piece A would break out of the side before reaching piece A's far face — ` +
      'place it where piece A is solid all the way through'
  )
}

