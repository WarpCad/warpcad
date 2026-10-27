// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Loose-tenon joint for a split (`TODO/core-075`, stage 3): a flat stadium-shaped key — a
 * floating tenon, a spline, a "Domino" — in matching mortises in **both** cut faces.
 *
 * ## Why a tenon, when dowels already exist
 *
 * A round dowel stops the pieces sliding across the face but not turning about it; that takes
 * two. One tenon, longer than it is thick, stops both. It prints lying on its big flat face, so
 * the cut plane — where the joint takes its shear — crosses its layers square, the strong way.
 *
 * ## Sizing (starting numbers, `TODO/core-075` "Each kind")
 *
 * - **Section** in the face: a stadium **width** *w* (6–30 mm) along its long axis, **thickness**
 *   *t* (3–8 mm) across it, the ends round (radius half of *t*). The width is at least twice the
 *   thickness, so the key always has a big face to print on.
 * - **Long axis** along the face's longer direction — the tongue's rule (`ribAlongU`).
 * - **Mortise** in each piece: 1.5 × *w* deep, the stadium grown by the clearance square to every
 *   side (`joint.common.js`'s mitred {@link offsetOutline}). Each needs a {@link JOINT_WALL_MM}
 *   wall, sides and floor, in **its own** piece.
 * - **Tenon**: 2 × clearance shorter than the two mortises together, so it never bottoms out.
 *   On the side it prints on, each round end is cut back to a 45° chamfer from the bed to its
 *   widest point (a half teardrop, {@link tenonProfile}), so the key prints without supports; the
 *   mortise stays the full stadium, so the key is inside it with at least the clearance all round.
 * - **Search**: thickness from 35 % of the face's narrower side (3–8 mm), width 4 × that, at most
 *   60 % of the face's long side, both stepping down by a quarter until a tenon fits. Two tenons
 *   end to end along the long axis when two fit at that size (the pair furthest apart, on the
 *   face's middle line), else one — the first size that fits anything wins, since one tenon
 *   already stops the pieces turning. Never two side by side across the thickness.
 *
 * Returns geometry only: the op cuts A's mortises (`holes`) and B's (`sockets`), and adds each
 * tenon as a key part (`keys`), assembled in its mortises, that prints on its big face
 * (`bedNormal`, square to the face along the thickness).
 *
 * Millimetres, document frame, Z-up. Framework-free.
 *
 * @module core/kernel/recipes/joint.tenon
 */

import {
  JOINT_EMBED_MM,
  JOINT_WALL_MM,
  clearanceBelow,
  clearanceTo,
  contains,
  faceAxes,
  footprintsOverlap,
  nearestFieldPoint,
  offsetOutline,
  outlinePrismAlong,
} from './joint.common.js'
import { ribAlongU } from './joint.tongueGroove.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./joint.common.js').ClearanceField} ClearanceField */
/** @typedef {import('./joint.common.js').Footprint} Footprint */
/** @typedef {import('./joint.common.js').FacePoint} FacePoint */
/** @typedef {import('./joint.pins.js').JointGeometry} JointGeometry */
/** @typedef {import('../group.js').PartMeta} PartMeta */
/** @typedef {[number, number, number]} Vec3Mm */

/** Narrowest tenon, mm (its long dimension in the face). */
export const TENON_MIN_WIDTH_MM = 6
/** Widest tenon, mm. */
export const TENON_MAX_WIDTH_MM = 30
/** Thinnest tenon, mm. */
export const TENON_MIN_THICKNESS_MM = 3
/** Thickest tenon, mm. */
export const TENON_MAX_THICKNESS_MM = 8
/** How deep a mortise is in each piece, × the tenon's width. */
export const TENON_EMBED_RATIO = 1.5
/** Segments on each round end: a half of the 32-gon every joint cylinder uses. */
const END_SEGMENTS = 16

/**
 * One tenon on the face: its centre, its width (along) and thickness (across), and which face
 * axis its long axis runs along.
 *
 * @typedef {object} Tenon
 * @property {number} uMm
 * @property {number} vMm
 * @property {number} widthMm
 * @property {number} thicknessMm
 * @property {boolean} alongU
 */

/**
 * @param {number} value
 * @param {number} low
 * @param {number} high
 */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

/** @param {number} mm */
const fmt = (mm) => String(Number(mm.toFixed(2)))

/**
 * A tenon's sizing — the one rule the search, a hand placement, the Split sheet's pieces list and
 * `assembly.txt` all use.
 *
 * @param {number} widthMm
 * @param {number} thicknessMm
 * @param {number} clearanceMm Per side.
 * @returns {{ widthMm: number, thicknessMm: number, mortiseDepthMm: number, lengthMm: number }}
 *   `mortiseDepthMm` in each piece; `lengthMm` the tenon's, along the cut axis.
 */
export function tenonSizing(widthMm, thicknessMm, clearanceMm) {
  const mortiseDepthMm = TENON_EMBED_RATIO * widthMm
  return { widthMm, thicknessMm, mortiseDepthMm, lengthMm: 2 * mortiseDepthMm - 2 * clearanceMm }
}

/**
 * How far a tenon's mortise plus its floor reaches either side of the face, for sizing the field.
 *
 * @param {number} widthMm
 * @returns {number}
 */
export function tenonReachMm(widthMm) {
  return TENON_EMBED_RATIO * widthMm + 1 + JOINT_WALL_MM
}

/**
 * What a tenon is called, for a person: its key label and its size as it lies on the bed
 * (length × width × thickness).
 *
 * @param {number} widthMm
 * @param {number} thicknessMm
 * @param {number} clearanceMm
 * @returns {{ keyLabel: string, keySizeMm: Vec3Mm }}
 */
export function describeTenon(widthMm, thicknessMm, clearanceMm) {
  const { lengthMm } = tenonSizing(widthMm, thicknessMm, clearanceMm)
  return { keyLabel: `Tenon ${fmt(lengthMm)} × ${fmt(widthMm)} × ${fmt(thicknessMm)} mm`, keySizeMm: [lengthMm, widthMm, thicknessMm] }
}

/**
 * The stadium about its centre, counter-clockwise in `(u, v)`: two half 32-gons of radius `t/2`,
 * `w − t` apart, joined by straight sides; along `u`, or a quarter turn along `v`.
 *
 * @param {number} widthMm
 * @param {number} thicknessMm
 * @param {boolean} alongU
 * @returns {[number, number][]}
 */
export function stadiumOutline(widthMm, thicknessMm, alongU) {
  if (!(widthMm > thicknessMm && thicknessMm > 0)) {
    throw new Error(`a stadium needs a width greater than its thickness, got ${widthMm} × ${thicknessMm} mm`)
  }
  const r = thicknessMm / 2
  const a = (widthMm - thicknessMm) / 2
  /** @type {[number, number][]} along, across */
  const corners = []
  for (let k = 0; k <= END_SEGMENTS; k += 1) {
    const angle = -Math.PI / 2 + (k * Math.PI) / END_SEGMENTS
    corners.push([a + r * Math.cos(angle), r * Math.sin(angle)])
  }
  for (let k = 0; k <= END_SEGMENTS; k += 1) {
    const angle = Math.PI / 2 + (k * Math.PI) / END_SEGMENTS
    corners.push([-a + r * Math.cos(angle), r * Math.sin(angle)])
  }
  // Along v is a quarter turn, which keeps the winding.
  return alongU ? corners : corners.map(([along, across]) => /** @type {[number, number]} */ ([-across, along]))
}

/**
 * The key's own section: the stadium with the bed-side quarter of each round end replaced by a
 * 45° chamfer from the flat to the end's widest point — still convex, still inside the stadium.
 * The bed side is the outline's low side across the long axis ({@link tenonBedNormal}).
 *
 * @param {number} widthMm
 * @param {number} thicknessMm
 * @param {boolean} alongU
 * @returns {[number, number][]}
 */
export function tenonProfile(widthMm, thicknessMm, alongU) {
  const stadium = stadiumOutline(widthMm, thicknessMm, true)
  const n = END_SEGMENTS + 1
  const half = END_SEGMENTS / 2
  // Right end: k = 0 is the bed corner, k = half its widest point. Left end: k = half its widest
  // point, k = END_SEGMENTS the bed corner. Drop the arc points between each pair.
  const keep = stadium.filter((_, i) => (i < n ? i === 0 || i >= half : i - n <= half || i - n === END_SEGMENTS))
  return alongU ? keep : keep.map(([along, across]) => /** @type {[number, number]} */ ([-across, along]))
}

/**
 * The outward normal of a tenon's big flat face — the face it prints on, the side
 * {@link tenonProfile} chamfers: the thickness axis, toward the outline's low side across the
 * long axis (down, for a tenon lying flat in a plank).
 *
 * @param {number} axisIndex
 * @param {boolean} alongU
 * @returns {Vec3Mm}
 */
export function tenonBedNormal(axisIndex, alongU) {
  const [u, v] = faceAxes(axisIndex)
  /** @type {Vec3Mm} */
  const normal = [0, 0, 0]
  // Along v the outline is a quarter turn, `u = −across`: the low side across is +u.
  if (alongU) normal[v] = -1
  else normal[u] = 1
  return normal
}

/**
 * A tenon's mortise plus wall on the face.
 *
 * @param {Tenon} tenon
 * @param {number} clearanceMm
 * @returns {Footprint}
 */
export function tenonFootprint(tenon, clearanceMm) {
  const halfLong = tenon.widthMm / 2 + clearanceMm + JOINT_WALL_MM
  const halfWide = tenon.thicknessMm / 2 + clearanceMm + JOINT_WALL_MM
  return {
    shape: 'rect',
    uMm: tenon.uMm,
    vMm: tenon.vMm,
    halfUMm: tenon.alongU ? halfLong : halfWide,
    halfVMm: tenon.alongU ? halfWide : halfLong,
  }
}

/**
 * Why a tenon does not fit, by exact boolean containment — `null` when it does.
 *
 * - `wall`: its mortise plus a {@link JOINT_WALL_MM} wall (sides and floor) would break out of B.
 * - `wallA`: the same in piece A.
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {Geom3} args.lower
 * @param {Geom3} args.upper
 * @param {number} args.clearanceMm
 * @param {Tenon} args.tenon
 * @returns {'wall' | 'wallA' | null}
 */
export function tenonMisfit({ field, lower, upper, clearanceMm, tenon }) {
  const { axisIndex, cutMm } = field
  const { mortiseDepthMm } = tenonSizing(tenon.widthMm, tenon.thicknessMm, clearanceMm)
  const walled = offsetOutline(stadiumOutline(tenon.widthMm, tenon.thicknessMm, tenon.alongU), clearanceMm + JOINT_WALL_MM)
  const reach = mortiseDepthMm + JOINT_WALL_MM
  if (!contains(upper, outlinePrismAlong(axisIndex, cutMm, cutMm + reach, tenon.uMm, tenon.vMm, walled))) return 'wall'
  if (!contains(lower, outlinePrismAlong(axisIndex, cutMm - reach, cutMm, tenon.uMm, tenon.vMm, walled))) return 'wallA'
  return null
}

/**
 * Tenons and their mortises at exactly these places — no search, no check (ask
 * {@link tenonMisfit} first).
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {number} args.clearanceMm
 * @param {Tenon[]} args.tenons
 * @param {'search' | 'placed'} [args.source]
 * @returns {JointGeometry}
 */
export function tenonsAt({ field, clearanceMm, tenons, source = 'search' }) {
  const { axisIndex, cutMm } = field
  /** @type {Geom3[]} */
  const holes = []
  /** @type {Geom3[]} */
  const sockets = []
  /** @type {{ solid: Geom3, meta: PartMeta }[]} */
  const keys = []
  for (const tenon of tenons) {
    const { widthMm: w, thicknessMm: t, uMm, vMm, alongU } = tenon
    const { mortiseDepthMm, lengthMm } = tenonSizing(w, t, clearanceMm)
    const nominal = stadiumOutline(w, t, alongU)
    const grown = offsetOutline(nominal, clearanceMm)
    // Each mortise starts a little past the face on the other side, so its boolean never meets a
    // coplanar face; that part of it is outside its own piece.
    holes.push(outlinePrismAlong(axisIndex, cutMm - mortiseDepthMm, cutMm + JOINT_EMBED_MM, uMm, vMm, grown))
    sockets.push(outlinePrismAlong(axisIndex, cutMm - JOINT_EMBED_MM, cutMm + mortiseDepthMm, uMm, vMm, grown))
    const words = describeTenon(w, t, clearanceMm)
    keys.push({
      solid: outlinePrismAlong(axisIndex, cutMm - lengthMm / 2, cutMm + lengthMm / 2, uMm, vMm, tenonProfile(w, t, alongU)),
      meta: {
        role: 'key',
        kind: 'tenon',
        shape: `tenon-${fmt(w)}x${fmt(t)}x${fmt(lengthMm)}`,
        label: words.keyLabel,
        sizeMm: w,
        thicknessMm: t,
        bedNormal: tenonBedNormal(axisIndex, alongU),
      },
    })
  }
  const first = tenons[0]
  const summary =
    first === undefined
      ? 'no tenon'
      : `${tenons.length} tenon${tenons.length === 1 ? '' : 's'}, ${describeTenon(first.widthMm, first.thicknessMm, clearanceMm).keyLabel.replace(/^Tenon /, '')}`
  return {
    kind: /** @type {any} */ ('tenon'),
    pins: [],
    sockets,
    holes,
    keys,
    connectors: tenons.map((tenon) => ({
      kind: /** @type {any} */ ('tenon'),
      source,
      uMm: tenon.uMm,
      vMm: tenon.vMm,
      sizeMm: tenon.widthMm,
      thicknessMm: tenon.thicknessMm,
      lengthMm: tenonSizing(tenon.widthMm, tenon.thicknessMm, clearanceMm).lengthMm,
      footprint: tenonFootprint(tenon, clearanceMm),
    })),
    summary,
  }
}

/**
 * The sizes a search tries, largest first — or exactly what was asked for.
 *
 * @param {number} longMm The face's extent along the tenon's long axis.
 * @param {number} shortMm Across it.
 * @param {number | null} [widthMm] A fixed width.
 * @param {number | null} [thicknessMm] A fixed thickness.
 * @returns {{ widthMm: number, thicknessMm: number }[]}
 */
export function tenonCandidates(longMm, shortMm, widthMm = null, thicknessMm = null) {
  if (widthMm !== null && thicknessMm !== null) return [{ widthMm, thicknessMm }]
  /** @type {number[]} */
  const thicknesses = []
  if (thicknessMm !== null) thicknesses.push(thicknessMm)
  else {
    const top = clamp(0.35 * shortMm, TENON_MIN_THICKNESS_MM, TENON_MAX_THICKNESS_MM)
    for (let t = top; t >= TENON_MIN_THICKNESS_MM - 1e-9; t *= 0.75) thicknesses.push(t)
    if (thicknesses.at(-1) !== TENON_MIN_THICKNESS_MM) thicknesses.push(TENON_MIN_THICKNESS_MM)
  }
  /** @type {{ widthMm: number, thicknessMm: number }[]} */
  const out = []
  for (const t of thicknesses) {
    if (widthMm !== null) {
      if (widthMm >= 2 * t - 1e-9) out.push({ widthMm, thicknessMm: t })
      continue
    }
    const least = Math.max(TENON_MIN_WIDTH_MM, 2 * t)
    const top = Math.min(TENON_MAX_WIDTH_MM, 4 * t, 0.6 * longMm)
    if (top < least - 1e-9) continue
    for (let w = top; w >= least - 1e-9; w *= 0.75) out.push({ widthMm: w, thicknessMm: t })
    if (out.at(-1)?.widthMm !== least) out.push({ widthMm: least, thicknessMm: t })
  }
  return out
}

/**
 * The tenon a hand placement gets for any size it leaves out: the search's first candidate on
 * this face, or the smallest tenon when even that does not fit the face.
 *
 * @param {ClearanceField} field
 * @param {number | null} widthMm
 * @param {number | null} thicknessMm
 * @returns {{ widthMm: number, thicknessMm: number }}
 */
export function defaultTenon(field, widthMm, thicknessMm) {
  const spanU = field.uRange[1] - field.uRange[0]
  const spanV = field.vRange[1] - field.vRange[0]
  const alongU = ribAlongU(field)
  const [first] = tenonCandidates(alongU ? spanU : spanV, alongU ? spanV : spanU, widthMm, thicknessMm)
  if (first) return first
  const t = thicknessMm ?? TENON_MIN_THICKNESS_MM
  return { widthMm: widthMm ?? Math.max(TENON_MIN_WIDTH_MM, 2 * t), thicknessMm: t }
}

/**
 * Plan loose tenons on a cut face: two if two fit end to end along the long axis at the largest
 * size that fits (the pair furthest apart), otherwise one. The field must have been sampled under the face
 * (`clearanceField`'s `maxBelowMm`) as deep as the widest candidate's mortise.
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {Geom3} args.lower
 * @param {Geom3} args.upper
 * @param {number} args.clearanceMm
 * @param {number | null} [args.widthMm] A fixed width; default the search's own.
 * @param {number | null} [args.thicknessMm] A fixed thickness.
 * @param {Footprint[]} [args.keepOut]
 * @returns {JointGeometry | null} `null` when no tenon fits.
 */
export function tenonJoint({ field, lower, upper, clearanceMm, widthMm = null, thicknessMm = null, keepOut = [] }) {
  const alongU = ribAlongU(field)
  const spanU = field.uRange[1] - field.uRange[0]
  const spanV = field.vRange[1] - field.vRange[0]
  const centreU = (field.uRange[0] + field.uRange[1]) / 2
  const centreV = (field.vRange[0] + field.vRange[1]) / 2
  for (const size of tenonCandidates(alongU ? spanU : spanV, alongU ? spanV : spanU, widthMm, thicknessMm)) {
    const { widthMm: w, thicknessMm: t } = size
    const { mortiseDepthMm } = tenonSizing(w, t, clearanceMm)
    const reach = mortiseDepthMm + JOINT_WALL_MM
    const need = Math.hypot(t / 2 + clearanceMm + JOINT_WALL_MM, field.depthStepMm / 2, field.stepMm / 2)
    const half = (w - t) / 2
    const samples = Math.max(1, Math.ceil((2 * half) / field.stepMm))
    /** @param {FacePoint} point */
    const clear = (point) => {
      for (let k = 0; k <= samples; k += 1) {
        const s = -half + (2 * half * k) / samples
        const at = nearestFieldPoint(field, alongU ? point.uMm + s : point.uMm, alongU ? point.vMm : point.vMm + s)
        if (at === null || clearanceTo(field, at, reach) < need || clearanceBelow(field, at, reach) < need) return false
      }
      return true
    }
    /** @param {FacePoint} point @returns {Tenon} */
    const tenonAt = (point) => ({ uMm: point.uMm, vMm: point.vMm, widthMm: w, thicknessMm: t, alongU })
    const fits = field.points.filter(
      (point) => clear(point) && keepOut.every((other) => !footprintsOverlap(other, tenonFootprint(tenonAt(point), clearanceMm)))
    )
    if (fits.length === 0) continue

    // Two tenons sit end to end along the long axis, never side by side across the thickness: the
    // pair furthest apart along it, and between equals the pair nearest the face's middle line.
    const along = (/** @type {FacePoint} */ p) => (alongU ? p.uMm : p.vMm)
    const across = (/** @type {FacePoint} */ p) => Math.abs((alongU ? p.vMm : p.uMm) - (alongU ? centreV : centreU))
    const apartMm = w + 2 * (clearanceMm + JOINT_WALL_MM)
    let best = /** @type {[number, number] | null} */ (null)
    let bestApart = apartMm
    let bestOff = Infinity
    for (let i = 0; i < fits.length; i += 1) {
      for (let j = i + 1; j < fits.length; j += 1) {
        const apart = Math.abs(along(fits[i]) - along(fits[j]))
        if (apart < apartMm - 1e-9) continue
        const off = across(fits[i]) + across(fits[j])
        if (apart > bestApart + 1e-9 || (apart > bestApart - 1e-9 && off < bestOff - 1e-9)) {
          bestApart = apart
          bestOff = off
          best = [i, j]
        }
      }
    }
    // One tenon: the most material round it, and between equals the one nearest the middle.
    const least = (/** @type {FacePoint} */ p) => Math.min(clearanceTo(field, p, reach), clearanceBelow(field, p, reach))
    const offCentre = (/** @type {FacePoint} */ p) => Math.hypot(p.uMm - centreU, p.vMm - centreV)
    const middle = fits.reduce((a, b) => {
      const gain = least(b) - least(a)
      return gain > 1e-9 || (Math.abs(gain) <= 1e-9 && offCentre(b) < offCentre(a)) ? b : a
    })
    const centres = best ? [fits[best[0]], fits[best[1]]] : [middle]
    const confirmed = centres
      .map(tenonAt)
      .filter((tenon) => tenonMisfit({ field, lower, upper, clearanceMm, tenon }) === null)
    if (confirmed.length > 0) return tenonsAt({ field, clearanceMm, tenons: confirmed })
    if (best && tenonMisfit({ field, lower, upper, clearanceMm, tenon: tenonAt(middle) }) === null) {
      return tenonsAt({ field, clearanceMm, tenons: [tenonAt(middle)] })
    }
  }
  return null
}
