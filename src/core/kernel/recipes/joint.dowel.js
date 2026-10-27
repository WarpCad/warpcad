// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Loose-dowel joint for a split (`TODO/core-075`, stage 1): a blind round socket in **both** cut
 * faces and a separate dowel that sits in them — printed as its own part, or bought (a steel
 * dowel pin, or a length of 1.75 mm filament, the "filament rivet").
 *
 * ## Why a loose dowel, when pins already exist
 *
 * A pin printed onto piece A stands upright whenever A prints on its cut face, which puts the
 * layer lines across the pin's shear plane — the weak way. A loose dowel is printed on its
 * own, lying down, so its layers run along it. Or it is not printed at all.
 *
 * ## Sizing (starting numbers, `TODO/core-075` "Each kind")
 *
 * - **Diameter** 2–10 mm. The search starts at 35 % of the face's narrower side and steps down
 *   by a quarter, as the pin search does; a steel pin takes the largest standard size at or
 *   under that; filament is always {@link FILAMENT_DIAMETER_MM}.
 * - **Socket** in each piece: 1.5 × the diameter deep (at most {@link DOWEL_MAX_SOCKET_MM}),
 *   wider than the dowel by the clearance per side. Each needs a {@link JOINT_WALL_MM} wall in
 *   its own piece — **both** pieces, where a pin needs a wall only in B.
 * - **Dowel**: 2 × clearance shorter than the two sockets together, so it never bottoms out,
 *   with {@link DOWEL_CHAMFER_MM} chamfers on both ends so it starts into its socket.
 * - **D-flat**: one flat along its length, a fifth of its diameter deep. Once the dowel is
 *   longer than about 1.5 × its diameter the flat is its largest face, so it prints lying on
 *   it, cannot roll off the bed, and gives glue somewhere to go. The socket stays round. The
 *   flat's outward normal is also the key's `bedNormal` (`group.js`'s `PartMeta`).
 *
 * Returns geometry only: the op cuts A's sockets (`holes`) and B's (`sockets`), and adds each
 * printed dowel as a key part (`keys`), assembled in its sockets.
 *
 * Millimetres, document frame, Z-up. Framework-free.
 *
 * @module core/kernel/recipes/joint.dowel
 */

import modeling from '@jscad/modeling'

import {
  JOINT_EMBED_MM,
  JOINT_SEGMENTS,
  JOINT_WALL_MM,
  clearanceBelow,
  clearanceTo,
  contains,
  faceAxes,
  footprintsOverlap,
  prismAlong,
} from './joint.common.js'

const { booleans, hulls, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./joint.common.js').ClearanceField} ClearanceField */
/** @typedef {import('./joint.common.js').Footprint} Footprint */
/** @typedef {import('./joint.pins.js').JointGeometry} JointGeometry */
/** @typedef {import('../group.js').PartMeta} PartMeta */
/** @typedef {import('../group.js').HardwareItem} HardwareItem */
/** @typedef {[number, number, number]} Vec3Mm */

/** Smallest dowel, mm. */
export const DOWEL_MIN_DIAMETER_MM = 2
/** Largest dowel, mm. */
export const DOWEL_MAX_DIAMETER_MM = 10
/** 1.75 mm filament: the only diameter a filament dowel comes in. */
export const FILAMENT_DIAMETER_MM = 1.75
/** Chamfer on each end of a printed dowel, mm. */
export const DOWEL_CHAMFER_MM = 0.5
/** The D-flat's depth, × the diameter. */
export const DOWEL_FLAT_RATIO = 0.2
/** The deepest socket in either piece, mm (1.5 × the largest dowel). */
export const DOWEL_MAX_SOCKET_MM = 15
/** How far a socket plus its wall reaches either side of the face, for sizing the field. */
export const DOWEL_MAX_REACH_MM = DOWEL_MAX_SOCKET_MM + 1 + JOINT_WALL_MM
/** What a dowel can be made of. */
export const DOWEL_STOCKS = Object.freeze(/** @type {const} */ (['printed', 'steel', 'filament']))

/** Metric steel dowel pin diameters, mm — the sizes a hardware shop stocks. */
export const STEEL_DIAMETERS_MM = Object.freeze([2, 3, 4, 5, 6, 8, 10])
/** Metric steel dowel pin lengths, mm. */
const STEEL_LENGTHS_MM = Object.freeze([4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24, 25, 30])

/** @typedef {'printed' | 'steel' | 'filament'} DowelStock */

/**
 * @param {number} value
 * @param {number} low
 * @param {number} high
 */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

/** @param {number} mm */
const fmt = (mm) => String(Number(mm.toFixed(2)))

/**
 * The largest standard steel pin at or under `diameterMm` (never under the smallest).
 *
 * @param {number} diameterMm
 * @returns {number}
 */
function steelDiameter(diameterMm) {
  let best = STEEL_DIAMETERS_MM[0]
  for (const size of STEEL_DIAMETERS_MM) if (size <= diameterMm + 1e-9) best = size
  return best
}

/**
 * A dowel's sizing at one diameter — the one rule the search, a hand placement, the Split
 * sheet's pieces list and the bill of materials all use.
 *
 * @param {number} diameterMm Asked-for diameter; a steel pin rounds down to a standard size and
 *   filament is always {@link FILAMENT_DIAMETER_MM}.
 * @param {number} clearanceMm Per side.
 * @param {DowelStock} [stock] Default `printed`.
 * @returns {{ diameterMm: number, radiusMm: number, socketRadiusMm: number, socketDepthMm: number, lengthMm: number, flatDepthMm: number, stockLengthMm: number | null }}
 *   `lengthMm` is the printed dowel's (the room the sockets leave); `stockLengthMm` the bought
 *   pin's or the filament's cut length, at most `lengthMm`, `null` for a printed dowel.
 */
export function dowelSizing(diameterMm, clearanceMm, stock = 'printed') {
  const d = stock === 'filament' ? FILAMENT_DIAMETER_MM : stock === 'steel' ? steelDiameter(diameterMm) : diameterMm
  const socketDepthMm = Math.min(1.5 * d, DOWEL_MAX_SOCKET_MM)
  const lengthMm = 2 * socketDepthMm - 2 * clearanceMm
  let stockLengthMm = null
  if (stock === 'steel') {
    stockLengthMm = STEEL_LENGTHS_MM.filter((length) => length <= lengthMm + 1e-9).at(-1) ?? null
  } else if (stock === 'filament') {
    stockLengthMm = Math.floor(lengthMm * 2) / 2
  }
  return {
    diameterMm: d,
    radiusMm: d / 2,
    socketRadiusMm: d / 2 + clearanceMm,
    socketDepthMm,
    lengthMm,
    flatDepthMm: DOWEL_FLAT_RATIO * d,
    stockLengthMm,
  }
}

/**
 * What a dowel is called, for a person: a printed one's key label and printed size, or a
 * bought one's shopping-list line. The kernel's key metadata, `assembly.txt` and the Split
 * sheet's pieces list all read this, so they say the same thing.
 *
 * @param {number} diameterMm
 * @param {number} clearanceMm
 * @param {DowelStock} [stock]
 * @returns {{ diameterMm: number, lengthMm: number, keyLabel: string, keySizeMm: Vec3Mm, hardwareLabel: string }}
 *   `keySizeMm` is a printed dowel's size as it lies on the bed (length × diameter × height
 *   over its D-flat); `hardwareLabel` a bought one's line, `''` for a printed dowel.
 */
export function describeDowel(diameterMm, clearanceMm, stock = 'printed') {
  const sizing = dowelSizing(diameterMm, clearanceMm, stock)
  const d = sizing.diameterMm
  const length = stock === 'printed' ? sizing.lengthMm : (sizing.stockLengthMm ?? sizing.lengthMm)
  const hardwareLabel =
    stock === 'steel'
      ? `steel dowel pin Ø${fmt(d)} × ${fmt(length)} mm`
      : stock === 'filament'
        ? `1.75 mm filament, cut to ${fmt(length)} mm`
        : ''
  return {
    diameterMm: d,
    lengthMm: length,
    keyLabel: `Dowel Ø${fmt(d)} × ${fmt(sizing.lengthMm)} mm`,
    keySizeMm: [sizing.lengthMm, d, d - sizing.flatDepthMm],
    hardwareLabel,
  }
}

/**
 * A dowel's socket plus wall on the face.
 *
 * @param {number} diameterMm
 * @param {number} clearanceMm
 * @param {DowelStock} stock
 * @param {{ uMm: number, vMm: number }} centre
 * @returns {Footprint}
 */
export function dowelFootprint(diameterMm, clearanceMm, stock, centre) {
  const { socketRadiusMm } = dowelSizing(diameterMm, clearanceMm, stock)
  return { shape: 'circle', uMm: centre.uMm, vMm: centre.vMm, radiusMm: socketRadiusMm + JOINT_WALL_MM }
}

/**
 * Why a dowel does not fit at `centre`, by exact boolean containment — `null` when it does.
 *
 * - `wall`: its socket plus a {@link JOINT_WALL_MM} wall would break out of piece B.
 * - `wallA`: the same in piece A — the half of the check a pin never needed.
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {Geom3} args.lower
 * @param {Geom3} args.upper
 * @param {number} args.clearanceMm
 * @param {number} args.diameterMm
 * @param {DowelStock} [args.stock]
 * @param {{ uMm: number, vMm: number }} args.centre
 * @returns {'wall' | 'wallA' | null}
 */
export function dowelMisfit({ field, lower, upper, clearanceMm, diameterMm, stock = 'printed', centre }) {
  const { axisIndex, cutMm } = field
  const { socketRadiusMm, socketDepthMm } = dowelSizing(diameterMm, clearanceMm, stock)
  const section = { radiusMm: socketRadiusMm + JOINT_WALL_MM }
  const reach = socketDepthMm + JOINT_WALL_MM
  if (!contains(upper, prismAlong(axisIndex, cutMm, cutMm + reach, centre.uMm, centre.vMm, section))) return 'wall'
  if (!contains(lower, prismAlong(axisIndex, cutMm - reach, cutMm, centre.uMm, centre.vMm, section))) return 'wallA'
  return null
}

/**
 * The outward normal of a dowel's D-flat — the face it prints on. Square to the cut axis:
 * down (−Z) for a cut across X or Y, −Y for a cut across Z.
 *
 * @param {number} axisIndex
 * @returns {Vec3Mm}
 */
export function dowelBedNormal(axisIndex) {
  return axisIndex === 2 ? [0, -1, 0] : [0, 0, -1]
}

/**
 * One printed dowel, assembled: centred on the cut face at `(uMm, vMm)`, chamfered both ends,
 * with its D-flat.
 *
 * @param {ClearanceField} field
 * @param {ReturnType<typeof dowelSizing>} sizing
 * @param {{ uMm: number, vMm: number }} centre
 * @returns {Geom3}
 */
function dowelSolid(field, sizing, centre) {
  const { axisIndex, cutMm } = field
  const { radiusMm, lengthMm, flatDepthMm } = sizing
  const chamfer = Math.min(DOWEL_CHAMFER_MM, radiusMm / 2, lengthMm / 4)
  // A chamfered cylinder is the hull of a full-length one a chamfer thinner and a full-width
  // one two chamfers shorter — both 32-gons, so it stays inside the round socket.
  const along = hulls.hull(
    primitives.cylinder({ radius: radiusMm - chamfer, height: lengthMm, segments: JOINT_SEGMENTS }),
    primitives.cylinder({ radius: radiusMm, height: lengthMm - 2 * chamfer, segments: JOINT_SEGMENTS })
  )
  const turned =
    axisIndex === 2 ? along : transforms.rotate(axisIndex === 0 ? [0, Math.PI / 2, 0] : [-Math.PI / 2, 0, 0], along)
  const [u, v] = faceAxes(axisIndex)
  /** @type {Vec3Mm} */
  const at = [0, 0, 0]
  at[axisIndex] = cutMm
  at[u] = centre.uMm
  at[v] = centre.vMm
  const placed = transforms.translate(at, turned)

  // The D-flat: cut away everything further than (r − flat) from the axis on the bed side.
  const normal = dowelBedNormal(axisIndex)
  const big = 2 * (lengthMm + 2 * radiusMm) + 2
  const offset = radiusMm - flatDepthMm + big / 2
  /** @type {Vec3Mm} */
  const boxCentre = [at[0] + normal[0] * offset, at[1] + normal[1] * offset, at[2] + normal[2] * offset]
  return booleans.subtract(placed, primitives.cuboid({ size: [big, big, big], center: boxCentre }))
}

/**
 * Dowels and their sockets at exactly these centres — no search, no check (ask
 * {@link dowelMisfit} first).
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {number} args.clearanceMm
 * @param {number} args.diameterMm
 * @param {DowelStock} [args.stock]
 * @param {{ uMm: number, vMm: number }[]} args.centres
 * @param {'search' | 'placed'} [args.source]
 * @returns {JointGeometry}
 */
export function dowelsAt({ field, clearanceMm, diameterMm, stock = 'printed', centres, source = 'search' }) {
  const { axisIndex, cutMm } = field
  const sizing = dowelSizing(diameterMm, clearanceMm, stock)
  const { socketRadiusMm, socketDepthMm, lengthMm } = sizing
  const d = sizing.diameterMm
  const section = { radiusMm: socketRadiusMm }
  // Each socket starts a little past the face on the other side, so its boolean never meets a
  // coplanar face; that part of it is outside its own piece.
  const holes = centres.map((c) => prismAlong(axisIndex, cutMm - socketDepthMm, cutMm + JOINT_EMBED_MM, c.uMm, c.vMm, section))
  const sockets = centres.map((c) => prismAlong(axisIndex, cutMm - JOINT_EMBED_MM, cutMm + socketDepthMm, c.uMm, c.vMm, section))

  /** @type {{ solid: Geom3, meta: PartMeta }[]} */
  const keys = []
  /** @type {Omit<HardwareItem, 'joins' | 'axis'>[]} */
  const hardware = []
  let summary
  const words = describeDowel(diameterMm, clearanceMm, stock)
  if (stock === 'printed') {
    for (const centre of centres) {
      keys.push({
        solid: dowelSolid(field, sizing, centre),
        meta: {
          role: 'key',
          kind: 'dowel',
          shape: `dowel-${fmt(d)}x${fmt(lengthMm)}`,
          label: words.keyLabel,
          sizeMm: d,
          bedNormal: dowelBedNormal(axisIndex),
        },
      })
    }
    summary = `${centres.length} printed dowel${centres.length === 1 ? '' : 's'}, Ø${fmt(d)} × ${fmt(lengthMm)} mm`
  } else {
    const label = words.hardwareLabel
    hardware.push({ item: 'dowel', stock, diameterMm: d, lengthMm: words.lengthMm, count: centres.length, label })
    summary = `${centres.length} × ${label}`
  }
  return {
    kind: /** @type {any} */ ('dowel'),
    pins: [],
    sockets,
    holes,
    keys,
    hardware: /** @type {any} */ (hardware),
    connectors: centres.map((centre) => ({
      kind: /** @type {any} */ ('dowel'),
      source,
      uMm: centre.uMm,
      vMm: centre.vMm,
      sizeMm: d,
      lengthMm,
      stock,
      footprint: dowelFootprint(d, clearanceMm, stock, centre),
    })),
    summary,
  }
}

/**
 * The diameters a search tries, largest first.
 *
 * @param {number} minorMm The face's narrower side.
 * @param {DowelStock} stock
 * @param {number | null} sizeMm A fixed size the record asked for.
 * @returns {number[]}
 */
function candidateDiameters(minorMm, stock, sizeMm) {
  if (stock === 'filament') return [FILAMENT_DIAMETER_MM]
  const start = sizeMm ?? clamp(minorMm * 0.35, DOWEL_MIN_DIAMETER_MM, DOWEL_MAX_DIAMETER_MM)
  if (stock === 'steel') {
    const top = steelDiameter(start)
    return sizeMm !== null ? [top] : STEEL_DIAMETERS_MM.filter((size) => size <= top).reverse()
  }
  if (sizeMm !== null) return [sizeMm]
  /** @type {number[]} */
  const diameters = []
  for (let d = start; d >= DOWEL_MIN_DIAMETER_MM - 1e-9; d *= 0.75) diameters.push(d)
  if (diameters.at(-1) !== DOWEL_MIN_DIAMETER_MM) diameters.push(DOWEL_MIN_DIAMETER_MM)
  return diameters
}

/**
 * Plan loose dowels on a cut face: two if two fit apart (the pair furthest apart, which also
 * stops the pieces turning), otherwise one. The field must have been sampled under the face
 * (`clearanceField`'s `maxBelowMm`).
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {Geom3} args.lower
 * @param {Geom3} args.upper
 * @param {number} args.clearanceMm
 * @param {DowelStock} [args.stock]
 * @param {number | null} [args.sizeMm] A fixed diameter; default the search's own.
 * @param {Footprint[]} [args.keepOut]
 * @returns {JointGeometry | null} `null` when no dowel fits.
 */
export function dowelJoint({ field, lower, upper, clearanceMm, stock = 'printed', sizeMm = null, keepOut = [] }) {
  const minor = Math.min(field.uRange[1] - field.uRange[0], field.vRange[1] - field.vRange[0])
  /** @type {{ diameterMm: number, centres: { uMm: number, vMm: number }[] } | null} */
  let single = null
  for (const diameterMm of candidateDiameters(minor, stock, sizeMm)) {
    const { socketRadiusMm, socketDepthMm } = dowelSizing(diameterMm, clearanceMm, stock)
    const reach = socketDepthMm + JOINT_WALL_MM
    const wallNeed = Math.hypot(socketRadiusMm + JOINT_WALL_MM, field.depthStepMm / 2)
    const fits = field.points.filter(
      (point) =>
        clearanceTo(field, point, reach) >= wallNeed &&
        clearanceBelow(field, point, reach) >= wallNeed &&
        keepOut.every((other) => !footprintsOverlap(other, dowelFootprint(diameterMm, clearanceMm, stock, point)))
    )
    if (fits.length === 0) continue
    const apart = 2 * (socketRadiusMm + JOINT_WALL_MM)
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
    const least = (/** @type {import('./joint.common.js').FacePoint} */ p) =>
      Math.min(clearanceTo(field, p, reach), clearanceBelow(field, p, reach))
    const centres = best ? [fits[best[0]], fits[best[1]]] : [fits.reduce((a, b) => (least(b) > least(a) ? b : a))]
    const confirmed = centres.filter(
      (centre) => dowelMisfit({ field, lower, upper, clearanceMm, diameterMm, stock, centre }) === null
    )
    if (confirmed.length >= 2) return dowelsAt({ field, clearanceMm, diameterMm, stock, centres: confirmed })
    if (confirmed.length === 1 && single === null) single = { diameterMm, centres: confirmed }
  }
  return single ? dowelsAt({ field, clearanceMm, diameterMm: single.diameterMm, stock, centres: single.centres }) : null
}
