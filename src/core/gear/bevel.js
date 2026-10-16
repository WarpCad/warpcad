// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Straight bevel gears — the pitch cone, and the tooth section at the large end
 * (TODO/core-045, `docs/decisions/gears.md` Decision 3: "the bevel loft reuses the slice
 * path").
 *
 * ── The pitch cone ───────────────────────────────────────────────────────────────────
 * Two bevel gears on shafts Σ apart roll on two cones that share an apex and touch along
 * one line. For this gear (`z₁` teeth) and its mate (`z₂`):
 * `tan δ₁ = sin Σ / (z₂/z₁ + cos Σ)`, computed as `atan2` so the crown-gear limit
 * (`z₂/z₁ = −cos Σ`, δ = 90°) is exactly 90° instead of a division by zero. Σ = 90° gives
 * `δ₁ = atan(z₁/z₂)`; equal counts give the 45° **miter** gear `drive-wheel` was faking.
 * The mate's angle is `Σ − δ₁`; {@link pitchConeAngleDeg} is the one function `core-046`
 * calls for both.
 *
 * ── The teeth: Tredgold's approximation ──────────────────────────────────────────────
 * At the large end the teeth lie on the **back cone**, the cone perpendicular to the pitch
 * cone through the pitch circle. Unrolled flat, the back cone is a spur gear of radius
 * `R / cos δ` — the **virtual gear**, `z' = z / cos δ` teeth of the same module — and the
 * real tooth is that gear's tooth, wrapped back onto the cone. Every tooth surface is then
 * a cone through the apex: the section at distance `s` from the apex is the large-end
 * section scaled by `s / L`.
 *
 * So the solid is a **loft of one planar outline toward the apex**, and that outline is
 * the exact section of those cones by the plane through the pitch circle (`z = Z`, the
 * **large-end plane**). A virtual-gear point at radius `ρ` and angle `φ` (about the virtual
 * centre, the back cone's apex) sits on the back cone at radius `ρ cos δ`, height
 * `L / cos δ − ρ sin δ`, angle `φ / cos δ`; projected from the apex onto the plane it lands at
 *
 *     r = ρ L cos³δ / (L − ρ sin δ cos δ),    θ = φ / cos δ.
 *
 * At `ρ = R / cos δ` that is `r = R`: the pitch circle on the large-end plane is `m·z/2`.
 * Arc length on the pitch circle is kept (`R θ = (R / cos δ) φ`), so the tooth thickness
 * there is the virtual gear's, `πm/2 − backlash/2`. One virtual tooth pitch (`2π / z'`)
 * maps onto exactly one of this gear's (`2π / z`), so the outline closes with `z` teeth.
 * As δ → 0 the mapping is the identity and the outline is the spur gear's, vertex for
 * vertex.
 *
 * ── What the planar large end costs ──────────────────────────────────────────────────
 * A real bevel gear's large end is the back cone; this one's is the plane through the pitch
 * circle (so it prints flat on its back). Each tooth's cone carries on to that plane, so in
 * that plane the tip sits on the face cone, `r = Z tan(δ + θₐ)`, a little outside the
 * textbook outside diameter `d + 2 hₐ cos δ` measured on the back cone (27.31 vs 26.10 mm
 * for drive-wheel's 32T miter). Meshing is unaffected: both gears' teeth are cones through
 * the same apex, so they mesh at every distance from it. Near δ + θₐ = 90° the plane meets
 * the face cone further and further out (`tan → ∞`); past {@link MAX_FACE_CONE_ANGLE_DEG}
 * the gear is refused as a crown gear (`'crown-gear'`), which is out of scope (as are
 * spiral, Zerol, hypoid and face gears).
 *
 * ── Axis convention ──────────────────────────────────────────────────────────────────
 * Axis local Z, **apex at the origin**, +Z toward the large end: the large-end plane is
 * `z = Z = L cos δ` and the small end `z = k Z` with `k = (L − F) / L`. Two bevels mesh by
 * making their apexes coincide (`core-046`). Tooth 0 is on +X, as on every gear here.
 *
 * Framework-free: no Vue, DOM, three.js or `@jscad/modeling` — points and numbers only.
 *
 * @module core/gear/bevel
 */

import { ADDENDUM_COEFFICIENT, GearParameterError, virtualGearDimensions } from './dimensions.js'
import { involuteToothTemplate } from './involute.js'

/** @typedef {import('./involute.js').Vec2Mm} Vec2Mm */
/** @typedef {import('./involute.js').GearWarning} GearWarning */
/** @typedef {import('./involute.js').ProfileResolution} ProfileResolution */
/** @typedef {import('./dimensions.js').GearDimensions} GearDimensions */

/** Shafts at right angles unless told otherwise. */
export const DEFAULT_SHAFT_ANGLE_DEG = 90
/** The standard face-width rule: no more than a third of the cone distance. */
export const MAX_FACE_WIDTH_FRACTION = 1 / 3
/** The other half of the standard rule, used for the default: no more than 10 modules. */
export const DEFAULT_FACE_WIDTH_MODULES = 10
/**
 * The steepest face cone (δ + addendum angle) built, degrees. The large-end plane meets the
 * face cone at `Z tan(δ + θₐ)`, which runs to infinity at 90° (a crown gear); at 85° it is
 * already 11.4 × the apex distance.
 */
export const MAX_FACE_CONE_ANGLE_DEG = 85

const DEG = Math.PI / 180

/**
 * Why a bevel gear cannot be built.
 *
 * @typedef {'shaft-angle' | 'pitch-cone-angle' | 'crown-gear' | 'face-width'} BevelGearErrorCode
 */

/** A bevel-specific refusal, with a message safe to show as-is and a code. */
export class BevelGearError extends GearParameterError {
  /**
   * @param {string} message
   * @param {BevelGearErrorCode} code
   */
  constructor(message, code) {
    super(message)
    this.name = 'BevelGearError'
    /** @type {BevelGearErrorCode} */
    this.code = code
  }
}

/** @typedef {'face-width-over-third'} BevelWarning */

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {number} a whole number, 3 or more
 */
function wholeTeeth(value, name) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 3) {
    throw new GearParameterError(`${name} must be a whole number, 3 or more`)
  }
  return value
}

/**
 * The pitch cone half-angle δ₁ of a gear of `teeth` meshing with one of `mateTeeth` on
 * shafts `shaftAngleDeg` apart: `atan2(sin Σ, z₂/z₁ + cos Σ)`. Between 0° and 180°; exactly
 * 90° at the crown-gear limit, above it for an internal bevel (neither is built here).
 *
 * @param {{ teeth: number, mateTeeth: number, shaftAngleDeg?: number }} pair Tooth counts
 *   are any positive finite numbers (the formula needs only their ratio).
 * @returns {number} degrees
 * @throws {BevelGearError} code `'shaft-angle'` unless 0° < Σ < 180°.
 * @throws {GearParameterError} for a non-positive or non-finite tooth count.
 */
export function pitchConeAngleDeg({ teeth, mateTeeth, shaftAngleDeg = DEFAULT_SHAFT_ANGLE_DEG }) {
  for (const [name, value] of /** @type {[string, unknown][]} */ ([['teeth', teeth], ['mateTeeth', mateTeeth]])) {
    if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) {
      throw new GearParameterError(`${name} must be a finite number greater than 0`)
    }
  }
  if (typeof shaftAngleDeg !== 'number' || !Number.isFinite(shaftAngleDeg) || !(shaftAngleDeg > 0 && shaftAngleDeg < 180)) {
    throw new BevelGearError(
      `shaftAngleDeg must be between 0° and 180° (exclusive), got ${String(shaftAngleDeg)} — 0° is two parallel shafts ` +
        `(a spur pair) and 180° two opposed ones`,
      'shaft-angle'
    )
  }
  const sigma = shaftAngleDeg * DEG
  return Math.atan2(Math.sin(sigma), mateTeeth / teeth + Math.cos(sigma)) / DEG
}

/**
 * @typedef {object} BevelConeParams
 * @property {number} teeth Whole, 3 or more.
 * @property {number} moduleMm Module at the large end, mm.
 * @property {number} pitchConeAngleDeg δ, degrees, 0 < δ < 90.
 * @property {number} [pressureAngleDeg=20]
 * @property {number} [clearanceMm] Default `0.25 · moduleMm`, on the virtual gear.
 * @property {number} [backlashMm=0] The pair's total play along the large-end pitch circle.
 */

/**
 * @typedef {object} BevelConeDimensions
 * @property {number} teeth
 * @property {number} moduleMm
 * @property {number} pressureAngleDeg
 * @property {number} clearanceMm Resolved.
 * @property {number} backlashMm
 * @property {number} pitchConeAngleDeg δ.
 * @property {number} pitchRadiusMm `R = m·z/2`, on the large-end plane.
 * @property {number} pitchDiameterMm
 * @property {number} coneDistanceMm `L = R / sin δ`, apex to the large-end pitch circle.
 * @property {number} apexDistanceMm `Z = L cos δ = R / tan δ`: the large-end plane's height
 *   above the apex.
 * @property {number} virtualTeeth `z / cos δ`.
 * @property {GearDimensions} virtual The back-cone virtual gear (`virtualGearDimensions`).
 * @property {number} toothThicknessAtPitchMm The virtual gear's, kept along the large-end pitch circle.
 * @property {number} addendumAngleDeg `atan(hₐ / L)`.
 * @property {number} dedendumAngleDeg `atan(h_f / L)`.
 * @property {number} faceConeAngleDeg `δ + θₐ`: the cone the tooth tips lie on.
 * @property {number} rootConeAngleDeg `δ − θ_f`.
 * @property {number} outsideRadiusMm The nominal tip on the large-end plane, `Z tan(δ + θₐ)`.
 * @property {number} rootRadiusMm The root on the large-end plane, `Z tan(δ − θ_f)`.
 */

/**
 * The cone of one bevel gear, from its own pitch cone angle — everything the large-end
 * section needs, and nothing about the mate or the face width.
 *
 * @param {BevelConeParams} params
 * @returns {BevelConeDimensions}
 * @throws {BevelGearError} `'pitch-cone-angle'` unless 0° < δ < 90°; `'crown-gear'` at δ ≥ 90°
 *   or a face cone at or past {@link MAX_FACE_CONE_ANGLE_DEG}.
 * @throws {GearParameterError} as `gearDimensions` would for the virtual gear.
 */
export function bevelConeDimensions(params) {
  const teeth = wholeTeeth(params.teeth, 'teeth')
  const delta = params.pitchConeAngleDeg
  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    throw new BevelGearError(`pitchConeAngleDeg must be a finite number, got ${String(delta)}`, 'pitch-cone-angle')
  }
  if (delta >= 90) {
    throw new BevelGearError(
      `a pitch cone of ${delta.toFixed(3)}° is a crown gear (90°) or an internal bevel (over 90°) — not built yet`,
      'crown-gear'
    )
  }
  if (!(delta > 0)) {
    throw new BevelGearError(`pitchConeAngleDeg must be more than 0°, got ${delta}`, 'pitch-cone-angle')
  }
  const moduleMm = params.moduleMm
  if (typeof moduleMm !== 'number' || !Number.isFinite(moduleMm) || !(moduleMm > 0)) {
    throw new GearParameterError('moduleMm must be a finite number greater than 0')
  }
  const sinD = Math.sin(delta * DEG)
  const cosD = Math.cos(delta * DEG)
  const pitchRadiusMm = (moduleMm * teeth) / 2
  const coneDistanceMm = pitchRadiusMm / sinD
  const apexDistanceMm = coneDistanceMm * cosD
  // Checked before the virtual gear exists: near 90° its z / cos δ teeth put its pitch circle
  // out where doubles can no longer tell its tip from its root. A bevel has no profile
  // shift, so its addendum is exactly one module.
  const addendumAngleDeg = Math.atan((ADDENDUM_COEFFICIENT * moduleMm) / coneDistanceMm) / DEG
  const faceConeAngleDeg = delta + addendumAngleDeg
  if (faceConeAngleDeg >= MAX_FACE_CONE_ANGLE_DEG) {
    throw new BevelGearError(
      `the tooth tips' cone opens to ${faceConeAngleDeg.toFixed(2)}° (δ ${delta.toFixed(2)}° + addendum ` +
        `${addendumAngleDeg.toFixed(2)}°), at or past ${MAX_FACE_CONE_ANGLE_DEG}° — this is all but a crown gear, ` +
        `and its tips would run out of the large-end plane; use fewer mate teeth or more teeth on this gear`,
      'crown-gear'
    )
  }
  const virtualTeeth = teeth / cosD
  const virtual = virtualGearDimensions({
    teeth: virtualTeeth,
    moduleMm,
    pressureAngleDeg: params.pressureAngleDeg,
    clearanceMm: params.clearanceMm,
    backlashMm: params.backlashMm,
  })
  const dedendumAngleDeg = Math.atan(virtual.dedendumMm / coneDistanceMm) / DEG
  const cone = { coneDistanceMm, sinD, cosD }
  return {
    teeth,
    moduleMm: virtual.moduleMm,
    pressureAngleDeg: virtual.pressureAngleDeg,
    clearanceMm: virtual.clearanceMm,
    backlashMm: virtual.backlashMm,
    pitchConeAngleDeg: delta,
    pitchRadiusMm,
    pitchDiameterMm: 2 * pitchRadiusMm,
    coneDistanceMm,
    apexDistanceMm,
    virtualTeeth,
    virtual,
    toothThicknessAtPitchMm: virtual.toothThicknessAtPitchMm,
    addendumAngleDeg,
    dedendumAngleDeg,
    faceConeAngleDeg,
    rootConeAngleDeg: delta - dedendumAngleDeg,
    outsideRadiusMm: planeRadiusMm(cone, virtual.outsideRadiusMm),
    rootRadiusMm: planeRadiusMm(cone, virtual.rootRadiusMm),
  }
}

/**
 * A virtual-gear radius `ρ`, carried along the back cone and projected from the apex onto
 * the large-end plane: `ρ L cos³δ / (L − ρ sin δ cos δ)` (module doc).
 *
 * @param {{ coneDistanceMm: number, sinD: number, cosD: number }} cone
 * @param {number} rhoMm
 * @returns {number} mm
 */
function planeRadiusMm({ coneDistanceMm: L, sinD, cosD }, rhoMm) {
  return (rhoMm * L * cosD * cosD * cosD) / (L - rhoMm * sinD * cosD)
}

/**
 * @typedef {object} BevelGearParams
 * @property {number} teeth
 * @property {number} mateTeeth The gear this one meshes with (`core-046` builds it).
 * @property {number} moduleMm Module at the large end, mm.
 * @property {number} [shaftAngleDeg=90] Σ, 0 < Σ < 180.
 * @property {number} [faceWidthMm] Along the pitch cone, `0 < F < L`. Default
 *   `min(L/3, 10·m)`; past `L/3` it builds with a warning.
 * @property {number} [pressureAngleDeg=20]
 * @property {number} [clearanceMm]
 * @property {number} [backlashMm=0]
 */

/**
 * @typedef {BevelConeDimensions & {
 *   mateTeeth: number,
 *   shaftAngleDeg: number,
 *   mateConeAngleDeg: number,
 *   faceWidthMm: number,
 *   maxFaceWidthMm: number,
 *   smallEndScale: number,
 *   axialLengthMm: number,
 *   smallEndApexDistanceMm: number,
 *   smallEndRootRadiusMm: number,
 *   warnings: BevelWarning[],
 * }} BevelGearDimensions
 * `maxFaceWidthMm` is the `L/3` rule; `smallEndScale` is `k = (L − F) / L`;
 * `axialLengthMm` is `F cos δ`, the small end sitting at `k Z`; `smallEndRootRadiusMm` is
 * the narrowest root circle along the gear, the most a bore or hub may take.
 */

/**
 * A bevel gear's dimensions from its pair: δ from the mate and shaft angle, then the cone,
 * then the face.
 *
 * @param {BevelGearParams} params
 * @returns {BevelGearDimensions}
 * @throws {BevelGearError} `'shaft-angle'`, `'crown-gear'`, or `'face-width'` for `F ≥ L`.
 * @throws {GearParameterError} for a bad tooth count, module or face width.
 */
export function bevelGearDimensions(params) {
  const teeth = wholeTeeth(params.teeth, 'teeth')
  const mateTeeth = wholeTeeth(params.mateTeeth, 'mateTeeth')
  const shaftAngleDeg = params.shaftAngleDeg ?? DEFAULT_SHAFT_ANGLE_DEG
  const delta = pitchConeAngleDeg({ teeth, mateTeeth, shaftAngleDeg })
  const cone = bevelConeDimensions({ ...params, teeth, pitchConeAngleDeg: delta })
  const L = cone.coneDistanceMm
  const maxFaceWidthMm = L * MAX_FACE_WIDTH_FRACTION
  const given = params.faceWidthMm
  /** @type {number} */
  let faceWidthMm
  if (given === undefined) {
    faceWidthMm = Math.min(maxFaceWidthMm, DEFAULT_FACE_WIDTH_MODULES * cone.moduleMm)
  } else {
    if (typeof given !== 'number' || !Number.isFinite(given) || !(given > 0)) {
      throw new GearParameterError(`faceWidthMm must be a finite number greater than 0, got ${String(given)}`)
    }
    if (given >= L) {
      throw new BevelGearError(
        `faceWidthMm ${given} reaches the apex — the cone distance is ${L.toFixed(3)} mm, and the standard rule is ` +
          `at most a third of it (${maxFaceWidthMm.toFixed(3)} mm)`,
        'face-width'
      )
    }
    faceWidthMm = given
  }
  /** @type {BevelWarning[]} */
  const warnings = []
  // A hair over the rule (the default sits exactly on it) is not worth a warning.
  if (faceWidthMm > maxFaceWidthMm * (1 + 1e-12)) warnings.push('face-width-over-third')
  const smallEndScale = (L - faceWidthMm) / L
  const axialLengthMm = faceWidthMm * Math.cos(delta * DEG)
  return {
    ...cone,
    mateTeeth,
    shaftAngleDeg,
    mateConeAngleDeg: shaftAngleDeg - delta,
    faceWidthMm,
    maxFaceWidthMm,
    smallEndScale,
    axialLengthMm,
    smallEndApexDistanceMm: cone.apexDistanceMm - axialLengthMm,
    smallEndRootRadiusMm: cone.rootRadiusMm * smallEndScale,
    warnings,
  }
}

/**
 * The closest two outline vertices may sit, as a fraction of the large-end tip radius. A
 * steep bevel's virtual gear is nearly a rack (≈ 1900 teeth at δ = 84°, 200T), and its
 * trochoid root fillet then spans a few hundredths of a millimetre, sampled at under a
 * micron — below the weld an STL export (and `openEdgesOf`) applies, `1e-5 ×` the bounding
 * box, which collapses those edges and opens the mesh. `1e-4 ×` the tip radius is about 7×
 * that weld at the large end, and still above it at the small end of any face width within
 * the `L/3` rule; it only ever removes detail far below the design tolerance.
 */
export const MIN_VERTEX_SPACING_FRACTION = 1e-4

/**
 * Which of a mapped tooth template's vertices to keep: every vertex at least `spacingMm`
 * from the last one kept, walking out from the gap centre (vertex 0, always kept) to the tip
 * centre (always kept), and the mirror image of that choice on the other flank — so the tooth
 * stays symmetric, vertex 0 stays mid-gap and the tip centre stays at the middle index.
 *
 * @param {Float64Array} xs
 * @param {Float64Array} ys
 * @param {number} spacingMm
 * @returns {number[]} indices into the template, in order
 */
function thinnedToothIndices(xs, ys, spacingMm) {
  const n = xs.length
  const tip = n / 2
  const far = (/** @type {number} */ a, /** @type {number} */ b) => Math.hypot(xs[a] - xs[b], ys[a] - ys[b]) >= spacingMm
  /** @type {number[]} */
  const half = []
  let last = 0
  for (let i = 1; i < tip; i++) {
    if (far(i, last)) {
      half.push(i)
      last = i
    }
  }
  if (half.length > 0 && !far(tip, last)) half.pop()
  return [0, ...half, tip, ...half.map((i) => n - i).reverse()]
}

/**
 * @typedef {BevelConeDimensions & {
 *   outline: Vec2Mm[],
 *   tipRadiusMm: number,
 *   warnings: GearWarning[],
 *   verticesPerTooth: number,
 *   pointsPerFlank: number,
 *   tipSegments: number,
 *   rootSegments: number,
 * }} BevelProfile
 * `tipRadiusMm` is the outline's real tip on the large-end plane (`outsideRadiusMm`, or a
 * pointed virtual tooth's apex, projected); `warnings` are the virtual gear's.
 */

/**
 * The large-end section of a bevel gear: the virtual gear's tooth, projected onto the
 * plane through the pitch circle, `z` times round. CCW, centred on the origin, tooth 0 on
 * +X, vertex 0 on the root circle at `−180°/z` — the same layout as `involuteProfile`, so a
 * loft sees a fixed vertex correspondence.
 *
 * @param {BevelConeParams & ProfileResolution} params Resolution is the virtual gear's
 *   sampling (`profile.gear` derives it from the document's policy).
 * @returns {BevelProfile}
 * @throws {BevelGearError | GearParameterError} as {@link bevelConeDimensions}.
 */
export function bevelProfile(params) {
  const dims = bevelConeDimensions(params)
  const tooth = involuteToothTemplate(dims.virtual, params)
  const cone = { coneDistanceMm: dims.coneDistanceMm, sinD: Math.sin(dims.pitchConeAngleDeg * DEG), cosD: Math.cos(dims.pitchConeAngleDeg * DEG) }
  // One virtual tooth pitch, 2π/z', becomes one of this gear's, 2π/z.
  const angleScale = dims.virtualTeeth / dims.teeth
  const { radiiMm, anglesRad } = tooth
  const all = radiiMm.length
  const mx = new Float64Array(all)
  const my = new Float64Array(all)
  for (let i = 0; i < all; i++) {
    const r = planeRadiusMm(cone, radiiMm[i])
    const theta = anglesRad[i] * angleScale
    mx[i] = r * Math.cos(theta)
    my[i] = r * Math.sin(theta)
  }
  const kept = thinnedToothIndices(mx, my, MIN_VERTEX_SPACING_FRACTION * dims.outsideRadiusMm)
  const n = kept.length
  const tx = new Float64Array(n)
  const ty = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    tx[i] = mx[kept[i]]
    ty[i] = my[kept[i]]
  }
  const N = dims.teeth
  /** @type {Vec2Mm[]} */
  const outline = new Array(n * N)
  for (let k = 0; k < N; k++) {
    const c = Math.cos((2 * Math.PI * k) / N)
    const s = Math.sin((2 * Math.PI * k) / N)
    for (let i = 0; i < n; i++) {
      outline[k * n + i] = k === 0 ? [tx[i], ty[i]] : [c * tx[i] - s * ty[i], s * tx[i] + c * ty[i]]
    }
  }
  return {
    ...dims,
    outline,
    tipRadiusMm: planeRadiusMm(cone, tooth.tipRadiusMm),
    warnings: tooth.warnings,
    verticesPerTooth: n,
    pointsPerFlank: tooth.pointsPerFlank,
    tipSegments: tooth.tipSegments,
    rootSegments: tooth.rootSegments,
  }
}
