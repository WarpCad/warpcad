// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The sketch profile model (`TODO/sketch-001`).
 *
 * A sketch is a way of **defining a primitive**: a stack of one or more 2D slices, each
 * holding closed outlines marked Solid or Hole, plus one extrusion method that turns the
 * stack into a solid. `primitive.sketch` in `src/core/kernel/registry.js` is the only
 * place that turns this into `@jscad/modeling` geometry; everything here is plain data
 * and pure functions over it, in the same style `entity.js` used for ui-020's lines.
 *
 * Framework-free (CLAUDE.md's Project Structure): no Vue, no DOM, no three.js, and no
 * `@jscad/modeling` — {@link regionOf} returns point lists, never a `geom2`, so the kernel
 * boundary stays in `src/core/kernel/`.
 *
 * ## Units and spaces
 *
 * Millimetres in the **sketch's own local plane**: X then Y, with the body's origin at
 * `[0, 0]`. A slice's `zMm` is its offset along the body's local Z. Moving or turning
 * the body later moves every slice with it, because the body frame is applied after the
 * build (see `src/core/kernel/sketchFrame.js`). Angles are **degrees** here and in the
 * UI; the registry converts to radians once, at its own boundary. Every field carries
 * its unit in its name (`radiusMm`, `twistDeg`).
 *
 * ## Immutability
 *
 * Every edit returns a **new** params object. The editor works on a draft
 * (`src/stores/sketchEditor.js`) and commits once on Done, so the document log only
 * ever sees the finished sketch — one editing session, one undo step.
 *
 * @module sketch/profile
 */

/** @typedef {[number, number]} Vec2Mm Millimetres in the sketch plane, X then Y. */
/** @typedef {'solid' | 'hole'} ProfileRole */

/**
 * @typedef {object} CircleProfile
 * @property {string} id
 * @property {'circle'} kind
 * @property {ProfileRole} role
 * @property {Vec2Mm} centerMm
 * @property {number} radiusMm
 */
/**
 * @typedef {object} RectProfile
 * @property {string} id
 * @property {'rect'} kind
 * @property {ProfileRole} role
 * @property {Vec2Mm} centerMm
 * @property {number} widthMm
 * @property {number} heightMm
 */
/**
 * A regular N-gon. Vertex 0 sits at `rotationDeg` from +X, so a 6-gon at 0° is exactly
 * `primitive.hexagon`'s profile.
 *
 * @typedef {object} PolygonProfile
 * @property {string} id
 * @property {'polygon'} kind
 * @property {ProfileRole} role
 * @property {Vec2Mm} centerMm
 * @property {number} radiusMm Circumradius.
 * @property {number} sides
 * @property {number} rotationDeg
 */
/**
 * @typedef {object} PolylineProfile
 * @property {string} id
 * @property {'polyline'} kind
 * @property {ProfileRole} role
 * @property {Vec2Mm[]} pointsMm
 * @property {boolean} closed An open chain is kept (and drawn as a warning) but is
 *   never part of the solid.
 */
/** @typedef {CircleProfile | RectProfile | PolygonProfile | PolylineProfile} Profile */

/**
 * @typedef {object} Slice
 * @property {string} id
 * @property {number} zMm Offset along the body's local Z.
 * @property {Profile[]} profiles
 * @property {Record<string, any>} [image] Reserved for a reference photo
 *   (`TODO/sketch-003`). Never geometry: the registry ignores it.
 */

/** @typedef {'linear' | 'revolve' | 'helical' | 'outline' | 'loft'} ExtrusionMethod */

/**
 * @typedef {object} SketchParams
 * @property {[number, number, number]} [center] The body's origin — where the sketch
 *   plane sits in the document.
 * @property {Slice[]} slices
 * @property {{ method: ExtrusionMethod } & Record<string, number | string>} extrusion
 */

export const PROFILE_KINDS = Object.freeze(['circle', 'rect', 'polygon', 'polyline'])
export const PROFILE_ROLES = Object.freeze(['solid', 'hole'])
export const EXTRUSION_METHODS = /** @type {readonly ExtrusionMethod[]} */ (
  Object.freeze(['linear', 'revolve', 'helical', 'outline', 'loft'])
)

/**
 * Each method's params and their starting values, in UI units.
 *
 * `loft.resolution` of `0` means "automatic" — the largest vertex count among the slices,
 * capped at 256 (`src/sketch/resample.js`).
 */
export const EXTRUSION_DEFAULTS = Object.freeze({
  linear: Object.freeze({ heightMm: 10, twistDeg: 0, twistSteps: 1 }),
  revolve: Object.freeze({ angleDeg: 360, startAngleDeg: 0, segments: 32 }),
  helical: Object.freeze({ pitchMm: 10, turns: 2, endOffsetMm: 0, segmentsPerTurn: 32 }),
  outline: Object.freeze({ wallMm: 2, heightMm: 10 }),
  loft: Object.freeze({ resolution: 0 }),
})

/**
 * Which extrusion params must be strictly positive, which may be zero, and which may be
 * any finite number — enforced by {@link validateSketchParams}, so a bad value is named
 * rather than handed to the kernel.
 */
const EXTRUSION_PARAM_RULES = Object.freeze({
  linear: { heightMm: 'positive', twistDeg: 'finite', twistSteps: 'positiveInteger' },
  revolve: { angleDeg: 'positive', startAngleDeg: 'finite', segments: 'atLeast3' },
  helical: { pitchMm: 'positive', turns: 'positive', endOffsetMm: 'finite', segmentsPerTurn: 'atLeast3' },
  outline: { wallMm: 'positive', heightMm: 'positive' },
  loft: { resolution: 'nonNegativeInteger' },
})

/** Hard caps on untrusted input, so a hostile document cannot ask for unbounded work. */
const MAX_SLICES = 64
const MAX_PROFILES_PER_SLICE = 256
const MAX_POLYLINE_POINTS = 4096
const MAX_POLYGON_SIDES = 256

/** Tolerance, in mm², below which an outline encloses nothing. */
const AREA_EPS_MM2 = 1e-9

// --- geometry helpers -------------------------------------------------------

/**
 * Signed area by the shoelace formula: positive for counter-clockwise.
 *
 * @param {readonly (readonly number[])[]} pointsMm
 * @returns {number} mm²
 */
export function signedAreaMm2(pointsMm) {
  let twice = 0
  for (let index = 0; index < pointsMm.length; index += 1) {
    const a = pointsMm[index]
    const b = pointsMm[(index + 1) % pointsMm.length]
    twice += a[0] * b[1] - b[0] * a[1]
  }
  return twice / 2
}

/** @param {unknown} value @returns {value is Vec2Mm} */
function isVec2(value) {
  return Array.isArray(value) && value.length === 2 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

/** @param {unknown} value */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Drop consecutive duplicate points (and a closing duplicate of the first), so a doubled
 * click or a chain finished exactly on its start does not leave a zero-length edge.
 *
 * @param {readonly Vec2Mm[]} pointsMm
 * @returns {Vec2Mm[]}
 */
function dedupe(pointsMm) {
  /** @type {Vec2Mm[]} */
  const out = []
  for (const point of pointsMm) {
    const last = out[out.length - 1]
    if (last && Math.abs(last[0] - point[0]) < 1e-12 && Math.abs(last[1] - point[1]) < 1e-12) continue
    out.push([point[0], point[1]])
  }
  while (out.length > 1) {
    const first = out[0]
    const last = out[out.length - 1]
    if (Math.abs(first[0] - last[0]) < 1e-12 && Math.abs(first[1] - last[1]) < 1e-12) out.pop()
    else break
  }
  return out
}

/**
 * A profile as a ring of points, **counter-clockwise**, without a repeated closing point.
 *
 * @param {Profile} profile
 * @param {number} [segments] How many points approximate a circle.
 * @returns {Vec2Mm[]}
 */
export function toPointsMm(profile, segments = 64) {
  if (profile.kind === 'circle') {
    const count = Math.max(3, Math.round(segments))
    /** @type {Vec2Mm[]} */
    const points = []
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2
      points.push([profile.centerMm[0] + profile.radiusMm * Math.cos(angle), profile.centerMm[1] + profile.radiusMm * Math.sin(angle)])
    }
    return points
  }
  if (profile.kind === 'rect') {
    const halfW = profile.widthMm / 2
    const halfH = profile.heightMm / 2
    const [cx, cy] = profile.centerMm
    return [
      [cx - halfW, cy - halfH],
      [cx + halfW, cy - halfH],
      [cx + halfW, cy + halfH],
      [cx - halfW, cy + halfH],
    ]
  }
  if (profile.kind === 'polygon') {
    const sides = Math.max(3, Math.round(profile.sides))
    const start = (profile.rotationDeg * Math.PI) / 180
    /** @type {Vec2Mm[]} */
    const points = []
    for (let index = 0; index < sides; index += 1) {
      const angle = start + (index / sides) * Math.PI * 2
      points.push([profile.centerMm[0] + profile.radiusMm * Math.cos(angle), profile.centerMm[1] + profile.radiusMm * Math.sin(angle)])
    }
    return points
  }
  const points = dedupe(profile.pointsMm)
  return signedAreaMm2(points) < 0 ? points.reverse() : points
}

/**
 * Whether a profile is a closed outline that encloses real area — the only kind that can
 * be part of the solid.
 *
 * @param {Profile} profile
 * @returns {boolean}
 */
export function isClosed(profile) {
  if (profile.kind === 'circle') return profile.radiusMm > 0
  if (profile.kind === 'rect') return profile.widthMm > 0 && profile.heightMm > 0
  if (profile.kind === 'polygon') return profile.radiusMm > 0 && profile.sides >= 3
  if (!profile.closed) return false
  const points = dedupe(profile.pointsMm)
  return points.length >= 3 && Math.abs(signedAreaMm2(points)) > AREA_EPS_MM2
}

/**
 * Do two segments properly cross (touching at a shared endpoint does not count)?
 *
 * @param {Vec2Mm} a1 @param {Vec2Mm} a2 @param {Vec2Mm} b1 @param {Vec2Mm} b2
 */
function segmentsCross(a1, a2, b1, b2) {
  /** @param {Vec2Mm} p @param {Vec2Mm} q @param {Vec2Mm} r */
  const d = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = d(b1, b2, a1)
  const d2 = d(b1, b2, a2)
  const d3 = d(a1, a2, b1)
  const d4 = d(a1, a2, b2)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/**
 * Whether a polyline crosses itself. Circles, rectangles and regular polygons never do.
 * O(n²), which is fine at the profile sizes a hand-drawn (or 4096-point capped) sketch has.
 *
 * @param {Profile} profile
 * @returns {boolean}
 */
export function selfIntersects(profile) {
  if (profile.kind !== 'polyline') return false
  const points = dedupe(profile.pointsMm)
  const count = points.length
  const edges = profile.closed ? count : count - 1
  if (edges < 3) return false
  for (let i = 0; i < edges; i += 1) {
    const a1 = points[i]
    const a2 = points[(i + 1) % count]
    for (let j = i + 1; j < edges; j += 1) {
      // Neighbouring edges share a vertex; that is not a crossing.
      if (j === i + 1 || (profile.closed && i === 0 && j === edges - 1)) continue
      if (segmentsCross(a1, a2, points[j], points[(j + 1) % count])) return true
    }
  }
  return false
}

/**
 * @typedef {object} RegionStep
 * @property {string} id
 * @property {ProfileRole} role
 * @property {Vec2Mm[]} pointsMm Counter-clockwise ring.
 * @property {number} areaMm2
 */

/**
 * @typedef {object} Region
 * @property {Vec2Mm[][]} solids
 * @property {Vec2Mm[][]} holes
 * @property {RegionStep[]} steps Every closed outline, **largest first** — the order the
 *   kernel applies them in: a solid is unioned in, a hole subtracted. For the common case
 *   this is exactly `union(solids) − union(holes)`; ordering by area is what keeps a solid
 *   drawn *inside* a hole as an island instead of having the hole swallow it.
 * @property {number} openCount Open chains, which are never part of the solid.
 */

/**
 * One slice as point lists, ready for the kernel. Open and degenerate outlines are
 * skipped, not thrown on.
 *
 * @param {Slice} slice
 * @param {number | ((profile: Profile) => number)} [segments] Circle point count, or a
 *   function choosing one per profile (the registry passes the design resolution's).
 * @returns {Region}
 */
export function regionOf(slice, segments = 64) {
  /** @type {RegionStep[]} */
  const steps = []
  let openCount = 0
  for (const profile of slice.profiles) {
    if (!isClosed(profile)) {
      if (profile.kind === 'polyline' && !profile.closed) openCount += 1
      continue
    }
    const count = typeof segments === 'function' ? segments(profile) : segments
    const pointsMm = toPointsMm(profile, count)
    steps.push({ id: profile.id, role: profile.role, pointsMm, areaMm2: Math.abs(signedAreaMm2(pointsMm)) })
  }
  steps.sort((a, b) => b.areaMm2 - a.areaMm2)
  return {
    solids: steps.filter((step) => step.role === 'solid').map((step) => step.pointsMm),
    holes: steps.filter((step) => step.role === 'hole').map((step) => step.pointsMm),
    steps,
    openCount,
  }
}

/** @param {Vec2Mm[]} a @param {Vec2Mm[]} b */
function sameRing(a, b) {
  if (a.length !== b.length) return false
  return a.every((point, index) => Math.abs(point[0] - b[index][0]) < 1e-9 && Math.abs(point[1] - b[index][1]) < 1e-9)
}

/**
 * Why one slice cannot be extruded, or `null` when it can.
 *
 * The statically checkable half of the Done gate; the kernel build behind the editor's
 * preview catches the rest (an overlap that leaves nothing, say).
 *
 * @param {Slice} slice
 * @returns {string | null}
 */
export function sliceProblem(slice) {
  // Checked before closure: a bow-tie's two lobes cancel to zero net area, so it would
  // otherwise be reported as "not closed", which sends the user looking for a gap.
  const crossing = slice.profiles.find(
    (profile) => profile.kind === 'polyline' && profile.closed && selfIntersects(profile)
  )
  if (crossing) return 'An outline crosses itself — move a point so it doesn’t'
  const region = regionOf(slice, 32)
  if (region.solids.length === 0) return 'Draw at least one closed solid outline'
  const cancelled = region.solids.every((solid) => region.holes.some((hole) => sameRing(solid, hole)))
  if (cancelled) return 'The holes cover every solid outline, so there is nothing left to extrude'
  return null
}

/**
 * The one slice a non-Loft method extrudes.
 *
 * @param {SketchParams} params
 */
function onlySlice(params) {
  return params.slices[0]
}

/**
 * Why `method` cannot be used for these slices, or `null` — the reason the Extrude
 * panel prints on a disabled method, and part of the Done gate.
 *
 * @param {SketchParams} params
 * @param {ExtrusionMethod} method
 * @returns {string | null}
 */
export function methodProblem(params, method) {
  const count = params.slices.length
  if (method === 'loft') {
    if (count < 2) return 'Loft needs two or more slices'
    const zs = params.slices.map((slice) => slice.zMm)
    if (new Set(zs).size !== zs.length) return 'Two slices are at the same Z — Loft needs each at its own height'
    for (const slice of params.slices) {
      const closed = slice.profiles.filter(isClosed)
      if (closed.length !== 1 || closed[0].role !== 'solid') {
        return 'Loft needs each slice to have exactly one Solid outline and no Holes — cut holes afterwards with Subtract'
      }
    }
    return null
  }
  const label = method.charAt(0).toUpperCase() + method.slice(1)
  if (count !== 1) return `${label} uses one slice — remove the others or pick Loft`
  if (method === 'revolve' || method === 'helical') {
    const region = regionOf(onlySlice(params), 32)
    const crosses = region.steps.some((step) => step.pointsMm.some((point) => point[0] < -1e-9))
    if (crosses) return `${label} spins around the sketch’s Y axis — keep every outline on the +X side of the axis`
  }
  return null
}

/**
 * Why Done is disabled, or `null` when the sketch can be committed.
 *
 * @param {SketchParams} params
 * @returns {string | null}
 */
export function sketchProblem(params) {
  const method = params.extrusion?.method
  if (method === 'outline') {
    // Outline thickens every closed outline into a wall and ignores Solid/Hole, so any
    // closed outline will do — a lone "hole" is a perfectly good wall.
    const slice = onlySlice(params)
    const crossing = slice.profiles.find((profile) => profile.kind === 'polyline' && profile.closed && selfIntersects(profile))
    if (crossing) return 'An outline crosses itself — move a point so it doesn’t'
    if (!slice.profiles.some(isClosed)) return 'Draw at least one closed outline'
  } else if (method !== 'loft') {
    const problem = sliceProblem(onlySlice(params))
    if (problem) return problem
  } else {
    for (const [index, slice] of params.slices.entries()) {
      const problem = sliceProblem(slice)
      if (problem) return `Slice ${index + 1}: ${problem}`
    }
  }
  return methodProblem(params, method)
}

// --- untrusted-input validation --------------------------------------------

/**
 * @param {string} where
 * @param {Record<string, any>} profile
 * @returns {string | null}
 */
function profileShapeProblem(where, profile) {
  if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) return `${where} is not an object`
  if (typeof profile.id !== 'string' || profile.id === '') return `${where} has no id`
  if (!PROFILE_KINDS.includes(profile.kind)) return `${where} has an unknown kind ${JSON.stringify(profile.kind)}`
  if (!PROFILE_ROLES.includes(profile.role)) return `${where} has an unknown role ${JSON.stringify(profile.role)}`
  if (profile.kind === 'polyline') {
    if (!Array.isArray(profile.pointsMm) || profile.pointsMm.length > MAX_POLYLINE_POINTS) {
      return `${where}.pointsMm must be a list of at most ${MAX_POLYLINE_POINTS} points`
    }
    if (!profile.pointsMm.every(isVec2)) return `${where}.pointsMm holds a point that is not two finite millimetre values`
    if (typeof profile.closed !== 'boolean') return `${where}.closed must be true or false`
    return null
  }
  if (!isVec2(profile.centerMm)) return `${where}.centerMm must be two finite millimetre values`
  const numbers = profile.kind === 'rect' ? ['widthMm', 'heightMm'] : profile.kind === 'polygon' ? ['radiusMm', 'sides', 'rotationDeg'] : ['radiusMm']
  for (const key of numbers) {
    if (!isFiniteNumber(profile[key])) return `${where}.${key} must be a finite number`
    if (key !== 'rotationDeg' && profile[key] < 0) return `${where}.${key} must not be negative`
  }
  if (profile.kind === 'polygon' && !(Number.isInteger(profile.sides) && profile.sides >= 3 && profile.sides <= MAX_POLYGON_SIDES)) {
    return `${where}.sides must be a whole number from 3 to ${MAX_POLYGON_SIDES}`
  }
  return null
}

/**
 * Check a sketch's params **shape** — the thing a document from an untrusted source
 * (`#/gist/<id>`, ACCEPTANCE scenario 8) could get wrong on purpose. Returns the first
 * problem as a sentence, or `null`. Never throws, whatever it is handed.
 *
 * Whether the shape is *buildable* (a hole that cancels its solid) is
 * {@link sketchProblem}'s question, not this one.
 *
 * @param {unknown} params
 * @returns {string | null}
 */
export function validateSketchParams(params) {
  if (params === null || typeof params !== 'object' || Array.isArray(params)) return 'params must be an object'
  const value = /** @type {Record<string, any>} */ (params)
  if (value.center !== undefined) {
    if (!Array.isArray(value.center) || value.center.length !== 3 || !value.center.every(isFiniteNumber)) {
      return 'center must be three finite millimetre values'
    }
  }
  if (!Array.isArray(value.slices) || value.slices.length === 0 || value.slices.length > MAX_SLICES) {
    return `slices must be a list of 1 to ${MAX_SLICES} slices`
  }
  for (const [sliceIndex, slice] of value.slices.entries()) {
    const where = `slices[${sliceIndex}]`
    if (slice === null || typeof slice !== 'object' || Array.isArray(slice)) return `${where} is not an object`
    if (typeof slice.id !== 'string' || slice.id === '') return `${where} has no id`
    if (!isFiniteNumber(slice.zMm)) return `${where}.zMm must be a finite number`
    if (!Array.isArray(slice.profiles) || slice.profiles.length > MAX_PROFILES_PER_SLICE) {
      return `${where}.profiles must be a list of at most ${MAX_PROFILES_PER_SLICE} outlines`
    }
    for (const [profileIndex, profile] of slice.profiles.entries()) {
      const problem = profileShapeProblem(`${where}.profiles[${profileIndex}]`, profile)
      if (problem) return problem
    }
  }
  const extrusion = value.extrusion
  if (extrusion === null || typeof extrusion !== 'object' || Array.isArray(extrusion)) return 'extrusion must be an object'
  if (!EXTRUSION_METHODS.includes(extrusion.method)) return `extrusion.method ${JSON.stringify(extrusion.method)} is not one of ${EXTRUSION_METHODS.join(', ')}`
  const rules = EXTRUSION_PARAM_RULES[/** @type {ExtrusionMethod} */ (extrusion.method)]
  for (const [key, rule] of Object.entries(rules)) {
    const defaults = /** @type {Record<string, number>} */ (EXTRUSION_DEFAULTS[/** @type {ExtrusionMethod} */ (extrusion.method)])
    const entry = extrusion[key] ?? defaults[key]
    if (!isFiniteNumber(entry)) return `extrusion.${key} must be a finite number`
    if (rule === 'positive' && !(entry > 0)) return `extrusion.${key} must be greater than 0`
    if (rule === 'positiveInteger' && !(Number.isInteger(entry) && entry >= 1)) return `extrusion.${key} must be a whole number of at least 1`
    if (rule === 'atLeast3' && !(Number.isInteger(entry) && entry >= 3 && entry <= 1024)) return `extrusion.${key} must be a whole number from 3 to 1024`
    if (rule === 'nonNegativeInteger' && !(Number.isInteger(entry) && entry >= 0)) return `extrusion.${key} must be a whole number of 0 or more`
  }
  return null
}

// --- draft edits (pure) -----------------------------------------------------

/**
 * A brand-new sketch: one empty slice at Z = 0, Linear.
 *
 * @returns {SketchParams}
 */
export function emptySketchParams() {
  return {
    slices: [{ id: 's1', zMm: 0, profiles: [] }],
    extrusion: { method: 'linear', ...EXTRUSION_DEFAULTS.linear },
  }
}

/**
 * @param {SketchParams} params
 * @param {number} sliceIndex
 * @param {(slice: Slice) => Slice} change
 * @returns {SketchParams}
 */
function mapSlice(params, sliceIndex, change) {
  if (!params.slices[sliceIndex]) throw new Error(`sketch: there is no slice ${sliceIndex + 1}`)
  return { ...params, slices: params.slices.map((slice, index) => (index === sliceIndex ? change(slice) : slice)) }
}

/**
 * @param {SketchParams} params
 * @param {number} sliceIndex
 * @param {Profile} profile
 * @returns {SketchParams}
 */
export function addProfile(params, sliceIndex, profile) {
  return mapSlice(params, sliceIndex, (slice) => ({ ...slice, profiles: [...slice.profiles, profile] }))
}

/**
 * Replace one profile by id.
 *
 * @param {SketchParams} params
 * @param {number} sliceIndex
 * @param {Profile} profile
 * @returns {SketchParams}
 */
export function replaceProfile(params, sliceIndex, profile) {
  return mapSlice(params, sliceIndex, (slice) => ({
    ...slice,
    profiles: slice.profiles.map((existing) => (existing.id === profile.id ? profile : existing)),
  }))
}

/**
 * @param {SketchParams} params
 * @param {number} sliceIndex
 * @param {string} profileId
 * @param {ProfileRole} role
 * @returns {SketchParams}
 */
export function setRole(params, sliceIndex, profileId, role) {
  if (!PROFILE_ROLES.includes(role)) throw new Error(`sketch: unknown role "${role}"`)
  return mapSlice(params, sliceIndex, (slice) => ({
    ...slice,
    profiles: slice.profiles.map((profile) => (profile.id === profileId ? { ...profile, role } : profile)),
  }))
}

/**
 * @param {SketchParams} params
 * @param {number} sliceIndex
 * @param {string} profileId
 * @returns {SketchParams}
 */
export function removeProfile(params, sliceIndex, profileId) {
  return mapSlice(params, sliceIndex, (slice) => ({ ...slice, profiles: slice.profiles.filter((profile) => profile.id !== profileId) }))
}

/** How far above the current top slice a new one starts. */
export const NEW_SLICE_STEP_MM = 50

/**
 * Add an empty slice above the highest one.
 *
 * @param {SketchParams} params
 * @param {string} id
 * @returns {SketchParams}
 */
export function addSlice(params, id) {
  const top = Math.max(...params.slices.map((slice) => slice.zMm))
  return { ...params, slices: [...params.slices, { id, zMm: top + NEW_SLICE_STEP_MM, profiles: [] }] }
}

/**
 * @param {SketchParams} params
 * @param {number} sliceIndex
 * @returns {SketchParams}
 */
export function removeSlice(params, sliceIndex) {
  if (params.slices.length <= 1) throw new Error('sketch: a sketch needs at least one slice')
  return { ...params, slices: params.slices.filter((_, index) => index !== sliceIndex) }
}

/**
 * @param {SketchParams} params
 * @param {number} sliceIndex
 * @param {number} zMm
 * @returns {SketchParams}
 */
export function setSliceZ(params, sliceIndex, zMm) {
  if (!isFiniteNumber(zMm)) throw new Error('sketch: a slice offset must be a finite number of millimetres')
  return mapSlice(params, sliceIndex, (slice) => ({ ...slice, zMm }))
}

/**
 * Switch extrusion method, starting from that method's defaults.
 *
 * @param {SketchParams} params
 * @param {ExtrusionMethod} method
 * @returns {SketchParams}
 */
export function withMethod(params, method) {
  if (!EXTRUSION_METHODS.includes(method)) throw new Error(`sketch: unknown extrusion method "${method}"`)
  if (params.extrusion.method === method) return params
  return { ...params, extrusion: { method, ...EXTRUSION_DEFAULTS[method] } }
}

/**
 * Set one numeric extrusion param.
 *
 * @param {SketchParams} params
 * @param {string} key
 * @param {number} value
 * @returns {SketchParams}
 */
export function withExtrusionParam(params, key, value) {
  if (!isFiniteNumber(value)) throw new Error(`sketch: ${key} must be a finite number`)
  return { ...params, extrusion: { ...params.extrusion, [key]: value } }
}

// --- vertex edits (TODO/sketch-002) -----------------------------------------

/**
 * How many points a circle becomes on **Convert to outline**: enough that the ring's area is
 * within 1 % of the circle's (a 32-gon is 0.64 % short), few enough to edit by hand.
 */
export const OUTLINE_CIRCLE_POINTS = 32

/**
 * The polyline a vertex edit acts on, or a thrown reason naming the fix.
 *
 * @param {Profile} profile
 * @returns {PolylineProfile}
 */
function editablePolyline(profile) {
  if (profile.kind !== 'polyline') {
    throw new Error(`sketch: a ${profile.kind === 'rect' ? 'rectangle' : profile.kind} has no free points — Convert to outline first`)
  }
  return profile
}

/** @param {PolylineProfile} profile @param {number} index */
function checkVertexIndex(profile, index) {
  if (!Number.isInteger(index) || index < 0 || index >= profile.pointsMm.length) {
    throw new Error(`sketch: this outline has no point ${index + 1}`)
  }
}

/**
 * Move one point of a polyline.
 *
 * @param {Profile} profile
 * @param {number} index
 * @param {readonly number[]} pointMm
 * @returns {PolylineProfile}
 */
export function moveVertex(profile, index, pointMm) {
  const polyline = editablePolyline(profile)
  checkVertexIndex(polyline, index)
  if (!isVec2([pointMm[0], pointMm[1]])) throw new Error('sketch: a point must be two finite millimetre values')
  const pointsMm = polyline.pointsMm.map((point, at) => /** @type {Vec2Mm} */ (at === index ? [pointMm[0], pointMm[1]] : point))
  return { ...polyline, pointsMm }
}

/**
 * How many segments a polyline has: one per point when closed (the last joins the first),
 * one fewer when open.
 *
 * @param {PolylineProfile} profile
 */
export function segmentCountOf(profile) {
  const count = profile.pointsMm.length
  return profile.closed ? count : Math.max(0, count - 1)
}

/**
 * Insert a point on segment `segmentIndex` (from point `segmentIndex` to the next, wrapping
 * on a closed outline) — at its midpoint unless `pointMm` says where. The new point's index
 * is `segmentIndex + 1`.
 *
 * @param {Profile} profile
 * @param {number} segmentIndex
 * @param {readonly number[]} [pointMm]
 * @returns {PolylineProfile}
 */
export function insertVertex(profile, segmentIndex, pointMm) {
  const polyline = editablePolyline(profile)
  if (polyline.pointsMm.length >= MAX_POLYLINE_POINTS) throw new Error(`sketch: an outline holds at most ${MAX_POLYLINE_POINTS} points`)
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= segmentCountOf(polyline)) {
    throw new Error(`sketch: this outline has no segment ${segmentIndex + 1}`)
  }
  const a = polyline.pointsMm[segmentIndex]
  const b = polyline.pointsMm[(segmentIndex + 1) % polyline.pointsMm.length]
  /** @type {Vec2Mm} */
  const point = pointMm ? [pointMm[0], pointMm[1]] : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  if (!isVec2(point)) throw new Error('sketch: a point must be two finite millimetre values')
  const pointsMm = [...polyline.pointsMm.slice(0, segmentIndex + 1), point, ...polyline.pointsMm.slice(segmentIndex + 1)]
  return { ...polyline, pointsMm }
}

/**
 * Why a point cannot be deleted from this outline, or `null` when one can. The reason is
 * the disabled **Delete point** button's tooltip, word for word.
 *
 * @param {Profile} profile
 * @returns {string | null}
 */
export function deleteVertexProblem(profile) {
  if (profile.kind !== 'polyline') return 'This shape has no free points — tap Convert to outline first'
  if (profile.closed && profile.pointsMm.length <= 3) return 'An outline needs at least 3 points'
  if (!profile.closed && profile.pointsMm.length <= 2) return 'A line needs at least 2 points'
  return null
}

/**
 * Remove one point of a polyline. Refuses (throws the {@link deleteVertexProblem} reason)
 * rather than leave a closed outline with fewer than 3 points or a line with fewer than 2.
 *
 * @param {Profile} profile
 * @param {number} index
 * @returns {PolylineProfile}
 */
export function deleteVertex(profile, index) {
  const problem = deleteVertexProblem(profile)
  if (problem) throw new Error(problem)
  const polyline = /** @type {PolylineProfile} */ (profile)
  checkVertexIndex(polyline, index)
  return { ...polyline, pointsMm: polyline.pointsMm.filter((_, at) => at !== index) }
}

/**
 * **Convert to outline**: the same shape as a closed polyline, so its points can be edited.
 * Keeps the id and role, so the selection, the Hole flag and the draft's order all survive.
 * A rectangle gives its 4 corners, a polygon its corners exactly, a circle
 * {@link OUTLINE_CIRCLE_POINTS} points on its rim — counter-clockwise, like
 * {@link toPointsMm}. A polyline is returned unchanged.
 *
 * @param {Profile} profile
 * @returns {PolylineProfile}
 */
export function convertToOutline(profile) {
  if (profile.kind === 'polyline') return profile
  if (!isClosed(profile)) throw new Error('sketch: this outline encloses nothing — there is nothing to convert')
  return {
    id: profile.id,
    kind: 'polyline',
    role: profile.role,
    closed: true,
    pointsMm: toPointsMm(profile, OUTLINE_CIRCLE_POINTS),
  }
}

// --- drag → profile ----------------------------------------------------------

/**
 * A circle from a drag: press at the centre, release on the rim.
 *
 * @param {string} id
 * @param {Vec2Mm} startMm
 * @param {Vec2Mm} endMm
 * @returns {CircleProfile}
 */
export function circleFromDrag(id, startMm, endMm) {
  return { id, kind: 'circle', role: 'solid', centerMm: [startMm[0], startMm[1]], radiusMm: Math.hypot(endMm[0] - startMm[0], endMm[1] - startMm[1]) }
}

/**
 * A rectangle from a drag: corner to opposite corner, in any direction.
 *
 * @param {string} id
 * @param {Vec2Mm} startMm
 * @param {Vec2Mm} endMm
 * @returns {RectProfile}
 */
export function rectFromDrag(id, startMm, endMm) {
  return {
    id,
    kind: 'rect',
    role: 'solid',
    centerMm: [(startMm[0] + endMm[0]) / 2, (startMm[1] + endMm[1]) / 2],
    widthMm: Math.abs(endMm[0] - startMm[0]),
    heightMm: Math.abs(endMm[1] - startMm[1]),
  }
}

/**
 * A regular polygon from a drag: press at the centre, release on a vertex.
 *
 * @param {string} id
 * @param {Vec2Mm} startMm
 * @param {Vec2Mm} endMm
 * @param {number} sides
 * @returns {PolygonProfile}
 */
export function polygonFromDrag(id, startMm, endMm, sides) {
  return {
    id,
    kind: 'polygon',
    role: 'solid',
    centerMm: [startMm[0], startMm[1]],
    radiusMm: Math.hypot(endMm[0] - startMm[0], endMm[1] - startMm[1]),
    sides: Math.max(3, Math.min(MAX_POLYGON_SIDES, Math.round(sides))),
    rotationDeg: (Math.atan2(endMm[1] - startMm[1], endMm[0] - startMm[0]) * 180) / Math.PI,
  }
}

// --- picking ---------------------------------------------------------------

/** @param {Vec2Mm[]} ring @param {Vec2Mm} point */
function ringContains(ring, point) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** @param {Vec2Mm} p @param {Vec2Mm} a @param {Vec2Mm} b */
function distanceToSegmentMm(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/**
 * Which profile a tap in the sketch plane lands on: a stroke within `toleranceMm`, else the
 * **smallest** closed outline containing the point — so tapping inside the inner of two
 * concentric circles selects the inner one, which is what "tap the smaller circle" means.
 *
 * @param {readonly Profile[]} profiles
 * @param {Vec2Mm} pointMm
 * @param {number} toleranceMm
 * @returns {string | null}
 */
export function profileAtPoint(profiles, pointMm, toleranceMm) {
  let best = null
  let bestDistance = toleranceMm
  let smallest = null
  let smallestArea = Infinity
  for (const profile of profiles) {
    const closed = isClosed(profile)
    const ring = profile.kind === 'polyline' ? dedupe(profile.pointsMm) : toPointsMm(profile, 64)
    const edges = closed ? ring.length : ring.length - 1
    for (let index = 0; index < edges; index += 1) {
      const distance = distanceToSegmentMm(pointMm, ring[index], ring[(index + 1) % ring.length])
      if (distance <= bestDistance) {
        bestDistance = distance
        best = profile.id
      }
    }
    if (closed && ringContains(ring, pointMm)) {
      const area = Math.abs(signedAreaMm2(ring))
      if (area < smallestArea) {
        smallestArea = area
        smallest = profile.id
      }
    }
  }
  return best ?? smallest
}
