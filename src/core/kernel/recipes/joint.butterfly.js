// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Butterfly (bowtie) key joint for a split (`TODO/core-075`, stage 2): a double-dovetail key let
 * into a pocket that straddles the seam on an **outer surface**. Push the pieces together, then
 * press each key in from outside. It is the one joint here that locks against pull-apart
 * without glue, and it prints flat on its big face, so the narrow waist takes tension along
 * the layers — the strong direction for FDM.
 *
 * ## Shape
 *
 * In the plane of the cut axis *n* and the face axis *a* along the surface, the key is a bowtie:
 * `w` wide at its waist on the seam, `2w` wide at each end, `4w` long across the seam (`2w` into
 * each piece), so each wing slopes 1 : 4. It is a prism along the face axis *t* that is square to
 * the surface — the face axis nearest the outline's inward normal (`side`: `u-`, `u+`, `v-`,
 * `v+`, which keeps the prism axis-aligned in v1) — from its flat floor out past the surface.
 *
 * ## Clip to the uncut solid
 *
 * A butterfly deliberately reaches the outer surface, so containment cannot be its check
 * (`joint.common.js`'s `clipToSolid`):
 *
 * - **Key** = the nominal prism ∩ the **uncut** solid. On a curved surface its top follows the
 *   surface exactly; its flat floor is what it prints on.
 * - **Pocket** = the bowtie grown by the clearance square to every side (`offsetOutline`, the
 *   mitred offset lifted out of `joint.wedge.js`), from the clearance below the floor out past
 *   the surface — subtracted from **both** pieces.
 * - What still needs a wall is the part meant to be enclosed: the **floor** under the pocket
 *   (at least {@link JOINT_WALL_MM}, unless the key goes `through`) and the **sides** of the
 *   pocket in each piece. Both are exact `contains` checks on the uncut solid.
 *
 * ## Depth
 *
 * Half the section's thickness at the key's centre line, at least {@link BUTTERFLY_MIN_DEPTH_MM},
 * measured from the surface; refused when that leaves a floor under {@link JOINT_WALL_MM}, unless
 * `through`, when the key runs the full thickness of the wall it sits in.
 *
 * ## The search
 *
 * Keys go along the **longest straight run** of the cut face's outline (`sectionOutline`), on
 * one side if one is asked for, one per {@link BUTTERFLY_SPACING_MM} of run (at least one),
 * evenly spaced; the waist starts at the face's narrower side (clamped to 3–20 mm) and steps
 * down by a quarter until every key fits.
 *
 * Millimetres, document frame, Z-up. Framework-free.
 *
 * @module core/kernel/recipes/joint.butterfly
 */

import { boundsOf } from '../group.js'
import {
  JOINT_WALL_MM,
  clipToSolid,
  contains,
  faceAxes,
  footprintsOverlap,
  offsetOutline,
  outlinePrismAlong,
  sectionOutline,
} from './joint.common.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./joint.common.js').Footprint} Footprint */
/** @typedef {import('./joint.common.js').OutlineSegment} OutlineSegment */
/** @typedef {import('./joint.pins.js').JointGeometry} JointGeometry */
/** @typedef {import('./joint.pins.js').Connector} Connector */
/** @typedef {import('../group.js').PartMeta} PartMeta */
/** @typedef {[number, number, number]} Vec3Mm */

/** Narrowest waist, mm. */
export const BUTTERFLY_MIN_WIDTH_MM = 3
/** Widest waist, mm. */
export const BUTTERFLY_MAX_WIDTH_MM = 20
/** The shallowest default depth, mm. */
export const BUTTERFLY_MIN_DEPTH_MM = 3
/** A depth a record may ask for, mm. */
export const BUTTERFLY_DEPTH_RANGE_MM = Object.freeze(/** @type {[number, number]} */ ([1, 100]))
/** One key per this much straight run of seam, mm. */
export const BUTTERFLY_SPACING_MM = 50
/** The surface a key sits on, in the cut face's `(u, v)` frame: the face's low or high side. */
export const BUTTERFLY_SIDES = Object.freeze(/** @type {const} */ (['u-', 'u+', 'v-', 'v+']))

/** @typedef {'u-' | 'u+' | 'v-' | 'v+'} ButterflySide */

/**
 * One butterfly key as asked for: a point on the cut face (on or near the outline), its waist,
 * which surface it sits on, and how deep.
 *
 * @typedef {object} ButterflyKey
 * @property {number} uMm
 * @property {number} vMm
 * @property {number} widthMm The waist.
 * @property {ButterflySide} side
 * @property {number | null} depthMm `null` for the default.
 * @property {boolean} through
 */

/**
 * The cut face as a butterfly sees it: the uncut solid, the frame and the outline.
 *
 * @typedef {object} ButterflyFace
 * @property {Geom3} solid The **uncut** solid.
 * @property {number} axisIndex
 * @property {number} cutMm
 * @property {number} u
 * @property {number} v
 * @property {[Vec3Mm, Vec3Mm]} bounds
 * @property {OutlineSegment[]} segments
 * @property {number} minorMm The face's narrower side.
 */

/**
 * @param {number} value
 * @param {number} low
 * @param {number} high
 */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

/** @param {number} mm */
const fmt = (mm) => String(Number(mm.toFixed(2)))

/** Document directions, by axis and sign, as a person names the side of a part. */
const SIDE_WORDS = Object.freeze([
  ['Left', 'Right'],
  ['Front', 'Back'],
  ['Bottom', 'Top'],
])

/**
 * What a side of the cut face is called: an X cut's `v+` is the **Top** (its `v` is Z).
 *
 * @param {number} axisIndex The cut axis.
 * @param {ButterflySide} side
 * @returns {string}
 */
export function butterflySideLabel(axisIndex, side) {
  const [u, v] = faceAxes(axisIndex)
  const axis = side[0] === 'u' ? u : v
  return SIDE_WORDS[axis][side[1] === '+' ? 1 : 0]
}

/**
 * A key's sizes from its waist.
 *
 * @param {number} widthMm
 * @returns {{ waistMm: number, endMm: number, lengthMm: number }}
 */
export function butterflySizing(widthMm) {
  return { waistMm: widthMm, endMm: 2 * widthMm, lengthMm: 4 * widthMm }
}

/** The bowtie's two convex halves (wing A, wing B), as corner indices of {@link bowtieOutline}. */
const WINGS = Object.freeze([Object.freeze([0, 1, 4, 5]), Object.freeze([1, 2, 3, 4])])

/**
 * The bowtie about its centre, `(along the cut axis, across it)`, counter-clockwise, grown by
 * `byMm` square to every side. Corners 1 and 4 are the waist, on the seam.
 *
 * @param {number} widthMm The waist.
 * @param {number} [byMm]
 * @returns {[number, number][]}
 */
export function bowtieOutline(widthMm, byMm = 0) {
  const w = widthMm
  /** @type {[number, number][]} */
  const nominal = [
    [-2 * w, -w],
    [0, -w / 2],
    [2 * w, -w],
    [2 * w, w],
    [0, w / 2],
    [-2 * w, w],
  ]
  return offsetOutline(nominal, byMm)
}

/**
 * What a key is called, for a person — the kernel's key label, `assembly.txt` and the Split
 * sheet's pieces list all read this: its length across the seam × its ends × its depth.
 *
 * @param {number} widthMm
 * @param {number} depthMm
 * @returns {{ keyLabel: string, keySizeMm: Vec3Mm }}
 */
export function describeButterfly(widthMm, depthMm) {
  const { lengthMm, endMm } = butterflySizing(widthMm)
  return {
    keyLabel: `Butterfly key ${fmt(lengthMm)} × ${fmt(endMm)} × ${fmt(depthMm)} mm`,
    keySizeMm: [Number(lengthMm.toFixed(2)), Number(endMm.toFixed(2)), Number(depthMm.toFixed(2))],
  }
}

/**
 * The side a surface faces, from its outward normal in the face: the face axis nearest it.
 *
 * @param {[number, number]} normal
 * @returns {ButterflySide}
 */
export function sideOfNormal([nu, nv]) {
  if (Math.abs(nu) >= Math.abs(nv)) return nu >= 0 ? 'u+' : 'u-'
  return nv >= 0 ? 'v+' : 'v-'
}

/**
 * Snap a tap on the cut face to the nearest edge of its outline (`TODO/core-075`'s
 * **Butterfly** hand placement), and say which side that edge is on.
 *
 * @param {readonly number[]} outline Six numbers per edge — from `(u, v)`, to `(u, v)`, outward
 *   normal `(u, v)` — as `FacePreview.outline` carries it.
 * @param {number} uMm
 * @param {number} vMm
 * @returns {{ uMm: number, vMm: number, side: ButterflySide } | null} `null` for no outline.
 */
export function snapToOutline(outline, uMm, vMm) {
  let best = /** @type {{ uMm: number, vMm: number, side: ButterflySide, distance: number } | null} */ (null)
  for (let i = 0; i + 5 < outline.length; i += 6) {
    const [au, av, bu, bv, nu, nv] = outline.slice(i, i + 6)
    const du = bu - au
    const dv = bv - av
    const lengthSquared = du * du + dv * dv
    const t = lengthSquared > 0 ? clamp(((uMm - au) * du + (vMm - av) * dv) / lengthSquared, 0, 1) : 0
    const pu = au + du * t
    const pv = av + dv * t
    const distance = Math.hypot(uMm - pu, vMm - pv)
    if (best === null || distance < best.distance - 1e-9) {
      best = { uMm: pu, vMm: pv, side: sideOfNormal([nu, nv]), distance }
    }
  }
  if (best === null) return null
  const round = (/** @type {number} */ mm) => Number(mm.toFixed(6)) + 0
  return { uMm: round(best.uMm), vMm: round(best.vMm), side: best.side }
}

/** One face per solid and cut, so a search's many checks share one outline. */
const faces = new WeakMap()

/**
 * The cut face as a butterfly sees it.
 *
 * @param {Geom3} solid The **uncut** solid.
 * @param {number} axisIndex
 * @param {number} cutMm
 * @returns {ButterflyFace}
 */
export function butterflyFace(solid, axisIndex, cutMm) {
  /** @type {Map<string, ButterflyFace> | undefined} */
  let cached = faces.get(solid)
  if (cached === undefined) {
    cached = new Map()
    faces.set(solid, cached)
  }
  const key = `${axisIndex}|${cutMm}`
  const hit = cached.get(key)
  if (hit) return hit
  const { u, v, segments } = sectionOutline(solid, axisIndex, cutMm)
  const bounds = /** @type {[Vec3Mm, Vec3Mm]} */ (boundsOf(solid))
  const minorMm = Math.min(bounds[1][u] - bounds[0][u], bounds[1][v] - bounds[0][v])
  const face = { solid, axisIndex, cutMm, u, v, bounds, segments, minorMm }
  cached.set(key, face)
  return face
}

/**
 * The outline flattened for a face preview: six numbers per edge (see {@link snapToOutline}).
 *
 * @param {ButterflyFace} face
 * @returns {number[]}
 */
export function flatOutline(face) {
  const round = (/** @type {number} */ mm) => Number(mm.toFixed(4)) + 0
  return face.segments.flatMap((segment) => [...segment.a, ...segment.b, ...segment.normal].map(round))
}

/**
 * The side of the face nearest a point, by its nearest outline edge.
 *
 * @param {ButterflyFace} face
 * @param {number} uMm
 * @param {number} vMm
 * @returns {ButterflySide | null}
 */
export function nearestSide(face, uMm, vMm) {
  return snapToOutline(flatOutline(face), uMm, vMm)?.side ?? null
}

/**
 * Where a key on `side` sits in the face frame: the face coordinate square to the surface
 * (`tFace`, 0 for `u`), the one along it, the document axes they are, and `s`, +1 when the
 * surface is the face's high side.
 *
 * @param {ButterflyFace} face
 * @param {ButterflySide} side
 */
function frameOf(face, side) {
  const tFace = side[0] === 'u' ? 0 : 1
  const aFace = 1 - tFace
  const axes = [face.u, face.v]
  return { tFace, aFace, t: axes[tFace], a: axes[aFace], s: side[1] === '+' ? 1 : -1 }
}

/**
 * The surface a key on `side` meets along the face line at `aMm`, nearest `hintMm` (or the
 * outermost), and the wall under it: the outline's crossings of that line.
 *
 * @param {ButterflyFace} face
 * @param {ReturnType<typeof frameOf>} frame
 * @param {number} aMm
 * @param {number | null} hintMm
 * @returns {{ surfaceMm: number, innerMm: number, outerLimitMm: number, innerLimitMm: number } | null}
 *   `surfaceMm`: the surface; `innerMm`: the far side of the wall under it; `outerLimitMm` /
 *   `innerLimitMm`: how far a key's prism may reach beyond them without meeting other material.
 */
function surfaceAt(face, frame, aMm, hintMm) {
  const { tFace, aFace, t, s } = frame
  /** @type {{ at: number, facing: number }[]} */
  const crossings = []
  for (const segment of face.segments) {
    const a0 = segment.a[aFace]
    const a1 = segment.b[aFace]
    if (!(Math.min(a0, a1) <= aMm && aMm < Math.max(a0, a1))) continue
    const k = (aMm - a0) / (a1 - a0)
    crossings.push({ at: segment.a[tFace] + (segment.b[tFace] - segment.a[tFace]) * k, facing: segment.normal[tFace] * s })
  }
  const exits = crossings.filter((crossing) => crossing.facing > 1e-9)
  if (exits.length === 0) return null
  const surface =
    hintMm === null
      ? exits.reduce((best, crossing) => (s * crossing.at > s * best.at ? crossing : best))
      : exits.reduce((best, crossing) => (Math.abs(crossing.at - hintMm) < Math.abs(best.at - hintMm) ? crossing : best))
  const surfaceMm = surface.at
  const behind = crossings.filter((crossing) => crossing.facing < -1e-9 && s * (crossing.at - surfaceMm) < -1e-9)
  if (behind.length === 0) return null
  const innerMm = behind.reduce((best, crossing) => (s * crossing.at > s * best.at ? crossing : best)).at
  const beyond = crossings.filter((crossing) => s * (crossing.at - surfaceMm) > 1e-9)
  const outerLimitMm =
    beyond.length === 0
      ? s > 0
        ? face.bounds[1][t] + 1
        : face.bounds[0][t] - 1
      : surfaceMm + (beyond.reduce((best, crossing) => (s * crossing.at < s * best.at ? crossing : best)).at - surfaceMm) / 2
  const under = crossings.filter((crossing) => s * (crossing.at - innerMm) < -1e-9)
  const innerLimitMm =
    under.length === 0
      ? s > 0
        ? face.bounds[0][t] - 1
        : face.bounds[1][t] + 1
      : innerMm + (under.reduce((best, crossing) => (s * crossing.at > s * best.at ? crossing : best)).at - innerMm) / 2
  return { surfaceMm, innerMm, outerLimitMm, innerLimitMm }
}

/**
 * One key worked out against the face: where its surface, floor and prism ends are — or why it
 * cannot sit there before any boolean is run.
 *
 * @param {ButterflyFace} face
 * @param {ButterflyKey} key
 * @param {number} clearanceMm
 */
function resolve(face, key, clearanceMm) {
  const frame = frameOf(face, key.side)
  const point = [key.uMm, key.vMm]
  const aMm = point[frame.aFace]
  const found = surfaceAt(face, frame, aMm, point[frame.tFace])
  if (found === null) return /** @type {const} */ ({ ok: false, misfit: 'off' })
  const { s } = frame
  const thicknessMm = s * (found.surfaceMm - found.innerMm)
  if (key.through) {
    return /** @type {const} */ ({
      ok: true,
      frame,
      aMm,
      ...found,
      thicknessMm,
      depthMm: thicknessMm,
      floorMm: found.innerMm,
      keyFrom: found.innerLimitMm,
      pocketFrom: found.innerLimitMm,
    })
  }
  const depthMm = key.depthMm ?? Math.max(BUTTERFLY_MIN_DEPTH_MM, thicknessMm / 2)
  if (thicknessMm - depthMm - clearanceMm < JOINT_WALL_MM - 1e-9) return /** @type {const} */ ({ ok: false, misfit: 'floor' })
  const floorMm = found.surfaceMm - s * depthMm
  return /** @type {const} */ ({
    ok: true,
    frame,
    aMm,
    ...found,
    thicknessMm,
    depthMm,
    floorMm,
    keyFrom: floorMm,
    pocketFrom: floorMm - s * clearanceMm,
  })
}

/**
 * A bowtie prism along the key's `t` axis between two levels, grown by `byMm`.
 *
 * @param {ButterflyFace} face
 * @param {ReturnType<typeof frameOf>} frame
 * @param {number} aMm
 * @param {number} widthMm
 * @param {number} byMm
 * @param {number} oneMm
 * @param {number} otherMm
 * @returns {Geom3}
 */
function bowtiePrism(face, frame, aMm, widthMm, byMm, oneMm, otherMm) {
  const [p0] = faceAxes(frame.t)
  // The bowtie is drawn (along n, across a). When the prism's own first face axis is `a`, the
  // two swap, which mirrors it: reverse the corners (and each wing) to stay counter-clockwise.
  const swap = p0 !== face.axisIndex
  const points = bowtieOutline(widthMm, byMm)
  const n = points.length
  const outline = swap ? points.map(([along, across]) => /** @type {[number, number]} */ ([across, along])).reverse() : points
  const pieces = swap ? WINGS.map((wing) => wing.map((i) => n - 1 - i).reverse()) : WINGS.map((wing) => [...wing])
  const [cu, cv] = swap ? [aMm, face.cutMm] : [face.cutMm, aMm]
  return outlinePrismAlong(frame.t, Math.min(oneMm, otherMm), Math.max(oneMm, otherMm), cu, cv, outline, pieces)
}

/**
 * Why a key does not fit, by exact boolean containment on the uncut solid — `null` when it does.
 *
 * - `off`: there is no surface on that side of the face at that point.
 * - `floor`: the pocket would leave less than a {@link JOINT_WALL_MM} floor, or break through.
 * - `wall`: the pocket and its {@link JOINT_WALL_MM} wall would break out of the side of a piece
 *   (an end of a short piece, a corner, a hole).
 *
 * @param {object} args
 * @param {ButterflyFace} args.face
 * @param {number} args.clearanceMm
 * @param {ButterflyKey} args.key
 * @returns {'off' | 'floor' | 'wall' | null}
 */
export function butterflyMisfit({ face, clearanceMm, key }) {
  const resolved = resolve(face, key, clearanceMm)
  if (!resolved.ok) return resolved.misfit
  const { frame, aMm, floorMm, surfaceMm, innerMm, thicknessMm } = resolved
  const { s } = frame
  if (!key.through) {
    const floor = bowtiePrism(face, frame, aMm, key.widthMm, clearanceMm, floorMm - s * clearanceMm, floorMm - s * (clearanceMm + JOINT_WALL_MM))
    if (!contains(face.solid, floor)) return 'floor'
    const sides = bowtiePrism(face, frame, aMm, key.widthMm, clearanceMm + JOINT_WALL_MM, floorMm, floorMm + (s * resolved.depthMm) / 2)
    if (!contains(face.solid, sides)) return 'wall'
    return null
  }
  const sides = bowtiePrism(
    face,
    frame,
    aMm,
    key.widthMm,
    clearanceMm + JOINT_WALL_MM,
    innerMm + (s * thicknessMm) / 4,
    surfaceMm - (s * thicknessMm) / 4
  )
  return contains(face.solid, sides) ? null : 'wall'
}

/**
 * A key's pocket plus wall on the cut face: the rectangle from its floor's wall out to the
 * surface, and across the ends plus clearance and wall.
 *
 * @param {ButterflyFace} face
 * @param {ButterflyKey} key
 * @param {number} clearanceMm
 * @returns {Footprint | null} `null` where the key cannot sit.
 */
export function butterflyFootprint(face, key, clearanceMm) {
  const resolved = resolve(face, key, clearanceMm)
  if (!resolved.ok) return null
  const { frame, aMm, surfaceMm, floorMm } = resolved
  const deepest = key.through ? resolved.innerMm : floorMm - frame.s * (clearanceMm + JOINT_WALL_MM)
  const tMid = (surfaceMm + deepest) / 2
  const halfT = Math.abs(surfaceMm - deepest) / 2
  const halfA = key.widthMm + clearanceMm + JOINT_WALL_MM
  return frame.tFace === 0
    ? { shape: 'rect', uMm: tMid, vMm: aMm, halfUMm: halfT, halfVMm: halfA }
    : { shape: 'rect', uMm: aMm, vMm: tMid, halfUMm: halfA, halfVMm: halfT }
}

/**
 * A short, stable id for a key's shape up to translation — equal for keys a slicer can copy
 * from one file (`TODO/core-075`: identical keys share one STL).
 *
 * @param {Geom3} solid
 * @returns {string}
 */
function shapeHash(solid) {
  const [min] = boundsOf(solid)
  const corners = new Set()
  for (const polygon of solid.polygons) {
    for (const vertex of polygon.vertices) {
      corners.add(vertex.map((value, i) => Math.round((value - min[i]) * 1000) + 0).join(','))
    }
  }
  let hash = 0x811c9dc5
  for (const character of [...corners].sort().join(';')) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * Keys and their pockets at exactly these points — no check (ask {@link butterflyMisfit} first).
 *
 * @param {object} args
 * @param {ButterflyFace} args.face
 * @param {number} args.clearanceMm
 * @param {ButterflyKey[]} args.keys
 * @param {'search' | 'placed'} [args.source]
 * @returns {JointGeometry}
 */
export function butterfliesAt({ face, clearanceMm, keys, source = 'search' }) {
  /** @type {Geom3[]} */
  const pockets = []
  /** @type {{ solid: Geom3, meta: PartMeta }[]} */
  const parts = []
  /** @type {Connector[]} */
  const connectors = []
  for (const key of keys) {
    const resolved = resolve(face, key, clearanceMm)
    if (!resolved.ok) throw new Error(`a butterfly key at (${fmt(key.uMm)}, ${fmt(key.vMm)}) does not sit on the face (${resolved.misfit})`)
    const { frame, aMm, surfaceMm, depthMm, keyFrom, pocketFrom, outerLimitMm } = resolved
    const solid = clipToSolid(face.solid, bowtiePrism(face, frame, aMm, key.widthMm, 0, keyFrom, outerLimitMm))
    pockets.push(bowtiePrism(face, frame, aMm, key.widthMm, clearanceMm, pocketFrom, outerLimitMm))
    /** @type {Vec3Mm} */
    const inward = [0, 0, 0]
    inward[frame.t] = -frame.s
    const words = describeButterfly(key.widthMm, depthMm)
    parts.push({
      solid,
      meta: {
        role: 'key',
        kind: 'butterfly',
        shape: `butterfly-${fmt(key.widthMm)}x${fmt(depthMm)}-${shapeHash(solid)}`,
        label: words.keyLabel,
        sizeMm: key.widthMm,
        bedNormal: inward,
        insert: [...inward],
      },
    })
    const at = [0, 0]
    at[frame.tFace] = surfaceMm
    at[frame.aFace] = aMm
    connectors.push({
      kind: 'butterfly',
      source,
      uMm: at[0],
      vMm: at[1],
      sizeMm: key.widthMm,
      lengthMm: 4 * key.widthMm,
      depthMm,
      side: key.side,
      ...(key.through ? { through: true } : {}),
      footprint: /** @type {Footprint} */ (butterflyFootprint(face, key, clearanceMm)),
    })
  }
  const label = parts.length > 0 ? parts[0].meta.label : ''
  return {
    kind: 'butterfly',
    pins: [],
    sockets: pockets,
    holes: [...pockets],
    keys: parts,
    connectors,
    summary: `${parts.length} butterfly key${parts.length === 1 ? '' : 's'}, ${String(label).replace(/^Butterfly key /, '')}`,
  }
}

/**
 * A straight run of the outline: collinear edges merged.
 *
 * @typedef {{ from: [number, number], direction: [number, number], lengthMm: number, normal: [number, number] }} Run
 */

/**
 * The outline's straight runs, longest first; equal runs prefer the one facing up.
 *
 * @param {ButterflyFace} face
 * @returns {Run[]}
 */
export function straightRuns(face) {
  /** @type {Map<string, { normal: [number, number], offset: number, spans: [number, number][] }>} */
  const lines = new Map()
  const key = (/** @type {number} */ value) => String(Math.round(value * 1e5) + 0)
  for (const segment of face.segments) {
    const [nu, nv] = segment.normal
    const offset = nu * segment.a[0] + nv * segment.a[1]
    const id = `${key(nu)},${key(nv)},${key(offset)}`
    const line = lines.get(id) ?? { normal: /** @type {[number, number]} */ ([nu, nv]), offset, spans: [] }
    // Along the line, direction (−nv, nu).
    const s0 = -nv * segment.a[0] + nu * segment.a[1]
    const s1 = -nv * segment.b[0] + nu * segment.b[1]
    line.spans.push([Math.min(s0, s1), Math.max(s0, s1)])
    lines.set(id, line)
  }
  /** @type {Run[]} */
  const runs = []
  for (const { normal, offset, spans } of lines.values()) {
    spans.sort((a, b) => a[0] - b[0])
    /** @type {[number, number][]} */
    const merged = []
    for (const span of spans) {
      const last = merged.at(-1)
      if (last && span[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], span[1])
      else merged.push([span[0], span[1]])
    }
    const [nu, nv] = normal
    for (const [start, end] of merged) {
      runs.push({
        from: [nu * offset - nv * start, nv * offset + nu * start],
        direction: [-nv, nu],
        lengthMm: end - start,
        normal,
      })
    }
  }
  const up = (/** @type {Run} */ run) => (face.u === 2 ? run.normal[0] : face.v === 2 ? run.normal[1] : 0)
  return runs.sort((a, b) => b.lengthMm - a.lengthMm || up(b) - up(a))
}

/**
 * Plan butterfly keys on a cut face by the search (see the module doc).
 *
 * @param {object} args
 * @param {ButterflyFace} args.face
 * @param {number} args.clearanceMm
 * @param {number | null} [args.count] How many keys; default one per {@link BUTTERFLY_SPACING_MM}.
 * @param {ButterflySide | null} [args.side] Default: the longest straight run's.
 * @param {number | null} [args.sizeMm] A fixed waist; default the search's own.
 * @param {number | null} [args.depthMm]
 * @param {boolean} [args.through]
 * @param {Footprint[]} [args.keepOut]
 * @returns {JointGeometry | null} `null` when no key fits.
 */
export function butterflyJoint({ face, clearanceMm, count = null, side = null, sizeMm = null, depthMm = null, through = false, keepOut = [] }) {
  const runs = straightRuns(face).filter((run) => side === null || sideOfNormal(run.normal) === side)
  for (const run of runs.slice(0, 4)) {
    const runSide = sideOfNormal(run.normal)
    const most = count ?? Math.max(1, Math.round(run.lengthMm / BUTTERFLY_SPACING_MM))
    const counts = count !== null ? [count] : Array.from({ length: most }, (_, i) => most - i)
    for (const k of counts) {
      const spacing = run.lengthMm / k
      const start = clamp(Math.min(face.minorMm, spacing / 2 - clearanceMm - JOINT_WALL_MM), BUTTERFLY_MIN_WIDTH_MM, BUTTERFLY_MAX_WIDTH_MM)
      /** @type {number[]} */
      const widths = []
      if (sizeMm !== null) widths.push(sizeMm)
      else {
        for (let w = start; w >= BUTTERFLY_MIN_WIDTH_MM - 1e-9; w *= 0.75) widths.push(w)
        if (widths.at(-1) !== BUTTERFLY_MIN_WIDTH_MM) widths.push(BUTTERFLY_MIN_WIDTH_MM)
      }
      for (const widthMm of widths) {
        /** @type {ButterflyKey[]} */
        const keys = []
        /** @type {Footprint[]} */
        const taken = [...keepOut]
        for (let i = 0; i < k; i += 1) {
          const along = spacing * (i + 0.5)
          /** @type {ButterflyKey} */
          const key = {
            uMm: run.from[0] + run.direction[0] * along,
            vMm: run.from[1] + run.direction[1] * along,
            widthMm,
            side: runSide,
            depthMm,
            through,
          }
          const footprint = butterflyFootprint(face, key, clearanceMm)
          if (footprint === null || taken.some((other) => footprintsOverlap(other, footprint))) break
          if (butterflyMisfit({ face, clearanceMm, key }) !== null) break
          taken.push(footprint)
          keys.push(key)
        }
        if (keys.length === k) return butterfliesAt({ face, clearanceMm, keys })
      }
    }
  }
  return null
}
