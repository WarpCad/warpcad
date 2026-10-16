// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Involute spur-gear outline — the closed 2D tooth profile of an external spur gear
 * (TODO/core-040), per `docs/decisions/gears.md` Decision 1: an **analytic involute plus
 * the rack-generated trochoid root**, written from the published equations (Decision 6;
 * V1 is a measurement oracle only, see `scripts/generate-v1-gear-fixture.cjs`).
 *
 * ── Geometry ─────────────────────────────────────────────────────────────────────────
 * The gear is what a sharp-cornered straight-sided rack (pressure angle α, datum line
 * shifted `x · m` outward, tip line `m + clearance` inside the datum) leaves when rolled
 * on the pitch circle. At every radius `r` the tooth occupies the angular interval
 * `|φ| ≤ ψ(r)` about its centre line, and `ψ(r)` is the tighter of two cuts:
 *
 * - **the involute** the rack's straight flank envelops, from where the flank actually
 *   reaches the line of action (`involuteStartRadiusMm`) to the tip:
 *   `ψ_inv(r) = s / (2R) + inv α − inv α_r`, `inv a = tan a − a`, `cos α_r = r_b / r`;
 * - **the trochoid** the rack's tip corner traces. With the corner at `(u, v)` (along
 *   the rolling line from the tooth-space centre, and from the gear centre) and
 *   `τ = √(r² − v²)`, the corner's angle from the space centre is
 *   `(u ∓ τ) / R ± atan(τ / v)`, the larger of the two branches cutting deeper.
 *
 * Above the form circle the involute wins and the trochoid is the root fillet; below
 * ~17 teeth at 20° the corner dips under the interference point and the trochoid cuts
 * into the involute — **undercut is modelled, never clamped** (call 2), and reported as
 * `warnings: ['undercut']`. Where the two flanks meet below the tip circle the tooth is
 * clipped at that apex (`'pointed-tip'`); where the rack's own flanks meet above its tip
 * line the space comes to a point (`'pointed-root'`). A tooth with no material left
 * throws {@link GearToothVanishedError}; nothing here ever returns NaN or a
 * self-crossing outline.
 *
 * ── Output layout (so `core-042`'s twist and `core-045`'s loft see correspondence) ────
 * Millimetres, centred on the origin, **CCW**. Tooth 0 is centred on +X. Vertex 0 is on
 * the root circle at the centre of the tooth space just clockwise of tooth 0 (angle
 * `−180°/teeth`); vertex `verticesPerTooth / 2` is tooth 0's tip centre on +X. Each tooth
 * is the previous one rotated by `360°/teeth`, vertex for vertex, and has
 * `4 · pointsPerFlank + 2 · rootSegments + 2 · tipSegments` vertices (`rootSegments` /
 * `tipSegments` are reported as 0 for a pointed root / tip, which have no land).
 *
 * ── Helical gears (TODO/core-042) ─────────────────────────────────────────────────────
 * With `helixAngleDeg` the outline is the gear's **transverse** section: `./dimensions.js`
 * supplies the transverse pitch and pressure angle and keeps the depth in the normal
 * module, and this file reads only those dimensions, so it draws the section unchanged.
 * The twist that makes it helical is the extrude's (`./helix.js`).
 *
 * ── Ring gears and racks (TODO/core-043) ─────────────────────────────────────────────
 * {@link involuteHalfAngleFn} is the flank equation alone, and {@link rackHalfWidthMmAt}
 * its straight-line limit. `./internal.js` and `./rack.js` draw from those two and never
 * restate either.
 *
 * Framework-free: no Vue, DOM, three.js or `@jscad/modeling` — it returns points; the
 * kernel adapter turns them into a `geom2`.
 *
 * @module core/gear/involute
 */

import { GearParameterError, GearToothVanishedError, gearDimensions } from './dimensions.js'

/** @typedef {[number, number]} Vec2Mm A point in the gear's plane, millimetres. */
/** @typedef {import('./dimensions.js').GearParams} GearParams */
/** @typedef {import('./dimensions.js').GearDimensions} GearDimensions */
/** @typedef {'undercut' | 'pointed-tip' | 'pointed-root'} GearWarning */

/**
 * @typedef {object} ProfileResolution
 * @property {number} [pointsPerFlank=8] Vertices per involute and per trochoid, each side
 *   (Decision 4's legacy fixed 8; `profile.gear` derives it from the document's policy).
 * @property {number} [tipSegments=2] Segments across each half of the tip land.
 * @property {number} [rootSegments=2] Segments across each half of the root land.
 */

/**
 * @typedef {GearDimensions & {
 *   outline: Vec2Mm[],
 *   tipRadiusMm: number,
 *   warnings: GearWarning[],
 *   verticesPerTooth: number,
 *   pointsPerFlank: number,
 *   tipSegments: number,
 *   rootSegments: number,
 *   involuteEndRadiusMm: number,
 * }} InvoluteProfile
 * `tipRadiusMm` is the outline's real tip: `outsideRadiusMm`, or the apex of a pointed
 * tooth. `involuteEndRadiusMm` is where the trochoid hands over to the involute (the form
 * circle, or the undercut crossing).
 */

const SCAN_SAMPLES = 256
const BISECT_ITERATIONS = 64

/** @param {number} a Radians. */
const inv = (a) => Math.tan(a) - a

/**
 * What the involute flank needs: the circles and the tooth's thickness along the pitch
 * circle. A {@link GearDimensions} is one; so is an internal gear's tooth *space*
 * (`./internal.js`), which is an external tooth of the space width.
 *
 * @typedef {Pick<GearDimensions, 'pitchRadiusMm' | 'baseRadiusMm' | 'toothThicknessAtPitchMm' | 'transversePressureAngleDeg'>} InvoluteFlankDims
 */

/**
 * The **one** flank equation every gear kind uses (TODO/core-043: the ring and the rack
 * must not re-implement it): the half-angle, about the tooth's centre line, of an involute
 * flank of the given pitch-circle thickness, `ψ(r) = s / (2R) + inv α − inv α_r`,
 * `cos α_r = r_b / r`. Defined for `r ≥ r_b`; inside the base circle it returns the
 * base-circle value (the involute does not exist there).
 *
 * @param {InvoluteFlankDims} dims
 * @returns {(radiusMm: number) => number} radians
 */
export function involuteHalfAngleFn(dims) {
  const rb = dims.baseRadiusMm
  const involuteConstRad = dims.toothThicknessAtPitchMm / (2 * dims.pitchRadiusMm) + inv((dims.transversePressureAngleDeg * Math.PI) / 180)
  return (radiusMm) => involuteConstRad - inv(Math.acos(Math.min(1, rb / radiusMm)))
}

/**
 * {@link involuteHalfAngleFn} at one radius.
 *
 * @param {InvoluteFlankDims} dims
 * @param {number} radiusMm
 * @returns {number} radians
 */
export function involuteHalfAngleRadAt(dims, radiusMm) {
  return involuteHalfAngleFn(dims)(radiusMm)
}

/**
 * The involute's straight-line limit — a rack tooth (TODO/core-043). As the tooth count
 * grows without bound the pitch circle becomes the pitch line and every involute becomes a
 * straight flank at the pressure angle, so the half-width of the tooth at height `y` above
 * the pitch line is `s / 2 − y · tan α`. Zero or negative means no material at that height.
 *
 * @param {Pick<GearDimensions, 'toothThicknessAtPitchMm' | 'transversePressureAngleDeg'>} dims
 * @param {number} heightMm Above the pitch line (negative below it).
 * @returns {number} mm
 */
export function rackHalfWidthMmAt(dims, heightMm) {
  return dims.toothThicknessAtPitchMm / 2 - heightMm * Math.tan((dims.transversePressureAngleDeg * Math.PI) / 180)
}

/**
 * The half-tooth angle as a function of radius, for one set of dimensions.
 *
 * @param {GearDimensions} dims
 * @returns {(radiusMm: number) => number} radians
 */
function halfAngleFn(dims) {
  const N = dims.teeth
  const R = dims.pitchRadiusMm
  const rb = dims.baseRadiusMm
  const u = dims.rackCornerTangentialMm
  const v = dims.rackCornerRadialMm
  const rGen = Math.max(dims.involuteStartRadiusMm, rb)
  const halfPitchRad = Math.PI / N
  const involute = involuteHalfAngleFn(dims)
  return (radiusMm) => {
    const tau = Math.sqrt(Math.max(0, radiusMm * radiusMm - v * v))
    const lean = Math.atan2(tau, v)
    const spaceRad = Math.max((u - tau) / R + lean, (u + tau) / R - lean)
    let psi = halfPitchRad - spaceRad
    if (radiusMm >= rGen) {
      const psiInv = involute(radiusMm)
      if (psiInv < psi) psi = psiInv
    }
    return psi
  }
}

/**
 * The tooth's half-angle at `radiusMm`: the tooth spans `±` this about its centre line.
 * Zero or negative means no material at that radius. Exposed so the mesh math and specs
 * can read the exact boundary the outline is sampled from.
 *
 * @param {GearDimensions} dims From {@link gearDimensions} (an {@link InvoluteProfile} is one).
 * @param {number} radiusMm
 * @returns {number} radians
 */
export function toothHalfAngleRadAt(dims, radiusMm) {
  return halfAngleFn(dims)(radiusMm)
}

/**
 * @param {(r: number) => number} f
 * @param {number} lo f(lo) and f(hi) have opposite signs (`f(lo) > 0`).
 * @param {number} hi
 */
function bisectToZero(f, lo, hi) {
  for (let i = 0; i < BISECT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @param {string} name
 */
function count(value, fallback, name) {
  const n = value ?? fallback
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
    throw new GearParameterError(`${name} must be a whole number, 1 or more`)
  }
  return n
}

/**
 * The closed outline of an external involute spur gear, and its derived dimensions.
 *
 * Backlash and clearance are lengths in mm: `backlashMm` (the pair's total play) thins
 * this tooth by `backlashMm / 2` along the pitch circle, positive = thinner;
 * `clearanceMm` deepens the root beyond one module, positive = deeper (default
 * `0.25 · moduleMm`).
 *
 * @param {GearParams & ProfileResolution} params
 * @returns {InvoluteProfile}
 * @throws {GearParameterError} for parameters that cannot make a gear.
 * @throws {GearToothVanishedError} when no tooth material is left.
 */
export function involuteProfile(params) {
  const dims = gearDimensions(params)
  const tooth = involuteToothTemplate(dims, params)
  const N = dims.teeth
  const halfPitchRad = Math.PI / N
  const { radiiMm, anglesRad } = tooth
  const n = radiiMm.length
  const tx = new Float64Array(n)
  const ty = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    tx[i] = radiiMm[i] * Math.cos(anglesRad[i])
    ty[i] = radiiMm[i] * Math.sin(anglesRad[i])
  }
  /** @type {Vec2Mm[]} */
  const outline = new Array(n * N)
  for (let k = 0; k < N; k++) {
    const c = Math.cos(2 * halfPitchRad * k)
    const s = Math.sin(2 * halfPitchRad * k)
    for (let i = 0; i < n; i++) {
      outline[k * n + i] = k === 0 ? [tx[i], ty[i]] : [c * tx[i] - s * ty[i], s * tx[i] + c * ty[i]]
    }
  }

  return {
    ...dims,
    outline,
    tipRadiusMm: tooth.tipRadiusMm,
    warnings: tooth.warnings,
    verticesPerTooth: n,
    pointsPerFlank: tooth.pointsPerFlank,
    tipSegments: tooth.tipSegments,
    rootSegments: tooth.rootSegments,
    involuteEndRadiusMm: tooth.involuteEndRadiusMm,
  }
}

/**
 * One tooth of the outline, in polar form about the gear centre: what {@link involuteProfile}
 * rotates into `teeth` copies. Vertex 0 is on the root circle at the middle of the gap
 * before the tooth (angle `−π / teeth`), the tooth is centred on angle 0, and the run stops
 * one vertex short of the next gap's middle.
 *
 * Exposed for the bevel gear (TODO/core-045): its teeth are the back-cone **virtual** gear's,
 * whose tooth count `z / cos δ` is rarely whole, so it samples this template from
 * {@link import('./dimensions.js').virtualGearDimensions} and maps it onto its own pitch
 * circle instead of building `z / cos δ` copies.
 *
 * @param {GearDimensions} dims From `gearDimensions` or `virtualGearDimensions`.
 * @param {ProfileResolution} [resolution]
 * @returns {{ radiiMm: number[], anglesRad: number[], tipRadiusMm: number, warnings: GearWarning[],
 *   pointsPerFlank: number, tipSegments: number, rootSegments: number, involuteEndRadiusMm: number }}
 * @throws {GearToothVanishedError} when no tooth material is left.
 */
export function involuteToothTemplate(dims, resolution = {}) {
  const P = count(resolution.pointsPerFlank, 8, 'pointsPerFlank')
  let T = count(resolution.tipSegments, 2, 'tipSegments')
  let S = count(resolution.rootSegments, 2, 'rootSegments')

  const N = dims.teeth
  const halfPitchRad = Math.PI / N
  const psi = halfAngleFn(dims)
  const rRoot = dims.rootRadiusMm
  const rOutside = dims.outsideRadiusMm
  const scaleMm = dims.moduleMm

  /** @type {GearWarning[]} */
  const warnings = []
  if (dims.undercut) warnings.push('undercut')
  if (dims.pointedRoot) warnings.push('pointed-root')

  // ── Tip: the outside circle, or the apex where the flanks meet below it. ──
  const psiFoot = psi(rRoot)
  if (!(psiFoot > 0)) {
    throw new GearToothVanishedError('the tooth space is wider than the pitch at the root — no tooth is left')
  }
  let rTip = rOutside
  let pointedTip = false
  let prevR = rRoot
  for (let i = 1; i <= SCAN_SAMPLES; i++) {
    const r = rRoot + ((rOutside - rRoot) * i) / SCAN_SAMPLES
    if (!(psi(r) > 0)) {
      rTip = bisectToZero(psi, prevR, r)
      pointedTip = true
      for (let j = i + 1; j <= SCAN_SAMPLES; j++) {
        if (psi(rRoot + ((rOutside - rRoot) * j) / SCAN_SAMPLES) > 0) {
          throw new GearToothVanishedError('undercut severs the tooth from its root — raise profileShift or teeth')
        }
      }
      break
    }
    prevR = r
  }
  if (pointedTip && rTip <= rRoot + 1e-9 * scaleMm) {
    throw new GearToothVanishedError('no tooth is left above the root circle')
  }
  if (pointedTip) {
    warnings.push('pointed-tip')
    T = 0
  }
  if (dims.pointedRoot) S = 0

  // ── Junction: where the trochoid hands over to the involute. ──
  const rb = dims.baseRadiusMm
  const v = dims.rackCornerRadialMm
  const rGen = Math.max(dims.involuteStartRadiusMm, rb)
  let rJoin = rGen
  if (dims.undercut) {
    // The corner's trochoid cuts the involute: find where the involute takes over.
    const R = dims.pitchRadiusMm
    const u = dims.rackCornerTangentialMm
    const psiTro = (/** @type {number} */ r) => {
      const tau = Math.sqrt(Math.max(0, r * r - v * v))
      const lean = Math.atan2(tau, v)
      return halfPitchRad - Math.max((u - tau) / R + lean, (u + tau) / R - lean)
    }
    const psiInv = involuteHalfAngleFn(dims)
    // gap(r) > 0 while the trochoid is the tighter cut.
    const gap = (/** @type {number} */ r) => psiInv(r) - psiTro(r)
    rJoin = rTip
    let lo = rGen
    if (gap(lo) <= 0) rJoin = lo
    else {
      for (let i = 1; i <= SCAN_SAMPLES; i++) {
        const r = rGen + ((rTip - rGen) * i) / SCAN_SAMPLES
        if (gap(r) <= 0) {
          rJoin = bisectToZero(gap, lo, r)
          break
        }
        lo = r
      }
    }
  }
  // Sampling split only — the boundary itself always comes from psi(r). Keep both
  // pieces non-degenerate so no two vertices coincide.
  const minPieceMm = 1e-6 * scaleMm
  if (!(rJoin < rTip - minPieceMm) || !(rJoin > rRoot + minPieceMm)) {
    rJoin = Math.sqrt(v * v + (rTip * rTip - v * v) / 4)
  }

  // ── One half-tooth, CW side, from the space centre out to (not incl.) the tooth centre. ──
  /** @type {number[]} */ const halfR = []
  /** @type {number[]} */ const halfPsi = []
  for (let k = 1; k <= S; k++) {
    halfR.push(rRoot)
    halfPsi.push(halfPitchRad - ((halfPitchRad - psiFoot) * k) / S)
  }
  const tauJoin = Math.sqrt(Math.max(0, rJoin * rJoin - v * v))
  for (let k = 1; k <= P; k++) {
    const tau = (tauJoin * k) / P
    const r = Math.sqrt(v * v + tau * tau)
    halfR.push(r)
    halfPsi.push(psi(r))
  }
  const rollJoin = Math.sqrt(Math.max(0, (rJoin / rb) ** 2 - 1))
  const rollTip = Math.sqrt(Math.max(0, (rTip / rb) ** 2 - 1))
  const involutePoints = pointedTip ? P - 1 : P
  for (let k = 1; k <= involutePoints; k++) {
    const roll = rollJoin + ((rollTip - rollJoin) * k) / P
    const r = k === P ? rTip : rb * Math.sqrt(1 + roll * roll)
    halfR.push(r)
    halfPsi.push(psi(r))
  }
  const psiTip = pointedTip ? 0 : psi(rTip)
  for (let k = 1; k < T; k++) {
    halfR.push(rTip)
    halfPsi.push(psiTip * (1 - k / T))
  }

  // ── Tooth template (polar, tooth centred on angle 0). ──
  /** @type {number[]} */ const radiiMm = [rRoot, ...halfR, rTip]
  /** @type {number[]} */ const anglesRad = [-halfPitchRad, ...halfPsi.map((p) => -p), 0]
  for (let i = halfR.length - 1; i >= 0; i--) {
    radiiMm.push(halfR[i])
    anglesRad.push(halfPsi[i])
  }

  return {
    radiiMm,
    anglesRad,
    tipRadiusMm: rTip,
    warnings,
    pointsPerFlank: P,
    tipSegments: T,
    rootSegments: S,
    involuteEndRadiusMm: rJoin,
  }
}
