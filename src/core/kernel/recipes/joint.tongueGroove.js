// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Tongue-and-groove joint for a split (`TODO/io-007`): one straight rib standing proud of
 * piece A's cut face along the face's long direction, and a matching groove — wider and
 * deeper by the clearance — in piece B.
 *
 * The joint for **thin sections**. A round pin needs its diameter plus a wall on each side in
 * both directions; a rib only needs that across its width, and makes up the strength in
 * length. An airfoil 12 mm thick at the spar and 3 mm at the trailing edge takes a rib along
 * its thick middle where no pin pair would fit.
 *
 * ## Sizing, and where the rib goes
 *
 * - **Width** starts at 35 % of the face's narrower side, clamped to 1–6 mm, and steps down
 *   until a rib fits. **Height** (how far it stands proud) is 2.5 × width, clamped to 3–10 mm.
 * - **Position** is searched on the face's clearance field (`joint.common.js`): along every
 *   row parallel to the long direction, the longest run of points with room for the groove
 *   and its wall. The longest run wins (the most central, between equals), capped at 60 % of
 *   the face's length so the rib stays clear of thin ends. A run shorter than two widths is no
 *   rib at all.
 * - `null` when nothing fits even at 1 mm wide.
 *
 * @module core/kernel/recipes/joint.tongueGroove
 */

import { JOINT_BASE_DEPTH_MM, JOINT_EMBED_MM, JOINT_WALL_MM, clearanceTo, contains, prismAlong } from './joint.common.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./joint.common.js').ClearanceField} ClearanceField */
/** @typedef {import('./joint.pins.js').JointGeometry} JointGeometry */

/** Narrowest rib tried, mm. */
export const TONGUE_MIN_WIDTH_MM = 1
/** Widest rib tried, mm. */
export const TONGUE_MAX_WIDTH_MM = 6
/** The deepest a groove (plus its wall) reaches past the face, for sizing the field. */
export const TONGUE_MAX_REACH_MM = 10 + 1 + JOINT_WALL_MM

/**
 * @param {number} value
 * @param {number} low
 * @param {number} high
 */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

/**
 * Plan a tongue and groove on a cut face.
 *
 * @param {object} args
 * @param {ClearanceField} args.field The uncut solid's clearance field at this cut.
 * @param {Geom3} args.lower Piece A.
 * @param {Geom3} args.upper Piece B.
 * @param {number} args.clearanceMm Added to the groove on every side and at the bottom.
 * @returns {JointGeometry | null}
 */
export function tongueGrooveJoint({ field, lower, upper, clearanceMm }) {
  const { axisIndex, cutMm, uRange, vRange, columns, rows, points } = field
  const spanU = uRange[1] - uRange[0]
  const spanV = vRange[1] - vRange[0]
  // The rib runs along the face's longer direction.
  const alongU = spanU >= spanV
  const along = alongU ? columns : rows
  const across = alongU ? rows : columns
  const pitch = (alongU ? spanU : spanV) / along
  const minor = Math.min(spanU, spanV)
  /** @param {number} a index along the rib @param {number} c index across it */
  const at = (a, c) => points[alongU ? c * columns + a : a * columns + c]

  for (let widthMm = clamp(minor * 0.35, TONGUE_MIN_WIDTH_MM, TONGUE_MAX_WIDTH_MM); widthMm >= TONGUE_MIN_WIDTH_MM - 1e-9; widthMm *= 0.75) {
    const heightMm = clamp(2.5 * widthMm, 3, 10)
    const grooveHalfMm = widthMm / 2 + clearanceMm
    const depthMm = heightMm + clearanceMm + JOINT_WALL_MM
    const wallNeed = Math.hypot(grooveHalfMm + JOINT_WALL_MM, field.depthStepMm / 2, pitch / 2)
    const baseNeed = Math.hypot(widthMm / 2, field.depthStepMm / 2, pitch / 2)
    const maxRun = Math.max(1, Math.floor((0.6 * (alongU ? spanU : spanV)) / pitch))
    const minRun = Math.max(2, Math.ceil((2 * widthMm) / pitch))

    /** @type {{ c: number, start: number, length: number }[]} */
    const runs = []
    for (let c = 0; c < across; c += 1) {
      let start = -1
      for (let a = 0; a <= along; a += 1) {
        const point = a < along ? at(a, c) : null
        const ok = point !== null && point.baseClearMm >= baseNeed && clearanceTo(field, point, depthMm) >= wallNeed
        if (ok && start < 0) start = a
        if (!ok && start >= 0) {
          runs.push({ c, start, length: a - start })
          start = -1
        }
      }
    }
    // Longest first; between equally long runs, the row nearest the middle of the face, where
    // the walls either side of the groove are most even.
    const middle = (across - 1) / 2
    runs.sort((p, q) => q.length - p.length || Math.abs(p.c - middle) - Math.abs(q.c - middle))
    for (const run of runs.slice(0, 4)) {
      if (run.length < minRun) break
      // Centre a rib of at most 60 % of the face on the run; it ends half a pitch short of the
      // run's last points, since those are only known clear at their own centres.
      const length = Math.min(run.length, maxRun)
      const first = run.start + Math.floor((run.length - length) / 2)
      const ribLengthMm = Math.max(pitch, (length - 1) * pitch) - 2 * (clearanceMm + JOINT_WALL_MM) + 2 * JOINT_WALL_MM
      if (!(ribLengthMm >= 2 * widthMm)) continue
      const mid = at(first + Math.floor(length / 2), run.c)
      const startPoint = at(first, run.c)
      const endPoint = at(first + length - 1, run.c)
      const centreAlong = alongU ? (startPoint.uMm + endPoint.uMm) / 2 : (startPoint.vMm + endPoint.vMm) / 2
      const uMm = alongU ? centreAlong : mid.uMm
      const vMm = alongU ? mid.vMm : centreAlong
      /** @param {number} longMm @param {number} wideMm */
      const section = (longMm, wideMm) => (alongU ? { uSizeMm: longMm, vSizeMm: wideMm } : { uSizeMm: wideMm, vSizeMm: longMm })

      const grooveProbe = prismAlong(
        axisIndex,
        cutMm,
        cutMm + depthMm,
        uMm,
        vMm,
        section(ribLengthMm + 2 * (clearanceMm + JOINT_WALL_MM), widthMm + 2 * (clearanceMm + JOINT_WALL_MM))
      )
      const baseProbe = prismAlong(axisIndex, cutMm - JOINT_BASE_DEPTH_MM, cutMm, uMm, vMm, section(ribLengthMm, widthMm))
      if (!contains(upper, grooveProbe) || !contains(lower, baseProbe)) continue

      const tongue = prismAlong(axisIndex, cutMm - JOINT_EMBED_MM, cutMm + heightMm, uMm, vMm, section(ribLengthMm, widthMm))
      const groove = prismAlong(
        axisIndex,
        cutMm - JOINT_EMBED_MM,
        cutMm + heightMm + clearanceMm,
        uMm,
        vMm,
        section(ribLengthMm + 2 * clearanceMm, widthMm + 2 * clearanceMm)
      )
      return {
        kind: 'tongue',
        pins: [tongue],
        sockets: [groove],
        summary: `tongue ${Number(ribLengthMm.toFixed(1))} × ${Number(widthMm.toFixed(1))} × ${Number(heightMm.toFixed(1))} mm`,
      }
    }
  }
  return null
}
