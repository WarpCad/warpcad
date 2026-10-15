// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Screw-boss joint for a split (`TODO/core-059`): a round boss standing proud of piece A's cut
 * face that locates in a socket in piece B, with a screw drawing the two together — for a
 * joint taken apart and put back many times (a removable wingtip), or one that needs more
 * clamping than a friction-fit pin gives. Only ever placed by hand.
 *
 * ## The screw's path
 *
 * The screw is driven **from outside piece A**: a clearance bore runs through the boss and on
 * through the whole of piece A, out of its far face along the cut axis, where the screw's head
 * bears. Past the boss, in piece B, the bore continues as either
 *
 * - a **pilot** for a self-tapping screw, 0.8 × the screw's diameter, or
 * - a **heat-set insert** bore of `insertMm` — the insert's own hole size, from its datasheet.
 *
 * either way {@link SCREW_ENGAGE_RATIO} × the screw's diameter deep past the socket's floor.
 *
 * A placement where that bore cannot run through solid all the way to piece A's far face is
 * refused by name, never bored out through a side wall. That makes this the joint for a
 * piece A that is solid along the cut axis to its far end — a short tip or end cap. A long
 * piece needs an equally long screw.
 *
 * ## Walls
 *
 * Every bore is wrapped in a {@link SCREW_BOSS_WALL_MM} wall, not the {@link JOINT_WALL_MM} a
 * pin's socket gets: a pin is pressed in once, a screw boss carries its clamping load every
 * time the screw is tightened. The boss is that wall around the larger of the two bores; its
 * socket in B keeps the ordinary joint wall, since it only locates.
 *
 * Millimetres, document frame, Z-up. Framework-free.
 *
 * @module core/kernel/recipes/joint.screwBoss
 */

import { boundsOf } from '../group.js'
import { JOINT_BASE_DEPTH_MM, JOINT_EMBED_MM, JOINT_WALL_MM, contains, prismAlong } from './joint.common.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./joint.common.js').ClearanceField} ClearanceField */
/** @typedef {import('./joint.common.js').Footprint} Footprint */
/** @typedef {import('./joint.pins.js').JointGeometry} JointGeometry */

/** Smallest screw, mm (M2). */
export const SCREW_MIN_MM = 2
/** Largest screw, mm (M6). */
export const SCREW_MAX_MM = 6
/** The wall around every screw bore, mm — five 0.4 mm perimeters. */
export const SCREW_BOSS_WALL_MM = 2
/** Clearance per side on the screw's bore through piece A, mm: M3 → 3.4 mm. */
export const SCREW_HOLE_CLEARANCE_MM = 0.2
/** A self-tapping pilot's diameter as a fraction of the screw's. */
export const SELF_TAP_PILOT_RATIO = 0.8
/** How deep the screw's bore runs into piece B past the boss's socket, × the screw's diameter. */
export const SCREW_ENGAGE_RATIO = 2.5
/** The largest insert bore accepted, × the screw's diameter. */
export const INSERT_MAX_RATIO = 2.5

/**
 * @param {number} value
 * @param {number} low
 * @param {number} high
 */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

/**
 * @typedef {object} ScrewBossSizing
 * @property {number} clearanceBoreMm The screw's bore through the boss and piece A.
 * @property {number} boreMm The bore in piece B: a self-tapping pilot or the insert's.
 * @property {boolean} insert Whether {@link ScrewBossSizing.boreMm} is a heat-set insert's.
 * @property {number} bossMm The boss's diameter.
 * @property {number} heightMm How far the boss stands proud.
 * @property {number} engageMm How deep B's bore runs past the socket's floor.
 */

/**
 * A screw boss's sizing for a screw of `sizeMm`, into a heat-set insert of bore `insertMm`
 * when given.
 *
 * @param {number} sizeMm
 * @param {number} [insertMm]
 * @returns {ScrewBossSizing}
 */
export function screwBossSizing(sizeMm, insertMm) {
  const clearanceBoreMm = sizeMm + 2 * SCREW_HOLE_CLEARANCE_MM
  const insert = insertMm !== undefined
  const boreMm = insert ? insertMm : SELF_TAP_PILOT_RATIO * sizeMm
  return {
    clearanceBoreMm,
    boreMm,
    insert,
    bossMm: Math.max(clearanceBoreMm, boreMm) + 2 * SCREW_BOSS_WALL_MM,
    heightMm: clamp(1.5 * sizeMm, 3, 8),
    engageMm: SCREW_ENGAGE_RATIO * sizeMm,
  }
}

/**
 * @typedef {object} ScrewBoss
 * @property {number} uMm
 * @property {number} vMm
 * @property {number} sizeMm
 * @property {number} [insertMm]
 */

/**
 * The boss's socket, or a bore's wall, whichever reaches furthest across the face.
 *
 * @param {ScrewBoss} boss
 * @param {number} clearanceMm
 * @returns {Footprint}
 */
export function screwBossFootprint(boss, clearanceMm) {
  const sizing = screwBossSizing(boss.sizeMm, boss.insertMm)
  const radiusMm = Math.max(
    sizing.bossMm / 2 + clearanceMm + JOINT_WALL_MM,
    sizing.boreMm / 2 + SCREW_BOSS_WALL_MM,
    sizing.clearanceBoreMm / 2 + SCREW_BOSS_WALL_MM
  )
  return { shape: 'circle', uMm: boss.uMm, vMm: boss.vMm, radiusMm }
}

/**
 * Why a screw boss does not fit, by exact boolean containment — `null` when it does.
 *
 * - `wall`: the boss's socket and its wall, or B's bore and its wall, would break out of B.
 * - `base`: there is not {@link JOINT_BASE_DEPTH_MM} of solid under the boss in piece A.
 * - `bore`: the screw's bore and its wall would break out of piece A before reaching its far
 *   face.
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {Geom3} args.lower
 * @param {Geom3} args.upper
 * @param {number} args.clearanceMm
 * @param {ScrewBoss} args.boss
 * @returns {'wall' | 'base' | 'bore' | null}
 */
export function screwBossMisfit({ field, lower, upper, clearanceMm, boss }) {
  const { axisIndex, cutMm } = field
  const { uMm, vMm } = boss
  const sizing = screwBossSizing(boss.sizeMm, boss.insertMm)
  const floorMm = cutMm + sizing.heightMm + clearanceMm
  const socketWall = prismAlong(axisIndex, cutMm, floorMm + JOINT_WALL_MM, uMm, vMm, {
    radiusMm: sizing.bossMm / 2 + clearanceMm + JOINT_WALL_MM,
  })
  if (!contains(upper, socketWall)) return 'wall'
  const boreWall = prismAlong(axisIndex, cutMm, floorMm + sizing.engageMm + SCREW_BOSS_WALL_MM, uMm, vMm, {
    radiusMm: sizing.boreMm / 2 + SCREW_BOSS_WALL_MM,
  })
  if (!contains(upper, boreWall)) return 'wall'
  const base = prismAlong(axisIndex, cutMm - JOINT_BASE_DEPTH_MM, cutMm, uMm, vMm, { radiusMm: sizing.bossMm / 2 })
  if (!contains(lower, base)) return 'base'
  const farMm = boundsOf(lower)[0][axisIndex]
  const throughWall = prismAlong(axisIndex, farMm, cutMm, uMm, vMm, {
    radiusMm: sizing.clearanceBoreMm / 2 + SCREW_BOSS_WALL_MM,
  })
  if (!contains(lower, throughWall)) return 'bore'
  return null
}

/**
 * A screw boss at exactly this centre — no check (ask {@link screwBossMisfit} first).
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {Geom3} args.lower Piece A, for where its far face is.
 * @param {number} args.clearanceMm
 * @param {ScrewBoss} args.boss
 * @returns {JointGeometry}
 */
export function screwBossAt({ field, lower, clearanceMm, boss }) {
  const { axisIndex, cutMm } = field
  const { uMm, vMm } = boss
  const sizing = screwBossSizing(boss.sizeMm, boss.insertMm)
  const topMm = cutMm + sizing.heightMm
  const floorMm = topMm + clearanceMm
  const farMm = boundsOf(lower)[0][axisIndex]
  const bossSolid = prismAlong(axisIndex, cutMm - JOINT_EMBED_MM, topMm, uMm, vMm, { radiusMm: sizing.bossMm / 2 })
  // Past both ends by a millimetre, so no face of the bore is coplanar with A's far face or
  // the boss's top.
  const throughBore = prismAlong(axisIndex, farMm - 1, topMm + 1, uMm, vMm, { radiusMm: sizing.clearanceBoreMm / 2 })
  const socket = prismAlong(axisIndex, cutMm - JOINT_EMBED_MM, floorMm, uMm, vMm, {
    radiusMm: sizing.bossMm / 2 + clearanceMm,
  })
  // Starts halfway up the socket, inside what the socket already removes, so it never meets
  // the socket's floor face-on — even at zero clearance.
  const bore = prismAlong(axisIndex, cutMm + sizing.heightMm / 2, floorMm + sizing.engageMm, uMm, vMm, {
    radiusMm: sizing.boreMm / 2,
  })
  const mm = (/** @type {number} */ value) => Number(value.toFixed(1))
  return {
    kind: 'placements',
    pins: [bossSolid],
    sockets: [socket, bore],
    holes: [throughBore],
    connectors: [
      {
        kind: 'screwBoss',
        source: 'placed',
        uMm,
        vMm,
        sizeMm: boss.sizeMm,
        heightMm: sizing.heightMm,
        ...(sizing.insert ? { insertMm: sizing.boreMm } : {}),
        footprint: screwBossFootprint(boss, clearanceMm),
      },
    ],
    summary:
      `screw boss for M${mm(boss.sizeMm)}, Ø${mm(sizing.bossMm)} × ${mm(sizing.heightMm)} mm, ` +
      (sizing.insert ? `Ø${mm(sizing.boreMm)} insert bore` : `Ø${mm(sizing.boreMm)} self-tapping pilot`),
  }
}
