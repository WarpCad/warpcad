// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Internal (ring) gear — derived dimensions, the interference readout, and the toothed
 * inner boundary (TODO/core-043, `docs/decisions/gears.md` call 7).
 *
 * ── The construction: the external involute with tip and root swapped ─────────────────
 * A ring gear's tooth **space** is an external involute tooth of the same module, pressure
 * angle and tooth count, whose pitch-circle thickness is the ring's space width
 * (`circularPitch − ringToothThickness`). The ring's addendum points inward — its tip
 * (inner) circle is `R − m` — and its dedendum outward with the standard clearance — its
 * root circle is `R + m + c` (call 5's `c`, default `0.25 m`). So the boundary at every
 * radius comes from `./involute.js`'s one flank equation ({@link involuteHalfAngleFn}),
 * applied to the space; nothing here restates it. There is **no `connectedGear` and no
 * per-pinion cutter sweep** (Decision 5 defect 10): a ring is defined by its own params and
 * meshes with any external gear of the same module and pressure angle.
 *
 * Unlike the external gear there is no trochoid: the space is a pure involute from the tip
 * circle to the root circle. The ring's tooth tip is a plain land, which is what a pinion's
 * root clears by `c`; the root land is what its tip clears by `c`.
 *
 * - **Backlash** thins the ring tooth by `backlashMm / 2` along the pitch circle, exactly as
 *   on an external gear (call 4).
 * - **A tip inside the base circle** (fewer than `2 / (1 − cos α)` teeth, ≈ 33 at 20°): the
 *   involute does not exist there, so the tip is truncated at the base circle and reported
 *   as `'tip-truncated'`. Measured: such rings still mesh, without overlap, with
 *   rack-generated pinions (core-043's sweep: 20T…30T rings with a 14T pinion).
 * - **Pointed teeth or spaces** are clipped at the flank intersection and reported
 *   (`'pointed-tip'`, `'pointed-root'`), as `./involute.js` does; no tooth at all throws
 *   {@link GearToothVanishedError}.
 * - **Helical** rings read `moduleMm` / `pressureAngleDeg` as the normal values and draw
 *   the transverse section, through `./dimensions.js`, as `core-042` set out. On parallel
 *   axes an internal pair has the **same** hand (an external pair has opposite hands).
 *
 * ── Which pinions fit: the interference readout ───────────────────────────────────────
 * The binding limit on an internal pair is the pinion's tip striking the ring's tips as it
 * leaves mesh (**trochoid interference**). This uses KHK's published condition (KHK,
 * *Gear Technical Reference*, internal gear interference), in the transverse plane:
 *
 *   θ₁ · z₁ / z₂ + inv α − inv α_a2 ≥ θ₂, where
 *   θ₁ = acos((r_a2² − r_a1² − a²) / (2 a r_a1)) + inv α_a1 − inv α,
 *   θ₂ = acos((a² + r_a2² − r_a1²) / (2 a r_a2)),
 *
 * `a = R₂ − R₁` the centre distance, `r_a1 = R₁ + m` the pinion's tip (no profile shift),
 * `r_a2` this ring's tip, `cos α_aᵢ = r_bᵢ / r_aᵢ`. Checked against boolean overlap of the
 * built pair (core-043's scratch sweep, 12-48 angles, 5°-35°): wherever it holds, the pair
 * never interpenetrated; it is slightly conservative (64T/56T at 20° fails it by 5e-5 rad
 * and measured clear). At 20° it allows `z₂ − z₁ ≥ 9` on a 64T ring — the TODO's "≥ 8 or so".
 * {@link ringGearDimensions} reports the largest pinion that passes as `maxPinionTeeth`,
 * and refuses a ring no pinion passes for ({@link GearMeshError} `'no-pinion-fits'`: below
 * 7 teeth at 20°, 18 at 5°). {@link checkRingPinion} applies it to one pinion.
 *
 * KHK's other internal-pair limit, **involute interference** (`z₁ / z₂ ≥ 1 − tan α_a2 / tan α`),
 * is *not* applied: it assumes a pinion flank that is a true involute down to the base
 * circle, and a rack-generated pinion is undercut exactly where it would bite. Measured:
 * the user's own 64T ring with a 14T pinion fails it (it asks for 20T) and has zero overlap.
 * Trimming interference (assembling the pinion radially) does not apply to a part slid in
 * along its axis, so it is not checked either.
 *
 * ── Output layout ─────────────────────────────────────────────────────────────────────
 * Millimetres, centred on the origin. {@link internalProfile}'s `outline` is the **hole**
 * — the toothed inner boundary — listed **CCW** (positive area); the kernel adds the rim
 * circle and lists the hole CW as the annulus's inner contour. Ring tooth 0 is centred on
 * +X; vertex 0 is on the root circle at the centre of the space just clockwise of it
 * (angle `−180°/teeth`), vertex `verticesPerTooth / 2` is tooth 0's tip centre on +X, and
 * each tooth is the previous one turned `360°/teeth`, vertex for vertex — the same layout
 * as `./involute.js`, so the twist sees a fixed correspondence.
 *
 * Framework-free and kernel-free: no Vue, no DOM, no three.js, no `@jscad/modeling`.
 *
 * @module core/gear/internal
 */

import { GearParameterError, GearToothVanishedError, defaultClearanceMm, gearDimensions } from './dimensions.js'
import { involuteHalfAngleFn } from './involute.js'
import { GEAR_LIMITS } from './limits.js'

/** V1's ring rim was always `4 · addendum` (Decision 5 defect 11); now the default. */
export const DEFAULT_RIM_MODULES = 4

const BISECT_ITERATIONS = 64

/** @param {number} a Radians. */
const inv = (a) => Math.tan(a) - a

/** @typedef {[number, number]} Vec2Mm */
/** @typedef {'ring-not-larger' | 'no-pinion-fits'} GearMeshErrorCode */
/** @typedef {'tip-truncated' | 'pointed-tip' | 'pointed-root'} RingWarning */
/** @typedef {'tip-interference'} RingPinionWarning */

/** A ring and pinion that cannot mesh, with a message safe to show as-is. */
export class GearMeshError extends GearParameterError {
  /**
   * @param {string} message
   * @param {GearMeshErrorCode} code
   */
  constructor(message, code) {
    super(message)
    this.name = 'GearMeshError'
    /** @type {GearMeshErrorCode} */
    this.code = code
  }
}

/**
 * @typedef {object} RingGearParams
 * @property {number} teeth Integer ≥ 3.
 * @property {number} moduleMm Module, mm (> 0) — the normal module on a helical ring.
 * @property {number} [pressureAngleDeg=20] Degrees, 0…45.
 * @property {number} [clearanceMm] Root depth beyond one module, mm, at the ring's root.
 *   Default `0.25 · moduleMm`.
 * @property {number} [backlashMm=0] Total circumferential play of the pair, mm; thins the
 *   ring tooth by half of it along the pitch circle.
 * @property {number} [helixAngleDeg=0] Degrees, 0…60 (the registry caps it at 45).
 * @property {number} [rimThicknessMm] Material outside the root circle, mm (> 0). Default
 *   `4 · moduleMm`.
 */

/**
 * @typedef {object} RingGearDimensions
 * @property {'internal'} kind
 * @property {number} teeth
 * @property {number} moduleMm
 * @property {number} pressureAngleDeg
 * @property {number} helixAngleDeg
 * @property {number} transverseModuleMm
 * @property {number} transversePressureAngleDeg
 * @property {number} clearanceMm Resolved (default applied).
 * @property {number} backlashMm
 * @property {number} circularPitchMm
 * @property {number} pitchDiameterMm
 * @property {number} pitchRadiusMm
 * @property {number} baseDiameterMm
 * @property {number} baseRadiusMm
 * @property {number} addendumMm Inward from the pitch circle: one (normal) module.
 * @property {number} dedendumMm Outward from the pitch circle: `module + clearance`.
 * @property {number} toothThicknessAtPitchMm The ring tooth, along the pitch circle:
 *   `circularPitch / 2 − backlash / 2`.
 * @property {number} spaceWidthAtPitchMm The space between ring teeth, along the pitch
 *   circle: `circularPitch − toothThicknessAtPitchMm`.
 * @property {number} toothAngleDeg `360 / teeth`.
 * @property {number} tipRadiusMm The ring's tip (inner) circle as built: `R − m`, or the base
 *   circle when that is larger, or the apex of a pointed tooth.
 * @property {number} rootRadiusMm The ring's root circle as built: `R + m + c`, or the apex
 *   of a pointed space.
 * @property {number} rimThicknessMm Resolved (default applied).
 * @property {number} rimOuterRadiusMm `rootRadiusMm + rimThicknessMm`.
 * @property {number} rimOuterDiameterMm
 * @property {boolean} tipTruncated `R − m` is inside the base circle, so the tip is the base circle.
 * @property {boolean} pointedTip
 * @property {boolean} pointedRoot
 * @property {number} maxPinionTeeth The largest pinion (same module and pressure angle, no
 *   profile shift) that clears the trochoid-interference condition.
 * @property {number} minToothDifference `teeth − maxPinionTeeth`.
 */

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 */
function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GearParameterError(`${name} must be a finite number`)
  }
  return value
}

/**
 * @param {(r: number) => number} f Increasing; `f(lo) < 0 < f(hi)` or the reverse sign pattern is handled by the caller.
 * @param {number} lo
 * @param {number} hi
 */
function bisectIncreasing(f, lo, hi) {
  for (let i = 0; i < BISECT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) < 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * The trochoid-interference margin for a pinion of `pinionTeeth` in a ring with tip radius
 * `ringTipRadiusMm` — KHK's condition, left side minus right side (module doc). Negative
 * means the pinion's tip strikes the ring's tips as it leaves mesh.
 *
 * @param {Pick<RingGearDimensions, 'teeth' | 'moduleMm' | 'transverseModuleMm' | 'transversePressureAngleDeg' | 'pitchRadiusMm' | 'baseRadiusMm' | 'tipRadiusMm'>} ring
 * @param {number} pinionTeeth
 * @returns {number} radians
 */
function interferenceMarginRad(ring, pinionTeeth) {
  const alphaRad = (ring.transversePressureAngleDeg * Math.PI) / 180
  const R2 = ring.pitchRadiusMm
  const R1 = (ring.transverseModuleMm * pinionTeeth) / 2
  const rb1 = R1 * Math.cos(alphaRad)
  const rb2 = ring.baseRadiusMm
  const ra1 = R1 + ring.moduleMm
  const ra2 = ring.tipRadiusMm
  const a = R2 - R1
  const clamp = (/** @type {number} */ x) => Math.max(-1, Math.min(1, x))
  const alphaA1 = Math.acos(Math.min(1, rb1 / ra1))
  const alphaA2 = Math.acos(Math.min(1, rb2 / ra2))
  const theta1 = Math.acos(clamp((ra2 * ra2 - ra1 * ra1 - a * a) / (2 * a * ra1))) + inv(alphaA1) - inv(alphaRad)
  const theta2 = Math.acos(clamp((a * a + ra2 * ra2 - ra1 * ra1) / (2 * a * ra2)))
  return (theta1 * pinionTeeth) / ring.teeth + inv(alphaRad) - inv(alphaA2) - theta2
}

/**
 * The half-angle, about a ring tooth's centre line, that the ring tooth spans at
 * `radiusMm`: `π / teeth` minus the space's involute half-angle. Exposed so the kernel's
 * sampling and the specs read the exact boundary the outline is drawn from.
 *
 * @param {Pick<RingGearDimensions, 'teeth' | 'pitchRadiusMm' | 'baseRadiusMm' | 'spaceWidthAtPitchMm' | 'transversePressureAngleDeg'>} dims
 * @param {number} radiusMm
 * @returns {number} radians
 */
export function ringToothHalfAngleRadAt(dims, radiusMm) {
  return Math.PI / dims.teeth - spaceHalfAngleFn(dims)(radiusMm)
}

/**
 * @param {Pick<RingGearDimensions, 'pitchRadiusMm' | 'baseRadiusMm' | 'spaceWidthAtPitchMm' | 'transversePressureAngleDeg'>} dims
 * @returns {(radiusMm: number) => number}
 */
function spaceHalfAngleFn(dims) {
  return involuteHalfAngleFn({
    pitchRadiusMm: dims.pitchRadiusMm,
    baseRadiusMm: dims.baseRadiusMm,
    toothThicknessAtPitchMm: dims.spaceWidthAtPitchMm,
    transversePressureAngleDeg: dims.transversePressureAngleDeg,
  })
}

/**
 * Derived dimensions of an internal (ring) gear, and the largest pinion that meshes with it.
 *
 * @param {RingGearParams} params
 * @returns {RingGearDimensions}
 * @throws {GearParameterError} for parameters that cannot make a ring.
 * @throws {GearToothVanishedError} when no ring tooth (or no space) is left.
 * @throws {GearMeshError} `'no-pinion-fits'` when no pinion of 3 teeth or more clears it.
 */
export function ringGearDimensions(params) {
  const moduleMm = finite(params.moduleMm, 'moduleMm')
  if (!(moduleMm > 0)) throw new GearParameterError('moduleMm must be greater than 0')
  const clearanceMm = finite(params.clearanceMm ?? defaultClearanceMm(moduleMm), 'clearanceMm')
  const rimThicknessMm = finite(params.rimThicknessMm ?? DEFAULT_RIM_MODULES * moduleMm, 'rimThicknessMm')
  if (!(rimThicknessMm > 0)) throw new GearParameterError('rimThicknessMm must be greater than 0 — a ring needs a rim')
  // The circles, the tooth thickness and every check on teeth, module, angles and backlash
  // are the external gear's. Its clearance only sets *its* root, which a ring does not
  // have, so it is passed as 0 and this gear's own clearance is applied to the ring root below.
  const base = gearDimensions({
    teeth: params.teeth,
    moduleMm,
    pressureAngleDeg: params.pressureAngleDeg,
    clearanceMm: 0,
    backlashMm: params.backlashMm,
    helixAngleDeg: params.helixAngleDeg,
  })
  const N = base.teeth
  const R = base.pitchRadiusMm
  const rb = base.baseRadiusMm
  const halfPitchRad = Math.PI / N
  const spaceWidthAtPitchMm = base.circularPitchMm - base.toothThicknessAtPitchMm

  const dims = {
    pitchRadiusMm: R,
    baseRadiusMm: rb,
    spaceWidthAtPitchMm,
    transversePressureAngleDeg: base.transversePressureAngleDeg,
  }
  const space = spaceHalfAngleFn(dims)
  /** The ring tooth's half-angle; increasing with radius. */
  const tooth = (/** @type {number} */ r) => halfPitchRad - space(r)

  const nominalTipMm = R - moduleMm
  const tipTruncated = nominalTipMm < rb
  let tipRadiusMm = tipTruncated ? rb : nominalTipMm
  let rootRadiusMm = R + moduleMm + clearanceMm
  if (!(rootRadiusMm > tipRadiusMm)) {
    throw new GearToothVanishedError('the root circle is inside the tip circle — raise clearanceMm')
  }
  if (!(tooth(rootRadiusMm) > 0)) {
    throw new GearToothVanishedError('the ring tooth has no width even at its root — reduce backlashMm')
  }
  if (!(space(tipRadiusMm) > 0)) {
    throw new GearToothVanishedError('the space between ring teeth closes even at the tip — increase backlashMm')
  }
  const pointedTip = !(tooth(tipRadiusMm) > 0)
  if (pointedTip) tipRadiusMm = bisectIncreasing(tooth, tipRadiusMm, rootRadiusMm)
  const pointedRoot = !(space(rootRadiusMm) > 0)
  if (pointedRoot) rootRadiusMm = bisectIncreasing((r) => -space(r), tipRadiusMm, rootRadiusMm)

  /** @type {Omit<RingGearDimensions, 'maxPinionTeeth' | 'minToothDifference'>} */
  const ring = {
    kind: 'internal',
    teeth: N,
    moduleMm,
    pressureAngleDeg: base.pressureAngleDeg,
    helixAngleDeg: base.helixAngleDeg,
    transverseModuleMm: base.transverseModuleMm,
    transversePressureAngleDeg: base.transversePressureAngleDeg,
    clearanceMm,
    backlashMm: base.backlashMm,
    circularPitchMm: base.circularPitchMm,
    pitchDiameterMm: base.pitchDiameterMm,
    pitchRadiusMm: R,
    baseDiameterMm: base.baseDiameterMm,
    baseRadiusMm: rb,
    addendumMm: moduleMm,
    dedendumMm: moduleMm + clearanceMm,
    toothThicknessAtPitchMm: base.toothThicknessAtPitchMm,
    spaceWidthAtPitchMm,
    toothAngleDeg: base.toothAngleDeg,
    tipRadiusMm,
    rootRadiusMm,
    rimThicknessMm,
    rimOuterRadiusMm: rootRadiusMm + rimThicknessMm,
    rimOuterDiameterMm: 2 * (rootRadiusMm + rimThicknessMm),
    tipTruncated,
    pointedTip,
    pointedRoot,
  }

  let maxPinionTeeth = 0
  for (let z = N - 1; z >= GEAR_LIMITS.teeth.min; z--) {
    if (interferenceMarginRad(ring, z) >= 0) {
      maxPinionTeeth = z
      break
    }
  }
  if (maxPinionTeeth === 0) {
    throw new GearMeshError(
      `a ${N}-tooth ring at ${base.pressureAngleDeg}° meshes with no pinion of ${GEAR_LIMITS.teeth.min} teeth or more ` +
        `without the pinion's tips striking its teeth — add teeth or raise pressureAngleDeg`,
      'no-pinion-fits'
    )
  }
  return { ...ring, maxPinionTeeth, minToothDifference: N - maxPinionTeeth }
}

/**
 * Whether a pinion of `pinionTeeth` (same module and pressure angle, no profile shift) can
 * mesh with this ring. A pinion no smaller than the ring is refused by name; one that fails
 * the interference condition is a warning, since a hand-relieved print can still run.
 *
 * @param {RingGearDimensions} ring From {@link ringGearDimensions}.
 * @param {number} pinionTeeth Integer ≥ 3.
 * @returns {{ clearanceRad: number, warnings: RingPinionWarning[] }} `clearanceRad` is the
 *   interference margin (module doc); negative means the tips collide.
 * @throws {GearMeshError} `'ring-not-larger'`.
 * @throws {GearParameterError} for a malformed tooth count.
 */
export function checkRingPinion(ring, pinionTeeth) {
  if (typeof pinionTeeth !== 'number' || !Number.isInteger(pinionTeeth) || pinionTeeth < GEAR_LIMITS.teeth.min) {
    throw new GearParameterError(`pinionTeeth must be a whole number, ${GEAR_LIMITS.teeth.min} or more, got ${String(pinionTeeth)}`)
  }
  if (pinionTeeth >= ring.teeth) {
    throw new GearMeshError(
      `a ${pinionTeeth}-tooth pinion cannot run inside a ${ring.teeth}-tooth ring — the ring needs more teeth than its pinion`,
      'ring-not-larger'
    )
  }
  const clearanceRad = interferenceMarginRad(ring, pinionTeeth)
  return { clearanceRad, warnings: clearanceRad < 0 ? ['tip-interference'] : [] }
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
 * @typedef {RingGearDimensions & {
 *   outline: Vec2Mm[],
 *   warnings: RingWarning[],
 *   verticesPerTooth: number,
 *   pointsPerFlank: number,
 *   tipSegments: number,
 *   rootSegments: number,
 * }} InternalProfile
 */

/**
 * The toothed inner boundary of a ring gear (the hole, CCW), and its dimensions. Sampling
 * follows `./involute.js`'s `ProfileResolution`: points per flank (evenly in roll angle),
 * segments across each half of the tip and root lands.
 *
 * @param {RingGearParams & import('./involute.js').ProfileResolution} params
 * @returns {InternalProfile}
 * @throws {GearParameterError} as {@link ringGearDimensions}.
 */
export function internalProfile(params) {
  const dims = ringGearDimensions(params)
  const P = count(params.pointsPerFlank, 8, 'pointsPerFlank')
  const T = dims.pointedTip ? 0 : count(params.tipSegments, 2, 'tipSegments')
  const S = dims.pointedRoot ? 0 : count(params.rootSegments, 2, 'rootSegments')

  const N = dims.teeth
  const halfPitchRad = Math.PI / N
  const space = spaceHalfAngleFn(dims)
  const tooth = (/** @type {number} */ r) => halfPitchRad - space(r)
  const rTip = dims.tipRadiusMm
  const rRoot = dims.rootRadiusMm
  const rb = dims.baseRadiusMm

  /** @type {RingWarning[]} */
  const warnings = []
  if (dims.tipTruncated) warnings.push('tip-truncated')
  if (dims.pointedTip) warnings.push('pointed-tip')
  if (dims.pointedRoot) warnings.push('pointed-root')

  // ── One half-tooth, CW side: from the space centre on the root circle, along the root
  // land, down the flank to the tip, across half the tip land — not incl. the tooth centre. ──
  /** @type {number[]} */ const halfR = []
  /** @type {number[]} */ const halfAngle = []
  const toothAtRoot = tooth(rRoot)
  for (let k = 1; k <= S; k++) {
    halfR.push(rRoot)
    halfAngle.push(-(halfPitchRad - ((halfPitchRad - toothAtRoot) * k) / S))
  }
  const rollAt = (/** @type {number} */ r) => Math.sqrt(Math.max(0, (r / rb) ** 2 - 1))
  const rollRoot = rollAt(rRoot)
  const rollTip = rollAt(rTip)
  const flankPoints = dims.pointedTip ? P - 1 : P
  for (let k = 1; k <= flankPoints; k++) {
    const roll = rollRoot + ((rollTip - rollRoot) * k) / P
    const r = k === P ? rTip : rb * Math.sqrt(1 + roll * roll)
    halfR.push(r)
    halfAngle.push(-tooth(r))
  }
  const toothAtTip = dims.pointedTip ? 0 : tooth(rTip)
  for (let k = 1; k < T; k++) {
    halfR.push(rTip)
    halfAngle.push(-toothAtTip * (1 - k / T))
  }

  // ── Tooth template (polar, ring tooth centred on angle 0), then N turned copies. ──
  /** @type {number[]} */ const toothR = [rRoot, ...halfR, rTip]
  /** @type {number[]} */ const toothAngle = [-halfPitchRad, ...halfAngle, 0]
  for (let i = halfR.length - 1; i >= 0; i--) {
    toothR.push(halfR[i])
    toothAngle.push(-halfAngle[i])
  }
  const n = toothR.length
  /** @type {Vec2Mm[]} */
  const outline = new Array(n * N)
  for (let k = 0; k < N; k++) {
    const turn = 2 * halfPitchRad * k
    for (let i = 0; i < n; i++) {
      const a = toothAngle[i] + turn
      outline[k * n + i] = k === 0 ? [toothR[i] * Math.cos(toothAngle[i]), toothR[i] * Math.sin(toothAngle[i])] : [toothR[i] * Math.cos(a), toothR[i] * Math.sin(a)]
    }
  }

  return { ...dims, outline, warnings, verticesPerTooth: n, pointsPerFlank: P, tipSegments: T, rootSegments: S }
}
