// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Magnet joint for a split (`TODO/core-075`, stage 3): a round pocket for a disc magnet in
 * **both** cut faces, open at the cut. Nothing extra is printed — the magnets are bought, and the
 * piece records them as hardware (`group.js`'s `HardwareItem`), so the Split sheet's **You'll also
 * need** line, the Inspector's bill of materials and `assembly.txt` all list them.
 *
 * ## What it is for
 *
 * A joint that **comes apart on purpose**: a display model, a lid, a part split to travel. It holds
 * against a light pull and locates a little; pair it with dowels for real location.
 *
 * ## Sizing
 *
 * - **Magnet**: one of the common disc sizes ({@link MAGNET_SIZES}, diameter × thickness), or a
 *   custom one (2–25 mm across, 1–10 mm thick).
 * - **Pocket** in each piece: the magnet's diameter + 2 × clearance across, its thickness +
 *   clearance deep, with a {@link JOINT_WALL_MM} wall round it and under it in **its own** piece —
 *   the floor that keeps a pocket from breaking through.
 * - **Count**: two magnets per pocket pair — one in each face. The search places two pairs if two
 *   fit apart (the pair furthest apart), otherwise one, as the dowel search does.
 *
 * Polarity is the person's job, and `assembly.txt` says how: stack the magnets, mark the stack's
 * outward face, glue every A-side magnet mark-out and every B-side magnet mark-in.
 *
 * Millimetres, document frame, Z-up. Framework-free.
 *
 * @module core/kernel/recipes/joint.magnet
 */

import {
  JOINT_EMBED_MM,
  JOINT_WALL_MM,
  clearanceBelow,
  clearanceTo,
  contains,
  footprintsOverlap,
  prismAlong,
} from './joint.common.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./joint.common.js').ClearanceField} ClearanceField */
/** @typedef {import('./joint.common.js').Footprint} Footprint */
/** @typedef {import('./joint.common.js').FacePoint} FacePoint */
/** @typedef {import('./joint.pins.js').JointGeometry} JointGeometry */
/** @typedef {import('../group.js').HardwareItem} HardwareItem */

/** Smallest custom magnet, mm across. */
export const MAGNET_MIN_DIAMETER_MM = 2
/** Largest custom magnet, mm across. */
export const MAGNET_MAX_DIAMETER_MM = 25
/** Thinnest custom magnet, mm. */
export const MAGNET_MIN_THICKNESS_MM = 1
/** Thickest custom magnet, mm. */
export const MAGNET_MAX_THICKNESS_MM = 10

/**
 * The common disc-magnet sizes, diameter × thickness, smallest first — what the Split sheet lists.
 *
 * @type {readonly Readonly<{ diameterMm: number, thicknessMm: number }>[]}
 */
export const MAGNET_SIZES = Object.freeze(
  [
    [6, 2],
    [6, 3],
    [8, 3],
    [10, 2],
    [10, 3],
    [12, 3],
  ].map(([diameterMm, thicknessMm]) => Object.freeze({ diameterMm, thicknessMm }))
)

/** How deep a pocket plus its floor can reach either side of the face, for sizing the field. */
export const MAGNET_MAX_REACH_MM = MAGNET_MAX_THICKNESS_MM + 1 + JOINT_WALL_MM

/** @param {number} mm */
const fmt = (mm) => String(Number(mm.toFixed(2)))

/**
 * A magnet pocket's sizing.
 *
 * @param {number} diameterMm
 * @param {number} thicknessMm
 * @param {number} clearanceMm Per side, and at the floor.
 * @returns {{ pocketRadiusMm: number, pocketDepthMm: number }}
 */
export function magnetSizing(diameterMm, thicknessMm, clearanceMm) {
  return { pocketRadiusMm: diameterMm / 2 + clearanceMm, pocketDepthMm: thicknessMm + clearanceMm }
}

/**
 * What a magnet is called, for a person: `6 × 3 mm`, and the shopping-list line
 * `magnets 6 × 3 mm` the sheet, the BOM and `assembly.txt` share.
 *
 * @param {number} diameterMm
 * @param {number} thicknessMm
 * @returns {{ sizeLabel: string, hardwareLabel: string }}
 */
export function describeMagnet(diameterMm, thicknessMm) {
  const sizeLabel = `${fmt(diameterMm)} × ${fmt(thicknessMm)} mm`
  return { sizeLabel, hardwareLabel: `magnets ${sizeLabel}` }
}

/** The common sizes, largest first. */
const LARGEST_FIRST = [...MAGNET_SIZES].sort((a, b) => b.diameterMm - a.diameterMm || b.thicknessMm - a.thicknessMm)

/**
 * The magnet a placement gets when it names no size: the largest common size at most 60 % of the
 * face's narrower side — which leaves room for a wall either side — or the smallest common size.
 *
 * @param {number} minorMm The face's narrower side.
 * @returns {{ diameterMm: number, thicknessMm: number }}
 */
export function defaultMagnet(minorMm) {
  const found = LARGEST_FIRST.find((size) => size.diameterMm <= 0.6 * minorMm + 1e-9) ?? MAGNET_SIZES[0]
  return { diameterMm: found.diameterMm, thicknessMm: found.thicknessMm }
}

/**
 * A magnet's pocket plus wall on the face.
 *
 * @param {number} diameterMm
 * @param {number} clearanceMm
 * @param {{ uMm: number, vMm: number }} centre
 * @returns {Footprint}
 */
export function magnetFootprint(diameterMm, clearanceMm, centre) {
  return { shape: 'circle', uMm: centre.uMm, vMm: centre.vMm, radiusMm: diameterMm / 2 + clearanceMm + JOINT_WALL_MM }
}

/**
 * Why a magnet pocket pair does not fit at `centre`, by exact boolean containment — `null` when
 * it does: `wall` when the pocket plus a {@link JOINT_WALL_MM} wall and floor would break out of
 * piece B, `wallA` the same in piece A.
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {Geom3} args.lower
 * @param {Geom3} args.upper
 * @param {number} args.clearanceMm
 * @param {number} args.diameterMm
 * @param {number} args.thicknessMm
 * @param {{ uMm: number, vMm: number }} args.centre
 * @returns {'wall' | 'wallA' | null}
 */
export function magnetMisfit({ field, lower, upper, clearanceMm, diameterMm, thicknessMm, centre }) {
  const { axisIndex, cutMm } = field
  const { pocketRadiusMm, pocketDepthMm } = magnetSizing(diameterMm, thicknessMm, clearanceMm)
  const section = { radiusMm: pocketRadiusMm + JOINT_WALL_MM }
  const reach = pocketDepthMm + JOINT_WALL_MM
  if (!contains(upper, prismAlong(axisIndex, cutMm, cutMm + reach, centre.uMm, centre.vMm, section))) return 'wall'
  if (!contains(lower, prismAlong(axisIndex, cutMm - reach, cutMm, centre.uMm, centre.vMm, section))) return 'wallA'
  return null
}

/**
 * Magnet pockets at exactly these centres — no search, no check (ask {@link magnetMisfit} first).
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {number} args.clearanceMm
 * @param {number} args.diameterMm
 * @param {number} args.thicknessMm
 * @param {{ uMm: number, vMm: number }[]} args.centres
 * @param {'search' | 'placed'} [args.source]
 * @returns {JointGeometry}
 */
export function magnetsAt({ field, clearanceMm, diameterMm, thicknessMm, centres, source = 'search' }) {
  const { axisIndex, cutMm } = field
  const { pocketRadiusMm, pocketDepthMm } = magnetSizing(diameterMm, thicknessMm, clearanceMm)
  const section = { radiusMm: pocketRadiusMm }
  // Each pocket starts a little past the face on the other side, so its boolean never meets a
  // coplanar face; that part of it is outside its own piece.
  const holes = centres.map((c) => prismAlong(axisIndex, cutMm - pocketDepthMm, cutMm + JOINT_EMBED_MM, c.uMm, c.vMm, section))
  const sockets = centres.map((c) => prismAlong(axisIndex, cutMm - JOINT_EMBED_MM, cutMm + pocketDepthMm, c.uMm, c.vMm, section))
  const { hardwareLabel } = describeMagnet(diameterMm, thicknessMm)
  const count = 2 * centres.length
  /** @type {Omit<HardwareItem, 'joins' | 'axis'>[]} */
  const hardware = [{ item: 'magnet', diameterMm, thicknessMm, count, label: hardwareLabel }]
  return {
    kind: /** @type {any} */ ('magnets'),
    pins: [],
    sockets,
    holes,
    hardware,
    connectors: centres.map((centre) => ({
      kind: /** @type {any} */ ('magnet'),
      source,
      uMm: centre.uMm,
      vMm: centre.vMm,
      sizeMm: diameterMm,
      thicknessMm,
      footprint: magnetFootprint(diameterMm, clearanceMm, centre),
    })),
    summary: `${count} × ${hardwareLabel}, ${centres.length} in each piece`,
  }
}

/**
 * The sizes a search tries, largest first: the common sizes from {@link defaultMagnet} down, or
 * exactly what was asked for.
 *
 * @param {number} minorMm
 * @param {number | null} diameterMm
 * @param {number | null} thicknessMm
 * @returns {{ diameterMm: number, thicknessMm: number }[]}
 */
export function magnetCandidates(minorMm, diameterMm, thicknessMm) {
  if (diameterMm !== null && thicknessMm !== null) return [{ diameterMm, thicknessMm }]
  const top = defaultMagnet(minorMm)
  return LARGEST_FIRST.filter(
    (size) => size.diameterMm < top.diameterMm || (size.diameterMm === top.diameterMm && size.thicknessMm <= top.thicknessMm)
  ).map(({ diameterMm: d, thicknessMm: t }) => ({ diameterMm: d, thicknessMm: t }))
}

/**
 * Plan magnet pockets on a cut face: two pairs if two fit apart (the pair furthest apart),
 * otherwise one — the dowel search's rule, on a field sampled on both sides of the face.
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {Geom3} args.lower
 * @param {Geom3} args.upper
 * @param {number} args.clearanceMm
 * @param {number | null} [args.diameterMm]
 * @param {number | null} [args.thicknessMm]
 * @param {Footprint[]} [args.keepOut]
 * @returns {JointGeometry | null} `null` when no magnet fits.
 */
export function magnetJoint({ field, lower, upper, clearanceMm, diameterMm = null, thicknessMm = null, keepOut = [] }) {
  const minor = Math.min(field.uRange[1] - field.uRange[0], field.vRange[1] - field.vRange[0])
  /** @type {{ diameterMm: number, thicknessMm: number, centres: { uMm: number, vMm: number }[] } | null} */
  let single = null
  for (const size of magnetCandidates(minor, diameterMm, thicknessMm)) {
    const { diameterMm: d, thicknessMm: t } = size
    const { pocketRadiusMm, pocketDepthMm } = magnetSizing(d, t, clearanceMm)
    const reach = pocketDepthMm + JOINT_WALL_MM
    const wallNeed = Math.hypot(pocketRadiusMm + JOINT_WALL_MM, field.depthStepMm / 2)
    const fits = field.points.filter(
      (point) =>
        clearanceTo(field, point, reach) >= wallNeed &&
        clearanceBelow(field, point, reach) >= wallNeed &&
        keepOut.every((other) => !footprintsOverlap(other, magnetFootprint(d, clearanceMm, point)))
    )
    if (fits.length === 0) continue
    const apart = 2 * (pocketRadiusMm + JOINT_WALL_MM)
    let best = /** @type {[number, number] | null} */ (null)
    let bestDistance = apart
    for (let i = 0; i < fits.length; i += 1) {
      for (let j = i + 1; j < fits.length; j += 1) {
        const distance = Math.hypot(fits[i].uMm - fits[j].uMm, fits[i].vMm - fits[j].vMm)
        if (distance >= bestDistance) {
          bestDistance = distance
          best = [i, j]
        }
      }
    }
    const least = (/** @type {FacePoint} */ p) => Math.min(clearanceTo(field, p, reach), clearanceBelow(field, p, reach))
    const centres = best ? [fits[best[0]], fits[best[1]]] : [fits.reduce((a, b) => (least(b) > least(a) ? b : a))]
    const confirmed = centres.filter(
      (centre) => magnetMisfit({ field, lower, upper, clearanceMm, diameterMm: d, thicknessMm: t, centre }) === null
    )
    if (confirmed.length >= 2) return magnetsAt({ field, clearanceMm, diameterMm: d, thicknessMm: t, centres: confirmed })
    if (confirmed.length === 1 && single === null) single = { diameterMm: d, thicknessMm: t, centres: confirmed }
  }
  return single
    ? magnetsAt({ field, clearanceMm, diameterMm: single.diameterMm, thicknessMm: single.thicknessMm, centres: single.centres })
    : null
}
