// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Seam profiles for a split (`TODO/core-075`, stage 4): joints that shape the **whole seam**
 * rather than sitting at points on it — a **sliding dovetail**, **puzzle tabs**, a **half lap**
 * and a **finger joint**. One builder serves all four, because each is the same move:
 *
 * - **Feature** = the nominal shape ∩ the **uncut** solid, unioned onto piece A. Every feature
 *   starts {@link JOINT_EMBED_MM} short of the face on A's side, so the union fuses rather than
 *   touches; it runs out past the outer surface wherever the joint is meant to reach it, and the
 *   clip to the solid trims it there.
 * - **Cavity** = the nominal shape grown by `clearanceMm` square to every side (a mitred offset,
 *   `joint.common.js`'s `offsetOutline`), subtracted from piece B only.
 *
 * The cut face itself stays a butted contact face with no gap, as it is for every other joint.
 *
 * ## The face frame
 *
 * On the cut face's section (its outline at the cut, `sectionOutline`), `s` is the longer side —
 * the **seam** — and `t` the shorter — the **thickness**. A section is **plate-like** when
 * `t ≤ s / 4`; puzzle tabs and a half lap need one, and refuse otherwise with that reason.
 *
 * ## Each kind
 *
 * - **Sliding dovetail**: a trapezoid rail along `s`, the full length of the face, standing
 *   3–8 mm proud (default `t / 2`, clamped), its neck at least two walls wide (default `t / 3`),
 *   flaring 15° per side. B slides on from one end, along `s`, and nothing else frees it.
 * - **Puzzle tabs**: `count` necked, round-headed tabs (default one per ~40 mm of seam), the head
 *   twice the neck across, the neck `neck / 4` long before the head; through the whole
 *   thickness. B drops on along `t`.
 * - **Half lap**: A keeps the −`t` half for `lapMm` past the cut (default `2t`, at least 10 mm),
 *   B the +`t` half. B drops on along `t` — or, with magnets or dowels added (`TODO/core-075`
 *   decision 4: the one pairing allowed), slides on along the cut axis.
 * - **Finger joint**: `count` fingers across the seam (default the seam over about `3t`, odd so
 *   both ends are A's), `depthMm` deep (default `2t`), through the thickness; A owns the even ones.
 *
 * Every profile makes piece A **longer than the cut offset** by how far it stands proud — the
 * Split sheet reads the real bounds from the plan (`split.js`'s `previewSplitFace`).
 *
 * Millimetres, document frame, Z-up. Framework-free.
 *
 * @module core/kernel/recipes/joint.profiles
 */

import modeling from '@jscad/modeling'

import { boundsOf } from '../group.js'
import { JOINT_EMBED_MM, JOINT_SEGMENTS, JOINT_WALL_MM, faceAxes, offsetOutline, outlinePrismAlong, sectionOutline } from './joint.common.js'

const { booleans, primitives } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./joint.pins.js').JointGeometry} JointGeometry */

/** The profile joints, in the Split sheet's order. */
export const PROFILE_JOINTS = Object.freeze(/** @type {const} */ (['dovetail', 'puzzle', 'lap', 'finger']))

/** What each profile is called, for a person. */
export const PROFILE_LABELS = Object.freeze({
  dovetail: 'Sliding dovetail',
  puzzle: 'Puzzle tabs',
  lap: 'Half lap',
  finger: 'Finger joint',
})

/** The same, as the subject of a sentence (a refusal). */
const SUBJECT = Object.freeze({ dovetail: 'a sliding dovetail', puzzle: 'puzzle tabs', lap: 'a half lap', finger: 'a finger joint' })

export const DOVETAIL_MIN_HEIGHT_MM = 3
export const DOVETAIL_MAX_HEIGHT_MM = 8
/** Flare per side, degrees. */
export const DOVETAIL_FLARE_DEG = 15
export const DOVETAIL_MIN_NECK_MM = 2 * JOINT_WALL_MM
export const DOVETAIL_MAX_NECK_MM = 30

export const PUZZLE_MIN_NECK_MM = 2
export const PUZZLE_MAX_NECK_MM = 20
export const PUZZLE_MAX_TABS = 16

export const LAP_MIN_MM = 2
export const LAP_MAX_MM = 200
/** A default lap is twice the thickness, but never shorter than this. */
const LAP_DEFAULT_MIN_MM = 10

export const FINGER_MIN_COUNT = 2
export const FINGER_MAX_COUNT = 31
export const FINGER_MIN_DEPTH_MM = 2
export const FINGER_MAX_DEPTH_MM = 60
/** The narrowest finger, mm — A's, and B's after its clearance. */
const FINGER_MIN_WIDTH_MM = 2

/** A plate-like section's thickness is at most the seam length over this. */
export const PLATE_RATIO = 4

/** How far a feature that runs out to the surface overshoots it before the clip, mm. */
const PAD_MM = 1

const AXIS_NAMES = /** @type {const} */ (['x', 'y', 'z'])
const TAN_FLARE = Math.tan((DOVETAIL_FLARE_DEG * Math.PI) / 180)

/** A profile's refusal; the op prefixes its own name. */
export class ProfileRefusal extends Error {}

/** @param {number} mm */
const fmt = (mm) => String(Number(mm.toFixed(2)))
/** @param {number} value @param {number} low @param {number} high */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

/**
 * The cut face in the profile's frame.
 *
 * @typedef {object} ProfileFace
 * @property {number} axisIndex The cut axis, `n`.
 * @property {number} cutMm
 * @property {number} s The seam axis (the section's longer side).
 * @property {number} t The thickness axis.
 * @property {[number, number]} sRange
 * @property {[number, number]} tRange
 * @property {number} lengthMm The seam's length.
 * @property {number} thicknessMm
 * @property {number} endMm Where the solid ends beyond the cut, along `n`.
 */

/**
 * @param {Geom3} solid The uncut solid.
 * @param {number} axisIndex
 * @param {number} cutMm
 * @returns {ProfileFace}
 */
export function profileFace(solid, axisIndex, cutMm) {
  const { u, v, segments } = sectionOutline(solid, axisIndex, cutMm)
  if (segments.length === 0) throw new ProfileRefusal('the cut face has no outline to shape a seam on')
  const uRange = /** @type {[number, number]} */ ([Infinity, -Infinity])
  const vRange = /** @type {[number, number]} */ ([Infinity, -Infinity])
  for (const { a, b } of segments) {
    for (const [pu, pv] of [a, b]) {
      uRange[0] = Math.min(uRange[0], pu)
      uRange[1] = Math.max(uRange[1], pu)
      vRange[0] = Math.min(vRange[0], pv)
      vRange[1] = Math.max(vRange[1], pv)
    }
  }
  const alongU = uRange[1] - uRange[0] >= vRange[1] - vRange[0]
  const [sRange, tRange] = alongU ? [uRange, vRange] : [vRange, uRange]
  return {
    axisIndex,
    cutMm,
    s: alongU ? u : v,
    t: alongU ? v : u,
    sRange,
    tRange,
    lengthMm: sRange[1] - sRange[0],
    thicknessMm: tRange[1] - tRange[0],
    endMm: boundsOf(solid)[1][axisIndex],
  }
}

/**
 * A profile's options, as `split.js` read and range-checked them; `null` for the default.
 *
 * @typedef {object} ProfileOptions
 * @property {number | null} [sizeMm] A dovetail's or a puzzle tab's neck.
 * @property {number | null} [heightMm] A dovetail's height.
 * @property {number | null} [count] Puzzle tabs or fingers.
 * @property {number | null} [lapMm]
 * @property {number | null} [depthMm] A finger's.
 */

/**
 * A profile's sizes on a face of this length and thickness — the defaults the TODO states, or
 * what was asked for. Refusals of a size that cannot fit come later, from {@link profileJoint}.
 *
 * @param {'dovetail' | 'puzzle' | 'lap' | 'finger'} kind
 * @param {{ lengthMm: number, thicknessMm: number }} face
 * @param {number} clearanceMm
 * @param {ProfileOptions} options
 * @returns {{ heightMm: number, neckMm: number, count: number, headMm: number, neckLengthMm: number, lapMm: number, depthMm: number, growMm: number }}
 */
export function profileSizing(kind, face, clearanceMm, options) {
  const T = face.thicknessMm
  const L = face.lengthMm
  const out = { heightMm: 0, neckMm: 0, count: 0, headMm: 0, neckLengthMm: 0, lapMm: 0, depthMm: 0, growMm: 0 }
  if (kind === 'dovetail') {
    const room = (/** @type {number} */ h) => T - 2 * h * TAN_FLARE - 2 * clearanceMm - 2 * JOINT_WALL_MM
    let heightMm = options.heightMm ?? clamp(T / 2, DOVETAIL_MIN_HEIGHT_MM, DOVETAIL_MAX_HEIGHT_MM)
    const neckFor = (/** @type {number} */ h) =>
      options.sizeMm ?? clamp(Math.min(T / 3, room(h)), DOVETAIL_MIN_NECK_MM, DOVETAIL_MAX_NECK_MM)
    let neckMm = neckFor(heightMm)
    if (options.heightMm == null && neckMm > room(heightMm) + 1e-9) {
      heightMm = DOVETAIL_MIN_HEIGHT_MM
      neckMm = neckFor(heightMm)
    }
    return { ...out, heightMm, neckMm, growMm: heightMm }
  }
  if (kind === 'puzzle') {
    const count = options.count ?? Math.max(1, Math.round(L / 40))
    const neckMm = options.sizeMm ?? clamp(L / count / 5, PUZZLE_MIN_NECK_MM, PUZZLE_MAX_NECK_MM)
    const neckLengthMm = neckMm / 4
    const headMm = 2 * neckMm
    return { ...out, count, neckMm, headMm, neckLengthMm, growMm: neckLengthMm + headMm }
  }
  if (kind === 'lap') {
    const lapMm = options.lapMm ?? Math.max(2 * T, LAP_DEFAULT_MIN_MM)
    return { ...out, lapMm, growMm: lapMm }
  }
  let count = options.count ?? null
  if (count === null) {
    const ratio = L / (3 * T)
    count = Math.round(ratio)
    if (count % 2 === 0) count += ratio >= count ? 1 : -1
    count = clamp(count, 3, FINGER_MAX_COUNT)
  }
  const depthMm = options.depthMm ?? clamp(2 * T, FINGER_MIN_DEPTH_MM, FINGER_MAX_DEPTH_MM)
  return { ...out, count, depthMm, growMm: depthMm }
}

/**
 * A box from per-axis `[lo, hi]` ranges, indexed by axis.
 *
 * @param {[number, number][]} ranges
 * @returns {Geom3}
 */
function box(ranges) {
  return primitives.cuboid({
    size: /** @type {[number, number, number]} */ (ranges.map(([a, b]) => b - a)),
    center: /** @type {[number, number, number]} */ (ranges.map(([a, b]) => (a + b) / 2)),
  })
}

/**
 * Per-axis ranges from named ones.
 *
 * @param {Record<number, [number, number]>} named
 * @returns {[number, number][]}
 */
function ranges(named) {
  return [0, 1, 2].map((axis) => named[axis])
}

/** Shoelace, signed. @param {[number, number][]} corners */
function signedArea(corners) {
  let twice = 0
  for (let i = 0; i < corners.length; i += 1) {
    const [x0, y0] = corners[i]
    const [x1, y1] = corners[(i + 1) % corners.length]
    twice += x0 * y1 - x1 * y0
  }
  return twice / 2
}

/**
 * A prism along `alongAxis` whose convex section is `corners`, given as `(first, other)` where
 * `first` is `firstAxis` and `other` the remaining axis.
 *
 * @param {number} alongAxis
 * @param {number} fromMm
 * @param {number} toMm
 * @param {number} firstAxis
 * @param {[number, number][]} corners
 * @returns {Geom3}
 */
function prismOn(alongAxis, fromMm, toMm, firstAxis, corners) {
  const [u] = faceAxes(alongAxis)
  let outline = corners.map(([a, b]) => /** @type {[number, number]} */ (u === firstAxis ? [a, b] : [b, a]))
  if (signedArea(outline) < 0) outline = outline.reverse()
  return outlinePrismAlong(alongAxis, fromMm, toMm, 0, 0, outline)
}

/**
 * A regular polygon standing in for a circle (the head of a puzzle tab), counter-clockwise.
 *
 * @param {number} a0 Centre, first coordinate.
 * @param {number} b0
 * @param {number} radiusMm Circumradius.
 * @returns {[number, number][]}
 */
function circle(a0, b0, radiusMm) {
  return Array.from({ length: JOINT_SEGMENTS }, (_, k) => {
    const angle = (2 * Math.PI * k) / JOINT_SEGMENTS
    return /** @type {[number, number]} */ ([a0 + radiusMm * Math.cos(angle), b0 + radiusMm * Math.sin(angle)])
  })
}

/**
 * What a profile records about itself — on the plan and on piece A's metadata (`group.js`'s
 * `PartMeta.seam`), so `assembly.txt` can say how the pieces go together.
 *
 * @typedef {object} SeamInfo
 * @property {'dovetail' | 'puzzle' | 'lap' | 'finger'} kind
 * @property {string} label
 * @property {'x' | 'y' | 'z'} along The axis B moves along to go on.
 * @property {number} growMm How far the profile stands proud of the cut on A.
 * @property {number} [heightMm]
 * @property {number} [neckMm]
 * @property {number} [headMm]
 * @property {number} [neckLengthMm]
 * @property {number} [count]
 * @property {number} [lapMm]
 * @property {number} [depthMm]
 */

/**
 * Plan one seam profile: its feature (unioned onto A) and cavity (cut from B).
 *
 * @param {object} args
 * @param {Geom3} args.solid The uncut solid.
 * @param {number} args.axisIndex
 * @param {number} args.cutMm
 * @param {number} args.clearanceMm
 * @param {'dovetail' | 'puzzle' | 'lap' | 'finger'} args.kind
 * @param {ProfileOptions} [args.options]
 * @param {boolean} [args.withConnectors] A half lap with magnets or dowels: B goes on along the cut axis.
 * @returns {JointGeometry & { seam: SeamInfo }}
 * @throws {ProfileRefusal} A section the profile cannot fit, by name and size.
 */
export function profileJoint({ solid, axisIndex, cutMm, clearanceMm, kind, options = {}, withConnectors = false }) {
  const face = profileFace(solid, axisIndex, cutMm)
  const { s, t, sRange, tRange, lengthMm: L, thicknessMm: T } = face
  const n = axisIndex
  const c = clearanceMm
  const e = JOINT_EMBED_MM
  const subject = SUBJECT[kind]
  if ((kind === 'puzzle' || kind === 'lap') && T > L / PLATE_RATIO + 1e-9) {
    throw new ProfileRefusal(
      `${subject} ${kind === 'puzzle' ? 'need' : 'needs'} a plate-like section: the cut face is ${fmt(T)} mm thick and ${fmt(L)} mm long, ` +
        'and the thickness must be at most a quarter of the length — choose Finger joint, Tongue and groove or Dowels'
    )
  }
  const size = profileSizing(kind, face, c, options)
  const need = size.growMm + c + JOINT_WALL_MM
  if (face.endMm - cutMm < need - 1e-9) {
    throw new ProfileRefusal(
      `${subject} ${kind === 'puzzle' ? 'need' : 'needs'} piece B to run at least ${fmt(need)} mm past the cut, and it runs ` +
        `${fmt(face.endMm - cutMm)} mm — cut further from the end, or make the profile shorter`
    )
  }
  const [s0, s1] = sRange
  const [t0, t1] = tRange
  const tMid = (t0 + t1) / 2
  const sPad = /** @type {[number, number]} */ ([s0 - PAD_MM, s1 + PAD_MM])
  const tPad = /** @type {[number, number]} */ ([t0 - PAD_MM, t1 + PAD_MM])
  /** @param {[number, number]} range @param {number} by @returns {[number, number]} */
  const grow = ([lo, hi], by) => [lo - by, hi + by]

  /** @type {Geom3[]} */
  let nominal = []
  /** @type {Geom3[]} */
  let sockets = []
  /** @type {Omit<SeamInfo, 'kind' | 'label' | 'along' | 'growMm'>} */
  let detail = {}
  let along = t
  let summary = ''

  if (kind === 'dovetail') {
    const { heightMm: h, neckMm: nw } = size
    const minT = nw + 2 * h * TAN_FLARE + 2 * c + 2 * JOINT_WALL_MM
    if (T < minT - 1e-9) {
      throw new ProfileRefusal(
        `a sliding dovetail needs the section at least ${fmt(minT)} mm thick across the rail (a ${fmt(nw)} mm neck flaring ` +
          `${DOVETAIL_FLARE_DEG}° per side over ${fmt(h)} mm, ${fmt(c)} mm clearance and a ${JOINT_WALL_MM} mm wall each side), ` +
          `and it is ${fmt(T)} mm — choose Tongue and groove, or Pins and sockets`
      )
    }
    const low = nw / 2 - e * TAN_FLARE
    const high = nw / 2 + h * TAN_FLARE
    /** @type {[number, number][]} (n, t), counter-clockwise */
    const section = [
      [cutMm - e, tMid - low],
      [cutMm + h, tMid - high],
      [cutMm + h, tMid + high],
      [cutMm - e, tMid + low],
    ]
    nominal = [prismOn(s, sPad[0], sPad[1], n, section)]
    sockets = [prismOn(s, sPad[0] - c, sPad[1] + c, n, offsetOutline(section, c))]
    detail = { heightMm: h, neckMm: nw }
    along = s
    summary = `sliding dovetail ${fmt(h)} mm high, ${fmt(nw)} mm neck, along ${AXIS_NAMES[s]}`
  } else if (kind === 'puzzle') {
    const { count, neckMm: nw, headMm, neckLengthMm } = size
    const pitch = L / count
    const each = headMm + 2 * c + 2 * JOINT_WALL_MM
    if (pitch < each - 1e-9) {
      throw new ProfileRefusal(
        `${count} puzzle tabs with a ${fmt(nw)} mm neck need ${fmt(each)} mm each along the seam, and there are ${fmt(pitch)} mm — ` +
          'use fewer tabs or a narrower neck'
      )
    }
    const r = headMm / 2
    const centreN = cutMm + neckLengthMm + r
    for (let i = 0; i < count; i += 1) {
      const sc = s0 + (i + 0.5) * pitch
      const head = circle(centreN, sc, r)
      nominal.push(box(ranges({ [n]: [cutMm - e, centreN], [s]: [sc - nw / 2, sc + nw / 2], [t]: tPad })))
      nominal.push(prismOn(t, tPad[0], tPad[1], n, head))
      sockets.push(box(ranges({ [n]: [cutMm - e - c, centreN], [s]: grow([sc - nw / 2, sc + nw / 2], c), [t]: grow(tPad, c) })))
      sockets.push(prismOn(t, tPad[0] - c, tPad[1] + c, n, offsetOutline(head, c)))
    }
    detail = { count, neckMm: nw, headMm, neckLengthMm }
    summary = `${count} puzzle tab${count === 1 ? '' : 's'}, ${fmt(nw)} mm neck, ${fmt(headMm)} mm head`
  } else if (kind === 'lap') {
    const { lapMm } = size
    nominal = [box(ranges({ [n]: [cutMm - e, cutMm + lapMm], [t]: [tPad[0], tMid], [s]: sPad }))]
    sockets = [box(ranges({ [n]: [cutMm - e - c, cutMm + lapMm + c], [t]: [tPad[0] - c, tMid + c], [s]: grow(sPad, c) }))]
    detail = { lapMm }
    along = withConnectors ? n : t
    summary = `half lap ${fmt(lapMm)} mm`
  } else {
    const { count, depthMm } = size
    const w = L / count
    if (w < FINGER_MIN_WIDTH_MM + 2 * c - 1e-9) {
      throw new ProfileRefusal(
        `${count} fingers across ${fmt(L)} mm are ${fmt(w)} mm wide, and each needs at least ${fmt(FINGER_MIN_WIDTH_MM + 2 * c)} mm ` +
          `(${FINGER_MIN_WIDTH_MM} mm of finger and ${fmt(c)} mm clearance each side) — use fewer fingers`
      )
    }
    for (let i = 0; i < count; i += 2) {
      const lo = i === 0 ? s0 - PAD_MM : s0 + i * w
      const hi = i === count - 1 ? s1 + PAD_MM : s0 + (i + 1) * w
      nominal.push(box(ranges({ [n]: [cutMm - e, cutMm + depthMm], [s]: [lo, hi], [t]: tPad })))
      sockets.push(box(ranges({ [n]: [cutMm - e - c, cutMm + depthMm + c], [s]: grow([lo, hi], c), [t]: grow(tPad, c) })))
    }
    detail = { count, depthMm }
    summary = `${count} fingers, ${fmt(depthMm)} mm deep`
  }

  const feature = booleans.intersect(solid, nominal.length === 1 ? nominal[0] : booleans.union(...nominal))
  return {
    kind: /** @type {any} */ (kind),
    pins: [feature],
    sockets,
    holes: [],
    connectors: [],
    summary,
    seam: { kind, label: PROFILE_LABELS[kind], along: AXIS_NAMES[along], growMm: size.growMm, ...detail },
  }
}
