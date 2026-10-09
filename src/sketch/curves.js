// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Curve helpers: a formula in, a sketch outline out (`TODO/sketch-008`).
 *
 * A sketch profile is a circle, rectangle, polygon or polyline. A smooth curved outline (an
 * airfoil, an ellipse, a spline through a few points) is a **polyline** that these helpers
 * sample, carrying a `source` that says which curve and which numbers made it — provenance,
 * not a new profile kind, so the kernel still sees nothing but points (see
 * `src/sketch/profile.js`).
 *
 * Framework-free and kernel-free: plain numbers in, `Vec2Mm[]` out.
 *
 * ## Units and spaces
 *
 * Millimetres in the sketch plane, X then Y; angles in degrees. Every parameter carries its
 * unit in its name (`chordMm`, `radiusXMm`, `startDeg`), and an airfoil's own maths runs in
 * **chord fractions** (`xOverC`) and is scaled to millimetres in exactly one place.
 *
 * ## The airfoil's trailing edge
 *
 * The textbook 4-digit thickness polynomial (last coefficient −0.1015) leaves the trailing
 * edge open: 0.252 % of the thickness ratio, a 0.03 mm sliver on a 120 mm 2412. Fed to the
 * kernel as two separate points it is a face too thin to print, and pinched to one point
 * without changing the curve it folds the last panel. So by default the helper **closes it
 * the standard way** — the modified last coefficient −0.1036, which brings the thickness to
 * exactly zero at x = c — and the outline has a single trailing-edge point. Pass
 * `closedTrailingEdge: false` for the textbook section (two trailing-edge points and a short
 * blunt edge between them).
 *
 * @module sketch/curves
 */

/** @typedef {import('./profile.js').Vec2Mm} Vec2Mm */

/** The most points one curve outline may have — the sketch model's polyline cap. */
export const MAX_CURVE_POINTS = 4096
/** The fewest points an airfoil outline may have: three per surface, plus both edges. */
export const MIN_AIRFOIL_POINTS = 8
/** What the Curve sheet starts at: enough for a smooth 120 mm section, and loftable (≤ 256). */
export const DEFAULT_AIRFOIL_POINTS = 80
export const DEFAULT_ELLIPSE_POINTS = 64
export const DEFAULT_SPLINE_SAMPLES = 8

/** The curves a polyline's `source` may name. */
export const CURVE_KINDS = Object.freeze(/** @type {const} */ (['naca4', 'ellipse', 'spline']))
/** @typedef {typeof CURVE_KINDS[number]} CurveKind */

/**
 * A polyline's provenance: which curve, its numbers, and where in the slice it was placed.
 *
 * @typedef {object} CurveSource
 * @property {CurveKind} curve
 * @property {Record<string, any>} params The curve's own params, as {@link curvePoints} takes them.
 * @property {Vec2Mm} atMm Where the curve's own origin sits in the slice — an airfoil's
 *   leading edge, an ellipse's centre.
 */

/**
 * A curve refused its input. `field` names the parameter, so the Curve sheet can mark that
 * input and the AI tool can say which number was wrong.
 */
export class CurveParamError extends Error {
  /**
   * @param {string} field
   * @param {string} message
   */
  constructor(field, message) {
    super(message)
    this.name = 'CurveParamError'
    /** The parameter that was wrong, e.g. `chordMm`. */
    this.field = field
  }
}

/** @param {unknown} value @returns {value is number} */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * @param {string} where
 * @param {string} field
 * @param {unknown} value
 * @returns {number}
 */
function requirePositive(where, field, value) {
  if (!isFiniteNumber(value) || !(value > 0)) {
    throw new CurveParamError(field, `${where}: ${field} must be a number greater than 0 (got ${JSON.stringify(value)})`)
  }
  return value
}

/**
 * @param {string} where
 * @param {string} field
 * @param {unknown} value
 * @param {number} min
 * @param {number} [max]
 * @returns {number}
 */
function requireCount(where, field, value, min, max = MAX_CURVE_POINTS) {
  if (!(typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max)) {
    throw new CurveParamError(field, `${where}: ${field} must be a whole number from ${min} to ${max} (got ${JSON.stringify(value)})`)
  }
  return value
}

/**
 * @param {string} where
 * @param {string} field
 * @param {unknown} value
 * @returns {Vec2Mm}
 */
function requireVec2(where, field, value) {
  if (!(Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber))) {
    throw new CurveParamError(field, `${where}: ${field} must be two finite millimetre values`)
  }
  return [value[0], value[1]]
}

// --- NACA 4-digit ------------------------------------------------------------

/**
 * @typedef {object} Naca4Section
 * @property {number} maxCamber `m`, as a fraction of chord.
 * @property {number} camberAt `p`, as a fraction of chord.
 * @property {number} thickness `t`, as a fraction of chord.
 */

/**
 * The three numbers a 4-digit code stands for, or a {@link CurveParamError} on `code`.
 *
 * @param {unknown} code e.g. `'2412'`: 2 % camber, at 40 % chord, 12 % thick.
 * @returns {Naca4Section}
 */
export function parseNaca4(code) {
  if (typeof code !== 'string' || !/^\d{4}$/.test(code)) {
    throw new CurveParamError('code', `naca4: code must be four digits, like "2412" (got ${JSON.stringify(code)})`)
  }
  const maxCamber = Number(code[0]) / 100
  const camberAt = Number(code[1]) / 10
  const thickness = Number(code.slice(2)) / 100
  if (thickness <= 0) throw new CurveParamError('code', `naca4: code "${code}" has zero thickness — the last two digits are the thickness in % of chord`)
  if (maxCamber > 0 && camberAt <= 0) {
    throw new CurveParamError('code', `naca4: code "${code}" has camber but no camber position — the second digit is where it peaks, in tenths of chord`)
  }
  return { maxCamber, camberAt, thickness }
}

/**
 * The 4-digit section's ordinates at one chord station, in **chord fractions**: the mean
 * camber line, the half-thickness, and the two surfaces (thickness laid perpendicular to the
 * camber line, as the NACA definition does).
 *
 * @param {string} code
 * @param {number} xOverC Chord station, 0 (leading edge) to 1 (trailing edge).
 * @param {{ closedTrailingEdge?: boolean }} [options]
 * @returns {{ yCamber: number, halfThickness: number, xUpper: number, yUpper: number, xLower: number, yLower: number }}
 */
export function naca4Ordinates(code, xOverC, options = {}) {
  const { maxCamber: m, camberAt: p, thickness: t } = parseNaca4(code)
  const lastCoefficient = options.closedTrailingEdge === false ? -0.1015 : -0.1036
  const x = Math.min(1, Math.max(0, xOverC))
  const halfThickness = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 + lastCoefficient * x ** 4)
  let yCamber = 0
  let slope = 0
  if (m > 0) {
    if (x < p) {
      yCamber = (m / p ** 2) * (2 * p * x - x * x)
      slope = ((2 * m) / p ** 2) * (p - x)
    } else {
      yCamber = (m / (1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x * x)
      slope = ((2 * m) / (1 - p) ** 2) * (p - x)
    }
  }
  const theta = Math.atan(slope)
  return {
    yCamber,
    halfThickness,
    xUpper: x - halfThickness * Math.sin(theta),
    yUpper: yCamber + halfThickness * Math.cos(theta),
    xLower: x + halfThickness * Math.sin(theta),
    yLower: yCamber - halfThickness * Math.cos(theta),
  }
}

/**
 * A NACA 4-digit airfoil as a closed sketch outline.
 *
 * - Leading edge at the sketch origin, chord along **+X**, so the trailing edge is at
 *   `[chordMm, 0]`.
 * - **Point 0 is the trailing edge**; the ring then runs over the upper surface to the leading
 *   edge and back along the lower one — **counter-clockwise**, the winding every sketch outline
 *   and every Loft ring uses.
 * - **Cosine spacing** (x = (1 − cos β)/2): stations crowd the leading edge, where the
 *   curvature is, and the trailing edge, where the two surfaces meet.
 *
 * @param {string} code e.g. `'2412'`.
 * @param {number} chordMm
 * @param {{ points?: number, closedTrailingEdge?: boolean }} [options] `points`: the
 *   outline's whole point count (default {@link DEFAULT_AIRFOIL_POINTS}); `closedTrailingEdge`
 *   (default `true`) — see the module note.
 * @returns {Vec2Mm[]}
 * @throws {CurveParamError}
 */
export function naca4(code, chordMm, options = {}) {
  parseNaca4(code)
  requirePositive('naca4', 'chordMm', chordMm)
  const points = requireCount('naca4', 'points', options.points ?? DEFAULT_AIRFOIL_POINTS, MIN_AIRFOIL_POINTS)
  const closed = options.closedTrailingEdge !== false
  // Point budget: the leading edge, one or two trailing-edge points, and the rest shared
  // between the surfaces — the upper gets the odd one.
  const interior = points - 1 - (closed ? 1 : 2)
  const upperCount = Math.ceil(interior / 2)
  const lowerCount = interior - upperCount
  const opts = { closedTrailingEdge: closed }
  /** @param {number} beta */
  const station = (beta) => (1 - Math.cos(beta)) / 2
  /** @type {Vec2Mm[]} */
  const ring = []
  /** @param {number} x @param {number} y */
  const push = (x, y) => ring.push([x * chordMm, y * chordMm])

  const trailing = naca4Ordinates(code, 1, opts)
  push(trailing.xUpper, closed ? trailing.yCamber : trailing.yUpper)
  // Upper surface, trailing edge → leading edge.
  for (let k = upperCount; k >= 1; k -= 1) {
    const at = naca4Ordinates(code, station((Math.PI * k) / (upperCount + 1)), opts)
    push(at.xUpper, at.yUpper)
  }
  push(0, 0)
  // Lower surface, leading edge → trailing edge.
  for (let k = 1; k <= lowerCount; k += 1) {
    const at = naca4Ordinates(code, station((Math.PI * k) / (lowerCount + 1)), opts)
    push(at.xLower, at.yLower)
  }
  if (!closed) push(trailing.xLower, trailing.yLower)
  return ring
}

// --- ellipse, arc, bezier, catmull-rom ----------------------------------------

/**
 * An ellipse as a closed outline: counter-clockwise, point 0 on +X from the centre.
 *
 * @param {number} radiusXMm
 * @param {number} radiusYMm
 * @param {{ points?: number, centerMm?: Vec2Mm }} [options]
 * @returns {Vec2Mm[]}
 */
export function ellipse(radiusXMm, radiusYMm, options = {}) {
  requirePositive('ellipse', 'radiusXMm', radiusXMm)
  requirePositive('ellipse', 'radiusYMm', radiusYMm)
  const points = requireCount('ellipse', 'points', options.points ?? DEFAULT_ELLIPSE_POINTS, 3)
  const [cx, cy] = requireVec2('ellipse', 'centerMm', options.centerMm ?? [0, 0])
  /** @type {Vec2Mm[]} */
  const ring = []
  for (let index = 0; index < points; index += 1) {
    const angle = (index / points) * Math.PI * 2
    ring.push([cx + radiusXMm * Math.cos(angle), cy + radiusYMm * Math.sin(angle)])
  }
  return ring
}

/**
 * A circular arc as an **open** run of points, both ends included — a piece for building an
 * outline, never an outline by itself.
 *
 * @param {number} radiusMm
 * @param {number} startDeg
 * @param {number} endDeg Counter-clockwise from `startDeg` when larger.
 * @param {{ points?: number, centerMm?: Vec2Mm }} [options]
 * @returns {Vec2Mm[]}
 */
export function arc(radiusMm, startDeg, endDeg, options = {}) {
  requirePositive('arc', 'radiusMm', radiusMm)
  if (!isFiniteNumber(startDeg)) throw new CurveParamError('startDeg', 'arc: startDeg must be a finite number of degrees')
  if (!isFiniteNumber(endDeg)) throw new CurveParamError('endDeg', 'arc: endDeg must be a finite number of degrees')
  const points = requireCount('arc', 'points', options.points ?? 16, 2)
  const [cx, cy] = requireVec2('arc', 'centerMm', options.centerMm ?? [0, 0])
  /** @type {Vec2Mm[]} */
  const run = []
  for (let index = 0; index < points; index += 1) {
    const angle = ((startDeg + ((endDeg - startDeg) * index) / (points - 1)) * Math.PI) / 180
    run.push([cx + radiusMm * Math.cos(angle), cy + radiusMm * Math.sin(angle)])
  }
  return run
}

/**
 * A Bézier curve of any degree through its first and last control points, as an **open** run
 * sampled at even parameter steps (de Casteljau).
 *
 * @param {readonly Vec2Mm[]} controlPointsMm Two or more.
 * @param {{ points?: number }} [options]
 * @returns {Vec2Mm[]}
 */
export function bezier(controlPointsMm, options = {}) {
  if (!Array.isArray(controlPointsMm) || controlPointsMm.length < 2) {
    throw new CurveParamError('controlPointsMm', 'bezier: controlPointsMm needs at least 2 points')
  }
  controlPointsMm.forEach((point) => requireVec2('bezier', 'controlPointsMm', point))
  const points = requireCount('bezier', 'points', options.points ?? 32, 2)
  /** @type {Vec2Mm[]} */
  const run = []
  for (let index = 0; index < points; index += 1) {
    const t = index / (points - 1)
    const work = controlPointsMm.map((point) => [point[0], point[1]])
    for (let level = work.length - 1; level > 0; level -= 1) {
      for (let k = 0; k < level; k += 1) {
        work[k][0] += (work[k + 1][0] - work[k][0]) * t
        work[k][1] += (work[k + 1][1] - work[k][1]) * t
      }
    }
    run.push([work[0][0], work[0][1]])
  }
  return run
}

/**
 * A **centripetal** Catmull-Rom spline through every control point — the parametrization that
 * never loops or cusps between close points, which a hand-placed set of points has.
 *
 * Closed: a ring of `controlPoints × samplesPerSegment` points. Open: the same per segment,
 * plus the last control point (end tangents mirror the neighbouring segment).
 *
 * @param {readonly Vec2Mm[]} controlPointsMm Three or more for a ring, two or more open.
 * @param {{ closed?: boolean, samplesPerSegment?: number }} [options]
 * @returns {Vec2Mm[]}
 */
export function catmullRom(controlPointsMm, options = {}) {
  const closed = options.closed !== false
  const minimum = closed ? 3 : 2
  if (!Array.isArray(controlPointsMm) || controlPointsMm.length < minimum) {
    throw new CurveParamError('controlPointsMm', `catmullRom: controlPointsMm needs at least ${minimum} points`)
  }
  controlPointsMm.forEach((point) => requireVec2('catmullRom', 'controlPointsMm', point))
  const samples = requireCount('catmullRom', 'samplesPerSegment', options.samplesPerSegment ?? DEFAULT_SPLINE_SAMPLES, 1, 256)
  const count = controlPointsMm.length
  const segments = closed ? count : count - 1
  if (segments * samples + (closed ? 0 : 1) > MAX_CURVE_POINTS) {
    throw new CurveParamError('samplesPerSegment', `catmullRom: that is more than ${MAX_CURVE_POINTS} points — use fewer samples per segment`)
  }
  /** @param {number} index */
  const at = (index) => {
    if (closed) return controlPointsMm[((index % count) + count) % count]
    if (index < 0) {
      // Mirror the first point through its neighbour, so the end tangent is the segment's own.
      const [a, b] = [controlPointsMm[0], controlPointsMm[1]]
      return /** @type {Vec2Mm} */ ([2 * a[0] - b[0], 2 * a[1] - b[1]])
    }
    if (index >= count) {
      const [a, b] = [controlPointsMm[count - 1], controlPointsMm[count - 2]]
      return /** @type {Vec2Mm} */ ([2 * a[0] - b[0], 2 * a[1] - b[1]])
    }
    return controlPointsMm[index]
  }
  /** Centripetal knot spacing; a coincident pair gets a tiny step rather than a zero one. */
  const knot = (/** @type {Vec2Mm} */ a, /** @type {Vec2Mm} */ b) => Math.max(1e-9, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])))
  /** @type {Vec2Mm[]} */
  const out = []
  for (let segment = 0; segment < segments; segment += 1) {
    const p0 = at(segment - 1)
    const p1 = at(segment)
    const p2 = at(segment + 1)
    const p3 = at(segment + 2)
    const t1 = knot(p0, p1)
    const t2 = t1 + knot(p1, p2)
    const t3 = t2 + knot(p2, p3)
    for (let step = 0; step < samples; step += 1) {
      if (step === 0) {
        out.push([p1[0], p1[1]])
        continue
      }
      const t = t1 + ((t2 - t1) * step) / samples
      /** @param {number} axis */
      const value = (axis) => {
        const a1 = ((t1 - t) / t1) * p0[axis] + (t / t1) * p1[axis]
        const a2 = ((t2 - t) / (t2 - t1)) * p1[axis] + ((t - t1) / (t2 - t1)) * p2[axis]
        const a3 = ((t3 - t) / (t3 - t2)) * p2[axis] + ((t - t2) / (t3 - t2)) * p3[axis]
        const b1 = ((t2 - t) / t2) * a1 + (t / t2) * a2
        const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3
        return ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2
      }
      out.push([value(0), value(1)])
    }
  }
  if (!closed) {
    const last = controlPointsMm[count - 1]
    out.push([last[0], last[1]])
  }
  return out
}

/**
 * Resample a run of points to `count` points **evenly spaced by arc length**. Point 0 stays
 * put; an open run also keeps its last point.
 *
 * Unlike `src/sketch/resample.js`'s Loft resampler this does **not** keep the original
 * vertices — it is for smoothing a curve's spacing, not for walling a sketch's corners.
 *
 * @param {readonly Vec2Mm[]} pointsMm
 * @param {number} count
 * @param {{ closed?: boolean }} [options] Default closed.
 * @returns {Vec2Mm[]}
 */
export function resampleByArcLength(pointsMm, count, options = {}) {
  const closed = options.closed !== false
  requireCount('resampleByArcLength', 'count', count, closed ? 3 : 2)
  if (!Array.isArray(pointsMm) || pointsMm.length < 2) throw new CurveParamError('pointsMm', 'resampleByArcLength: needs at least 2 points')
  const edges = closed ? pointsMm.length : pointsMm.length - 1
  const lengths = []
  for (let index = 0; index < edges; index += 1) {
    const a = pointsMm[index]
    const b = pointsMm[(index + 1) % pointsMm.length]
    lengths.push(Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (!(total > 1e-12)) throw new CurveParamError('pointsMm', 'resampleByArcLength: the points have no length — they all coincide')
  const step = total / (closed ? count : count - 1)
  /** @type {Vec2Mm[]} */
  const out = []
  let edge = 0
  let walked = 0
  for (let index = 0; index < count; index += 1) {
    const target = index * step
    while (edge < edges - 1 && walked + lengths[edge] < target - 1e-12) {
      walked += lengths[edge]
      edge += 1
    }
    const a = pointsMm[edge]
    const b = pointsMm[(edge + 1) % pointsMm.length]
    const t = lengths[edge] > 0 ? Math.min(1, Math.max(0, (target - walked) / lengths[edge])) : 0
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  if (!closed) {
    const last = pointsMm[pointsMm.length - 1]
    out[count - 1] = [last[0], last[1]]
  }
  return out
}

// --- a polyline's `source` ----------------------------------------------------

/**
 * Sample a {@link CurveSource} into the outline it describes, placed at its `atMm`.
 *
 * - `naca4`: `{ code, chordMm, points?, closedTrailingEdge? }` — leading edge at `atMm`.
 * - `ellipse`: `{ radiusXMm, radiusYMm, points? }` — centred on `atMm`.
 * - `spline`: `{ controlPointsMm, samplesPerSegment? }` — a closed centripetal Catmull-Rom
 *   through the control points, which are relative to `atMm`.
 *
 * @param {CurveSource} source
 * @returns {Vec2Mm[]}
 * @throws {CurveParamError}
 */
export function curvePoints(source) {
  if (source === null || typeof source !== 'object') throw new CurveParamError('source', 'curve: a source must be an object')
  const params = source.params ?? {}
  const [ax, ay] = requireVec2('curve', 'atMm', source.atMm ?? [0, 0])
  /** @type {Vec2Mm[]} */
  let local
  if (source.curve === 'naca4') {
    local = naca4(params.code, params.chordMm, { points: params.points, closedTrailingEdge: params.closedTrailingEdge })
  } else if (source.curve === 'ellipse') {
    local = ellipse(params.radiusXMm, params.radiusYMm, { points: params.points })
  } else if (source.curve === 'spline') {
    local = catmullRom(params.controlPointsMm, { closed: true, samplesPerSegment: params.samplesPerSegment })
  } else {
    throw new CurveParamError('curve', `curve: unknown curve ${JSON.stringify(source.curve)} — one of ${CURVE_KINDS.join(', ')}`)
  }
  if (ax === 0 && ay === 0) return local
  return local.map((point) => /** @type {Vec2Mm} */ ([point[0] + ax, point[1] + ay]))
}

/** @param {number} value */
function formatMm(value) {
  return String(Math.round(value * 100) / 100)
}

/**
 * One line naming a curve for people — the status line, History, and the AI's scene read:
 * `Airfoil NACA 2412 · 120 mm chord`, `Ellipse · 40 × 16 mm`, `Spline · 4 points`.
 *
 * @param {CurveSource} source
 * @returns {string}
 */
export function describeCurve(source) {
  const params = source?.params ?? {}
  if (source?.curve === 'naca4') return `Airfoil NACA ${params.code} · ${formatMm(params.chordMm)} mm chord`
  if (source?.curve === 'ellipse') return `Ellipse · ${formatMm(2 * params.radiusXMm)} × ${formatMm(2 * params.radiusYMm)} mm`
  if (source?.curve === 'spline') return `Spline · ${Array.isArray(params.controlPointsMm) ? params.controlPointsMm.length : 0} points`
  return 'Curve'
}
