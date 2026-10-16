// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Gear meshing — centre distance, phase, ratio and the reasons a pair will not mesh
 * (TODO/core-044, `docs/decisions/gears.md`).
 *
 * V1's `GearSet` was the only reason two V1 gears meshed: it put gear 2 at
 * `pitchRadius₁ + pitchRadius₂` and turned it `180 + 180/z₂`. That knowledge lives here
 * once, so the ready-made `gear.pair` recipe and the interactive *Mesh* operation
 * (`ui-058`) cannot disagree. Everything is computed **from params**, never by measuring
 * built geometry (`docs/decisions/composite-recipe-geometry.md`: a recipe expands against an
 * empty fold) — `ui-058` reads each gear's params from its document record.
 *
 * ## Vocabulary
 *
 * A {@link MeshGear} is a gear's canonical params (`teeth`, `moduleMm`, `pressureAngleDeg`,
 * `profileShift`, `clearanceMm`, `backlashMm`, `helixAngleDeg`, `handedness`, `herringbone`,
 * `thicknessMm`; `rimThicknessMm` on a ring, `heightMm` on a rack — the names
 * `gear.spur` / `gear.ring` / `gear.rack` store, not the TODO's `module`), plus `kind`
 * (`'external'` default, `'internal'`, `'rack'`) and an optional {@link MeshFrame}. On a
 * helical gear `moduleMm` and `pressureAngleDeg` are the **normal** values (core-042), so
 * every distance here is on the transverse pitch circles `./dimensions.js` computes.
 * Aliases are the recipe's business (`./aliases.js`); a caller holding an alias-spelled
 * record resolves it first.
 *
 * ## Frames
 *
 * A gear's {@link MeshFrame} is where it is now: its centre (world mm), the pitch plane its
 * faces lie in, and how far it has turned about its own axis from its as-built layout. The
 * pitch plane fixes a right-handed basis `u, v, n` ({@link PITCH_PLANE_BASIS}, `n` the axis),
 * the same rotation `gear.pair` uses to stand a pair up. `phaseDeg` is measured CCW about `n`
 * from `u`, so a gear at phase 0 has tooth 0 on `+u`; a rack at phase 0 runs along `+u` with
 * its teeth pointing `+v`. {@link meshPlacement} keeps gear 1 where it is and returns gear 2's
 * new centre and phase **and the delta** to get there; gear 2 keeps its axial position.
 *
 * ## The half-tooth rule, generalised
 *
 * **Precondition**: tooth 0 of an external gear and of a ring is centred on local +X
 * (`./involute.js`, `./internal.js` output layout), and rack tooth `i` sits at
 * `x = (i + ½ − teeth/2) · p` (`./rack.js`). Every formula below assumes it; `mesh.spec.js`
 * asserts it against the generators. Each gear's position in its own tooth pitch, as seen
 * from the pitch point `P` on the line of centres, is `u = (ψ − φ) · z / 360` (ψ the bearing
 * of `P` from the gear's centre, φ its phase). Rolling leaves one combination of the two
 * unchanged, and at rest one gear has a tooth on `P` while the other has a space:
 *
 * | Pair | Invariant | Meshes when |
 * |---|---|---|
 * | external – external | `u₁ + u₂` | `≡ ½` |
 * | ring – pinion (same bearing ψ) | `u_ring − u_pinion` | `≡ ½` |
 * | rack – pinion (`u_rack` = slide / p) | `u_pinion − u_rack` | `≡ ½` |
 *
 * With gear 1 at rest and gear 2 on `+u` this is V1's `180 + 180/z₂` (mod one tooth). A
 * profile shift keeps each tooth symmetric about its centre line, so it moves the centre
 * distance, never the phase. A **helical** gear's section turns with height, so the rule is
 * applied at one station along the axis inside both face widths, each gear's phase
 * corrected by its own twist there; on parallel axes with opposite hands (internal: the same
 * hand) the two twists roll together, so meshing at one station is meshing everywhere.
 *
 * ## Centre distance
 *
 * `R₁ + R₂` (external), `R_ring − R_pinion` (internal), `R_pinion + x·m` (rack), on the
 * transverse pitch circles. With a profile shift the pair runs at the working pressure angle
 * `inv α_w = inv α_t + 2 tan α_n · Σx / Σz` (internal: `Δx / Δz`, the ring unshifted), at
 * `a = a₀ · cos α_t / cos α_w`: the distance at which the shifted teeth meet with exactly the
 * backlash their own `backlashMm` thinned them by (call 4). Backlash therefore does not move
 * the shafts; `extraBacklashMm` spreads them (`Δa = j / (2 tan α_w)`) for play beyond that.
 *
 * Framework-free and kernel-free: no Vue, no DOM, no three.js, no `@jscad/modeling`.
 *
 * @module core/gear/mesh
 */

import { GearParameterError, gearDimensions } from './dimensions.js'
import { helixTwistRad } from './helix.js'
import { GearMeshError, checkRingPinion, ringGearDimensions } from './internal.js'
import { GEAR_LIMITS, RACK_LIMITS, RING_LIMITS, checkGearLimits } from './limits.js'
import { DEFAULT_RACK_TEETH, rackDimensions } from './rack.js'

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
/** Below this, two lengths (mm) or angles (degrees) are the same. */
const EPS = 1e-9
const BISECT_ITERATIONS = 64

/** @param {number} a Radians. */
const inv = (a) => Math.tan(a) - a

/** @typedef {[number, number, number]} Vec3Mm */
/** @typedef {'external' | 'internal' | 'rack'} GearKind */
/** @typedef {'xy' | 'xz' | 'yz'} PitchPlane */
/** @typedef {'parallel' | 'crossed'} MeshAxes */

/**
 * Why a pair will not mesh — or, as a `'warning'`, why it may not run cleanly.
 *
 * @typedef {'two-rings' | 'two-racks' | 'ring-and-rack' | 'module-mismatch'
 *   | 'pressure-angle-mismatch' | 'helix-angle-mismatch' | 'helix-hand-same'
 *   | 'helix-hand-opposite' | 'herringbone-mismatch' | 'herringbone-apex-offset'
 *   | 'axes-not-parallel' | 'ring-not-larger' | 'tip-interference'
 *   | 'pinion-shift-not-checked' | 'tip-clearance' | 'no-face-overlap'
 *   | 'shift-too-negative' | 'rack-pair'} MeshReasonCode
 */

/**
 * @typedef {object} MeshReason
 * @property {MeshReasonCode} code
 * @property {string} message One sentence, safe to show the user as-is.
 * @property {'error' | 'warning'} severity `'error'`: the pair will not mesh.
 *   `'warning'`: it can be built and may need hand fitting.
 */

/**
 * @typedef {object} MeshFrame
 * @property {Vec3Mm} centerMm The gear's centre (a rack's: the middle of its pitch line), world mm.
 * @property {PitchPlane} [pitchPlane='xy'] The plane its faces lie in ({@link PITCH_PLANE_BASIS}).
 * @property {number} [phaseDeg=0] Its turn about its own axis from the as-built layout,
 *   degrees, CCW about `n`. A rack's is the direction it runs in.
 */

/**
 * @typedef {object} MeshGear
 * @property {GearKind} [kind='external']
 * @property {number} [teeth] Required except on a rack (default 10).
 * @property {number} moduleMm The (normal) module, mm.
 * @property {number} [pressureAngleDeg=20]
 * @property {number} [profileShift=0] External gears only.
 * @property {number} [clearanceMm]
 * @property {number} [backlashMm=0]
 * @property {number} [helixAngleDeg=0] Not on a rack.
 * @property {'right' | 'left'} [handedness='right']
 * @property {boolean} [herringbone=false]
 * @property {number} [thicknessMm] The face width, mm. Needed to mesh helical gears whose
 *   faces are not level with each other.
 * @property {number} [rimThicknessMm] A ring's rim.
 * @property {number} [heightMm] A rack's backing bar.
 * @property {MeshFrame} [frame] Where the gear is now; the origin, in XY, at phase 0 if omitted.
 */

/**
 * @typedef {object} MeshPlacement
 * @property {Vec3Mm} centerMm Where gear 2's centre goes, world mm.
 * @property {number} phaseDeg Gear 2's phase there: its current phase plus `rotateDeg`.
 * @property {Vec3Mm} translateMm The move from gear 2's current centre.
 * @property {number} rotateDeg The turn about gear 2's own axis (through its new centre),
 *   the smallest one: within half a tooth. Always 0 for a rack, which slides instead.
 * @property {number} centerDistanceMm
 * @property {number | null} ratio {@link gearRatio}; `null` for a rack pair.
 * @property {PitchPlane} pitchPlane
 */

/**
 * @typedef {object} ResolvedGear
 * @property {string} label
 * @property {GearKind} kind
 * @property {number} teeth
 * @property {number} moduleMm
 * @property {number} pressureAngleDeg
 * @property {number} transversePressureAngleDeg
 * @property {number} helixAngleDeg
 * @property {'right' | 'left'} handedness
 * @property {boolean} herringbone
 * @property {number} profileShift
 * @property {number | undefined} thicknessMm
 * @property {number} pitchRadiusMm Transverse; `Infinity` on a rack.
 * @property {number} circularPitchMm
 * @property {number} tipMm External: outside radius. Ring: tip (inner) radius. Rack: tip y.
 * @property {number} rootMm External / ring: root radius. Rack: root y (negative).
 * @property {import('./internal.js').RingGearDimensions | undefined} ring
 * @property {Required<MeshFrame> | undefined} frame
 */

/** The pitch planes a pair can stand in. */
export const PITCH_PLANES = Object.freeze(/** @type {const} */ (['xy', 'xz', 'yz']))

const KINDS = Object.freeze(/** @type {const} */ (['external', 'internal', 'rack']))

/**
 * Each pitch plane's right-handed basis — `u` (phase 0, and where gear 2 goes when it sits
 * on gear 1's axis), `v`, and the axis `n = u × v` — and the `transform.rotate` angles that
 * turn a gear built in XY (axis +Z, tooth 0 on +X) into it: local X → `u`, Y → `v`, Z → `n`.
 *
 * @type {Readonly<Record<PitchPlane, Readonly<{ u: readonly number[], v: readonly number[], n: readonly number[], rotateDeg: readonly number[] }>>>}
 */
export const PITCH_PLANE_BASIS = Object.freeze({
  xy: Object.freeze({ u: Object.freeze([1, 0, 0]), v: Object.freeze([0, 1, 0]), n: Object.freeze([0, 0, 1]), rotateDeg: Object.freeze([0, 0, 0]) }),
  xz: Object.freeze({ u: Object.freeze([1, 0, 0]), v: Object.freeze([0, 0, 1]), n: Object.freeze([0, -1, 0]), rotateDeg: Object.freeze([90, 0, 0]) }),
  yz: Object.freeze({ u: Object.freeze([0, 1, 0]), v: Object.freeze([0, 0, 1]), n: Object.freeze([1, 0, 0]), rotateDeg: Object.freeze([90, 0, 90]) }),
})

/** Codes that make a pair's centre distance and phase meaningless. */
const BLOCKING = new Set(
  /** @type {MeshReasonCode[]} */ ([
    'two-rings',
    'two-racks',
    'ring-and-rack',
    'module-mismatch',
    'pressure-angle-mismatch',
    'helix-angle-mismatch',
    'axes-not-parallel',
    'ring-not-larger',
  ])
)

/**
 * @param {number} x
 * @returns {string} At most four decimals, no trailing zeros.
 */
const fmt = (x) => String(Number(x.toFixed(4)))

/**
 * @param {MeshReasonCode} code
 * @param {string} message
 * @param {'error' | 'warning'} [severity='error']
 * @returns {MeshReason}
 */
const reason = (code, message, severity = 'error') => Object.freeze({ code, message, severity })

/**
 * Prefix a gear-core error with which gear it is about, keeping its class, code and param.
 *
 * @param {unknown} error
 * @param {string} label
 * @returns {unknown}
 */
function about(error, label) {
  if (error instanceof GearParameterError && !error.message.startsWith(`${label}: `)) {
    error.message = `${label}: ${error.message}`
  }
  return error
}

/**
 * @param {unknown} frame
 * @param {string} label
 * @returns {Required<MeshFrame> | undefined}
 */
function resolveFrame(frame, label) {
  if (frame === undefined) return undefined
  if (frame === null || typeof frame !== 'object' || Array.isArray(frame)) {
    throw new GearParameterError(`${label}: frame must be an object with a centerMm`)
  }
  const f = /** @type {Record<string, unknown>} */ (frame)
  const c = f.centerMm
  if (!Array.isArray(c) || c.length !== 3 || !c.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new GearParameterError(`${label}: frame.centerMm must be three finite millimetre values, got ${JSON.stringify(c)}`)
  }
  const pitchPlane = f.pitchPlane ?? 'xy'
  if (!PITCH_PLANES.includes(/** @type {any} */ (pitchPlane))) {
    throw new GearParameterError(`${label}: frame.pitchPlane must be ${PITCH_PLANES.map((p) => `'${p}'`).join(', ')}, got ${String(pitchPlane)}`)
  }
  const phaseDeg = f.phaseDeg ?? 0
  if (typeof phaseDeg !== 'number' || !Number.isFinite(phaseDeg)) {
    throw new GearParameterError(`${label}: frame.phaseDeg must be a finite number of degrees, got ${String(phaseDeg)}`)
  }
  return { centerMm: /** @type {Vec3Mm} */ ([c[0], c[1], c[2]]), pitchPlane: /** @type {PitchPlane} */ (pitchPlane), phaseDeg }
}

/**
 * Check one gear's params (hostile input first: `./limits.js`, before any arithmetic) and
 * derive what meshing needs from `./dimensions.js`, `./internal.js` or `./rack.js`.
 *
 * @param {unknown} gear
 * @param {string} label `'gear 1'` / `'gear 2'`, prefixed to every message.
 * @returns {ResolvedGear}
 */
function resolveGear(gear, label) {
  if (gear === null || typeof gear !== 'object' || Array.isArray(gear)) {
    throw new GearParameterError(`${label}: a gear must be an object of params`)
  }
  const g = /** @type {Record<string, unknown>} */ (gear)
  const kind = /** @type {GearKind} */ (g.kind ?? 'external')
  if (!KINDS.includes(kind)) {
    throw new GearParameterError(`${label}: kind must be ${KINDS.map((k) => `'${k}'`).join(', ')}, got ${String(kind)}`)
  }
  const limits = kind === 'internal' ? RING_LIMITS : kind === 'rack' ? RACK_LIMITS : GEAR_LIMITS
  checkGearLimits(g, { op: label, required: kind === 'rack' ? ['moduleMm'] : ['teeth', 'moduleMm'], limits })
  if (kind !== 'external' && g.profileShift !== undefined && g.profileShift !== 0) {
    throw new GearParameterError(`${label}: a ${kind === 'rack' ? 'rack' : 'ring gear'} has no profileShift`)
  }
  if (kind === 'rack' && g.helixAngleDeg !== undefined && g.helixAngleDeg !== 0) {
    throw new GearParameterError(`${label}: a rack has straight teeth — it has no helixAngleDeg`)
  }
  const frame = resolveFrame(g.frame, label)
  const thicknessMm = /** @type {number | undefined} */ (g.thicknessMm)
  const handedness = /** @type {'right' | 'left'} */ (g.handedness ?? 'right')
  const herringbone = g.herringbone === true
  const common = { label, kind, handedness, herringbone, thicknessMm, frame }

  try {
    if (kind === 'internal') {
      const ring = ringGearDimensions(/** @type {any} */ (g))
      return {
        ...common,
        teeth: ring.teeth,
        moduleMm: ring.moduleMm,
        pressureAngleDeg: ring.pressureAngleDeg,
        transversePressureAngleDeg: ring.transversePressureAngleDeg,
        helixAngleDeg: ring.helixAngleDeg,
        profileShift: 0,
        pitchRadiusMm: ring.pitchRadiusMm,
        circularPitchMm: ring.circularPitchMm,
        tipMm: ring.tipRadiusMm,
        rootMm: ring.rootRadiusMm,
        ring,
      }
    }
    if (kind === 'rack') {
      const rack = rackDimensions(/** @type {any} */ ({ ...g, teeth: g.teeth ?? DEFAULT_RACK_TEETH }))
      return {
        ...common,
        teeth: rack.teeth,
        moduleMm: rack.moduleMm,
        pressureAngleDeg: rack.pressureAngleDeg,
        transversePressureAngleDeg: rack.transversePressureAngleDeg,
        helixAngleDeg: 0,
        profileShift: 0,
        pitchRadiusMm: Number.POSITIVE_INFINITY,
        circularPitchMm: rack.circularPitchMm,
        tipMm: rack.tipYMm,
        rootMm: rack.rootYMm,
        ring: undefined,
      }
    }
    const dims = gearDimensions(/** @type {any} */ (g))
    return {
      ...common,
      teeth: dims.teeth,
      moduleMm: dims.moduleMm,
      pressureAngleDeg: dims.pressureAngleDeg,
      transversePressureAngleDeg: dims.transversePressureAngleDeg,
      helixAngleDeg: dims.helixAngleDeg,
      profileShift: dims.profileShift,
      pitchRadiusMm: dims.pitchRadiusMm,
      circularPitchMm: dims.circularPitchMm,
      tipMm: dims.outsideRadiusMm,
      rootMm: dims.rootRadiusMm,
      ring: undefined,
    }
  } catch (error) {
    throw about(error, label)
  }
}

/**
 * @param {unknown} options
 * @returns {{ extraBacklashMm: number, axes: MeshAxes | undefined }}
 */
function resolveOptions(options) {
  const o = /** @type {Record<string, unknown>} */ (options ?? {})
  const extra = o.extraBacklashMm ?? 0
  if (typeof extra !== 'number' || !Number.isFinite(extra) || extra < 0) {
    throw new GearParameterError(`extraBacklashMm must be a finite number, 0 or more, got ${String(extra)}`)
  }
  const axes = o.axes
  if (axes !== undefined && axes !== 'parallel' && axes !== 'crossed') {
    throw new GearParameterError(`axes must be 'parallel' or 'crossed', got ${String(axes)}`)
  }
  return { extraBacklashMm: extra, axes: /** @type {MeshAxes | undefined} */ (axes) }
}

/**
 * Crossed when asked, or when both frames are given in different pitch planes.
 *
 * @param {ResolvedGear} A
 * @param {ResolvedGear} B
 * @param {MeshAxes | undefined} axes
 */
function isCrossed(A, B, axes) {
  if (axes !== undefined) return axes === 'crossed'
  return A.frame !== undefined && B.frame !== undefined && A.frame.pitchPlane !== B.frame.pitchPlane
}

/**
 * @param {ResolvedGear} A
 * @param {ResolvedGear} B
 * @returns {MeshReason | undefined}
 */
function kindReason(A, B) {
  if (A.kind === 'internal' && B.kind === 'internal') {
    return reason('two-rings', 'Two ring gears cannot mesh — a ring gear needs an external gear (a pinion) running inside it.')
  }
  if (A.kind === 'rack' && B.kind === 'rack') {
    return reason('two-racks', 'Two racks cannot mesh — a rack needs a round gear (a pinion) rolling along it.')
  }
  if (A.kind !== 'external' && B.kind !== 'external') {
    return reason('ring-and-rack', 'A ring gear and a rack cannot mesh — each needs an external gear (a pinion).')
  }
  return undefined
}

/**
 * Module and pressure angle: what every pair shares.
 *
 * @param {ResolvedGear} A
 * @param {ResolvedGear} B
 * @returns {MeshReason[]}
 */
function profileReasons(A, B) {
  /** @type {MeshReason[]} */
  const out = []
  if (Math.abs(A.moduleMm - B.moduleMm) > EPS * Math.max(1, A.moduleMm, B.moduleMm)) {
    out.push(reason('module-mismatch', `Module ${fmt(A.moduleMm)} mm and ${fmt(B.moduleMm)} mm differ — gears only mesh with the same module.`))
  }
  if (Math.abs(A.pressureAngleDeg - B.pressureAngleDeg) > EPS) {
    out.push(
      reason(
        'pressure-angle-mismatch',
        `Pressure angles ${fmt(A.pressureAngleDeg)}° and ${fmt(B.pressureAngleDeg)}° differ — gears only mesh at the same pressure angle.`
      )
    )
  }
  return out
}

/**
 * Helix angle, hand and herringbone, for the axis arrangement.
 *
 * @param {ResolvedGear} A
 * @param {ResolvedGear} B
 * @param {boolean} crossed
 * @returns {MeshReason[]}
 */
function helixReasons(A, B, crossed) {
  /** @type {MeshReason[]} */
  const out = []
  const rack = A.kind === 'rack' ? A : B.kind === 'rack' ? B : undefined
  if (crossed) {
    if (A.kind !== 'external' || B.kind !== 'external') {
      out.push(reason('axes-not-parallel', `A ${rack ? 'rack' : 'ring gear'} only meshes with a pinion on a parallel axis.`))
      return out
    }
    if (A.helixAngleDeg === 0 || B.helixAngleDeg === 0 || Math.abs(A.helixAngleDeg + B.helixAngleDeg - 90) > EPS) {
      out.push(
        reason(
          'helix-angle-mismatch',
          `Gears on crossed axes need helix angles that add up to the 90° between the shafts — these are ${fmt(A.helixAngleDeg)}° and ${fmt(B.helixAngleDeg)}°.`
        )
      )
    }
    if (A.helixAngleDeg > 0 && B.helixAngleDeg > 0 && A.handedness !== B.handedness) {
      out.push(reason('helix-hand-opposite', 'Helical gears on crossed axes need the same hand — one is right-hand and the other left-hand.'))
    }
    if (A.herringbone || B.herringbone) {
      out.push(reason('herringbone-mismatch', 'A herringbone gear only meshes with another herringbone on a parallel axis.'))
    }
    return out
  }
  if (rack) {
    const pinion = rack === A ? B : A
    if (pinion.helixAngleDeg !== 0) {
      out.push(
        reason('helix-angle-mismatch', `A rack has straight teeth, so its pinion must be a spur gear — this one has a ${fmt(pinion.helixAngleDeg)}° helix.`)
      )
    }
    return out
  }
  if (Math.abs(A.helixAngleDeg - B.helixAngleDeg) > EPS) {
    out.push(
      reason(
        'helix-angle-mismatch',
        `Helix angles ${fmt(A.helixAngleDeg)}° and ${fmt(B.helixAngleDeg)}° differ — gears on parallel shafts only mesh at the same helix angle.`
      )
    )
    return out
  }
  if (A.helixAngleDeg === 0) return out
  if (A.herringbone !== B.herringbone) {
    out.push(reason('herringbone-mismatch', 'A herringbone gear only meshes with another herringbone, not a single helical gear.'))
  }
  const sameHand = A.handedness === B.handedness
  if (A.kind === 'external' && B.kind === 'external' && sameHand) {
    out.push(reason('helix-hand-same', `Helical gears on parallel shafts need opposite hands — both are ${A.handedness}-hand.`))
  }
  if ((A.kind === 'internal' || B.kind === 'internal') && !sameHand) {
    out.push(reason('helix-hand-opposite', 'A ring gear and its pinion need the same hand — one is right-hand and the other left-hand.'))
  }
  return out
}

/**
 * The ring readout `core-043` built (`checkRingPinion`): a pinion no smaller than the ring
 * is refused, one whose tips strike the ring's is a warning.
 *
 * @param {ResolvedGear} R
 * @param {ResolvedGear} P
 * @returns {MeshReason[]}
 */
function ringReasons(R, P) {
  const ring = /** @type {import('./internal.js').RingGearDimensions} */ (R.ring)
  /** @type {MeshReason[]} */
  const out = []
  try {
    const { warnings } = checkRingPinion(ring, P.teeth)
    if (warnings.includes('tip-interference')) {
      out.push(
        reason(
          'tip-interference',
          `A ${P.teeth}-tooth pinion's tips strike the ${R.teeth}-tooth ring's teeth as it leaves mesh — the largest pinion this ring takes is ${ring.maxPinionTeeth} teeth.`,
          'warning'
        )
      )
    }
  } catch (error) {
    if (!(error instanceof GearMeshError) || error.code !== 'ring-not-larger') throw error
    out.push(reason('ring-not-larger', `${error.message.charAt(0).toUpperCase()}${error.message.slice(1)}.`))
    return out
  }
  if (P.profileShift !== 0) {
    out.push(
      reason(
        'pinion-shift-not-checked',
        `The ring's interference check assumes an unshifted pinion — this one is shifted by ${fmt(P.profileShift)} modules, so check the fit by hand.`,
        'warning'
      )
    )
  }
  return out
}

/**
 * The pair's shape: which gear is the ring or rack, if either.
 *
 * @param {ResolvedGear} A
 * @param {ResolvedGear} B
 */
function pairType(A, B) {
  if (A.kind === 'rack' || B.kind === 'rack') return /** @type {const} */ ('rack')
  if (A.kind === 'internal' || B.kind === 'internal') return /** @type {const} */ ('internal')
  return /** @type {const} */ ('external')
}

/**
 * Throw the first reason that makes centre distance and phase meaningless.
 *
 * @param {ResolvedGear} A
 * @param {ResolvedGear} B
 * @param {boolean} crossed
 * @returns {void}
 * @throws {GearMeshError}
 */
function assertMeshable(A, B, crossed) {
  if (crossed) {
    throw new GearMeshError(
      'Gears on crossed axes cannot be placed yet — only pairs on parallel axes (the same pitch plane) are meshed.',
      'axes-not-parallel'
    )
  }
  const kind = kindReason(A, B)
  const reasons = kind ? [kind] : [...profileReasons(A, B), ...helixReasons(A, B, false)]
  if (reasons.length === 0 && pairType(A, B) === 'internal') {
    reasons.push(...(A.kind === 'internal' ? ringReasons(A, B) : ringReasons(B, A)))
  }
  const blocking = reasons.find((r) => BLOCKING.has(r.code))
  if (blocking) throw new GearMeshError(blocking.message, blocking.code)
}

/**
 * Solve `inv α = target` for α in `[0, π/2)`.
 *
 * @param {number} target
 * @returns {number} radians
 */
function invInverse(target) {
  let lo = 0
  let hi = Math.PI / 2 - 1e-6
  for (let i = 0; i < BISECT_ITERATIONS; i++) {
    const mid = (lo + hi) / 2
    if (inv(mid) < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * The distance at which the pair runs with no play beyond its own backlash, and the working
 * pressure angle there. Assumes {@link assertMeshable} passed.
 *
 * @param {ResolvedGear} A
 * @param {ResolvedGear} B
 * @returns {{ centerDistanceMm: number, workingAngleRad: number, type: 'external' | 'internal' | 'rack' }}
 */
function working(A, B) {
  const type = pairType(A, B)
  const alphaT = A.transversePressureAngleDeg * DEG_TO_RAD
  const tanAlphaN = Math.tan(A.pressureAngleDeg * DEG_TO_RAD)
  if (type === 'rack') {
    const pinion = A.kind === 'rack' ? B : A
    return { centerDistanceMm: pinion.pitchRadiusMm + pinion.profileShift * pinion.moduleMm, workingAngleRad: alphaT, type }
  }
  let shiftSum
  let teethSum
  let nominalMm
  if (type === 'internal') {
    const [R, P] = A.kind === 'internal' ? [A, B] : [B, A]
    shiftSum = -P.profileShift // the ring is unshifted
    teethSum = R.teeth - P.teeth
    nominalMm = R.pitchRadiusMm - P.pitchRadiusMm
  } else {
    shiftSum = A.profileShift + B.profileShift
    teethSum = A.teeth + B.teeth
    nominalMm = A.pitchRadiusMm + B.pitchRadiusMm
  }
  if (shiftSum === 0) return { centerDistanceMm: nominalMm, workingAngleRad: alphaT, type }
  const target = inv(alphaT) + (2 * tanAlphaN * shiftSum) / teethSum
  if (!(target > 0)) {
    throw new GearMeshError(
      `A profile shift of ${fmt(shiftSum)} modules in total is too negative for this pair — there is no working pressure angle; reduce it.`,
      'shift-too-negative'
    )
  }
  const workingAngleRad = invInverse(target)
  return { centerDistanceMm: (nominalMm * Math.cos(alphaT)) / Math.cos(workingAngleRad), workingAngleRad, type }
}

/**
 * The centre distance of a meshing pair: `R₁ + R₂` (external), `R_ring − R_pinion` (ring),
 * `R_pinion + x·m` (rack), corrected to the working pressure angle by any profile shift (module
 * doc). Backlash thins the teeth and does not move the shafts; `extraBacklashMm` spreads them.
 *
 * @param {MeshGear} a
 * @param {MeshGear} b
 * @param {{ extraBacklashMm?: number }} [options] Play beyond the gears' own `backlashMm`,
 *   circumferential mm on the pitch circle: `Δa = j / (2 tan α_w)`.
 * @returns {number} mm. For a rack pair: pinion axis to the rack's pitch line.
 * @throws {GearParameterError} for malformed or hostile params.
 * @throws {GearMeshError} for a pair that cannot mesh (its {@link MeshReasonCode}).
 */
export function centerDistanceMm(a, b, options) {
  const A = resolveGear(a, 'gear 1')
  const B = resolveGear(b, 'gear 2')
  const { extraBacklashMm } = resolveOptions(options)
  assertMeshable(A, B, isCrossed(A, B, undefined))
  const { centerDistanceMm: distanceMm, workingAngleRad, type } = working(A, B)
  if (extraBacklashMm === 0) return distanceMm
  const spreadMm = extraBacklashMm / (2 * Math.tan(workingAngleRad))
  // A ring pair gains play by bringing the pinion *in*, away from the ring's teeth.
  return type === 'internal' ? distanceMm - spreadMm : distanceMm + spreadMm
}

/**
 * The turns ratio, `b.teeth / a.teeth` — turns of `a` per turn of `b` — signed: negative for
 * an external pair (the shafts reverse), positive for a ring and its pinion. V1's
 * `gear1.toothCount / gear1.toothCount` was always 1 (Decision 5 defect 1).
 *
 * @param {MeshGear} a
 * @param {MeshGear} b
 * @returns {number}
 * @throws {GearMeshError} `'rack-pair'` — a rack has no turns; it travels `π · m · z` mm per
 *   pinion turn — or a kind pairing that cannot mesh.
 */
export function gearRatio(a, b) {
  const A = resolveGear(a, 'gear 1')
  const B = resolveGear(b, 'gear 2')
  const kind = kindReason(A, B)
  if (kind) throw new GearMeshError(kind.message, kind.code)
  const type = pairType(A, B)
  if (type === 'rack') {
    const pinion = A.kind === 'rack' ? B : A
    throw new GearMeshError(
      `A rack pair has no turns ratio — the rack travels ${fmt(pinion.circularPitchMm * pinion.teeth)} mm per turn of its ${pinion.teeth}-tooth pinion.`,
      'rack-pair'
    )
  }
  return type === 'internal' ? B.teeth / A.teeth : -B.teeth / A.teeth
}

/**
 * @param {readonly number[]} p
 * @param {readonly number[]} q
 */
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]

/**
 * `x` reduced to within half a period of 0.
 *
 * @param {number} x
 * @param {number} period
 */
const nearest = (x, period) => x - period * Math.round(x / period)

/**
 * A helical gear's section turn at world station `stationMm` along the shared axis, degrees.
 *
 * @param {ResolvedGear} G
 * @param {number} axialMm The gear's mid-plane on the axis.
 * @param {number} stationMm
 * @returns {number}
 */
function twistDegAt(G, axialMm, stationMm) {
  if (G.helixAngleDeg === 0 || G.thicknessMm === undefined) return 0
  const t = G.thicknessMm
  const fromBottomMm = Math.min(t, Math.max(0, stationMm - (axialMm - t / 2)))
  const runMm = G.herringbone ? Math.min(fromBottomMm, t - fromBottomMm) : fromBottomMm
  return (
    helixTwistRad({ thicknessMm: runMm, pitchRadiusMm: G.pitchRadiusMm, helixAngleDeg: G.helixAngleDeg, handedness: G.handedness }) * RAD_TO_DEG
  )
}

/**
 * Where gear 2 goes to mesh with gear 1, and how far it moves and turns to get there.
 *
 * Gear 1 stays put. Gear 2 moves, in the pitch plane, along its current bearing from gear 1
 * (or along `+u` when it sits on gear 1's axis) to the centre distance, keeping its axial
 * position, and turns the smallest way that interleaves the teeth (module doc). A rack as
 * gear 2 keeps its direction and slides along itself instead. Both gears' frames must share
 * a pitch plane: crossed axes are refused (`'axes-not-parallel'`).
 *
 * @param {MeshGear} a Gear 1; its frame (default: origin, XY, phase 0) is kept.
 * @param {MeshGear} b Gear 2; its frame (default: gear 1's centre, phase 0) is moved.
 * @param {{ extraBacklashMm?: number }} [options] As {@link centerDistanceMm}.
 * @returns {MeshPlacement}
 * @throws {GearParameterError} for malformed or hostile params, or a helical pair whose faces
 *   are not level and whose `thicknessMm` is not given.
 * @throws {GearMeshError} for a pair that cannot mesh.
 */
export function meshPlacement(a, b, options) {
  const A = resolveGear(a, 'gear 1')
  const B = resolveGear(b, 'gear 2')
  resolveOptions(options)
  assertMeshable(A, B, isCrossed(A, B, undefined))
  const distanceMm = centerDistanceMm(a, b, options)
  const plane = A.frame?.pitchPlane ?? B.frame?.pitchPlane ?? 'xy'
  const { u, v, n } = PITCH_PLANE_BASIS[plane]
  const fa = A.frame ?? { centerMm: /** @type {Vec3Mm} */ ([0, 0, 0]), pitchPlane: plane, phaseDeg: 0 }
  const fb = B.frame ?? { centerMm: fa.centerMm, pitchPlane: plane, phaseDeg: 0 }
  const [ax, ay, aAxial] = [dot(fa.centerMm, u), dot(fa.centerMm, v), dot(fa.centerMm, n)]
  const [bx, by, bAxial] = [dot(fb.centerMm, u), dot(fb.centerMm, v), dot(fb.centerMm, n)]

  // The station along the axis where the rule is applied: inside both face widths.
  const helical = A.helixAngleDeg > 0 || B.helixAngleDeg > 0
  let stationMm = aAxial
  if (A.thicknessMm !== undefined && B.thicknessMm !== undefined) {
    const lo = Math.max(aAxial - A.thicknessMm / 2, bAxial - B.thicknessMm / 2)
    const hi = Math.min(aAxial + A.thicknessMm / 2, bAxial + B.thicknessMm / 2)
    if (hi > lo) stationMm = (lo + hi) / 2
  } else if (helical && (A.thicknessMm !== undefined || B.thicknessMm !== undefined || Math.abs(aAxial - bAxial) > EPS)) {
    // Without both face widths the twist at a shared station is unknown — unless neither is
    // given and the faces are level, when the pair is taken to share its faces, as gear.pair builds it.
    const missing = A.thicknessMm === undefined ? A : B
    throw new GearParameterError(
      `${missing.label}: thicknessMm is required to mesh a helical gear whose faces are not known to be level with its mate's`
    )
  }
  const phaseAEffDeg = fa.phaseDeg + twistDegAt(A, aAxial, stationMm)

  const type = pairType(A, B)
  let newX
  let newY
  /** Gear 2's phase at the station, before its own twist is taken off. */
  let phaseBEffDeg = fb.phaseDeg
  if (type === 'rack') {
    const rackIsA = A.kind === 'rack'
    const rack = rackIsA ? A : B
    const pinion = rackIsA ? B : A
    const directionRad = (rackIsA ? fa.phaseDeg : fb.phaseDeg) * DEG_TO_RAD
    const [tx, ty] = [Math.cos(directionRad), Math.sin(directionRad)]
    const [nx, ny] = [-ty, tx]
    const p = rack.circularPitchMm
    const tooth0Mm = (0.5 - rack.teeth / 2) * p
    const pinionBearingDeg = (rackIsA ? fa.phaseDeg : fb.phaseDeg) - 90
    if (rackIsA) {
      const slideMm = (bx - ax) * tx + (by - ay) * ty
      newX = ax + slideMm * tx + distanceMm * nx
      newY = ay + slideMm * ty + distanceMm * ny
      const uRack = (slideMm - tooth0Mm) / p
      phaseBEffDeg = pinionBearingDeg - ((uRack + 0.5) * 360) / pinion.teeth
    } else {
      // The pitch line runs through the pinion's foot point L0; slide the rack along it so a
      // space (or tooth) sits where the pinion's tooth (or space) is.
      const footX = ax - distanceMm * nx
      const footY = ay - distanceMm * ny
      const uPinion = ((pinionBearingDeg - phaseAEffDeg) * pinion.teeth) / 360
      const baseMm = -(tooth0Mm + (uPinion - 0.5) * p)
      const currentMm = (bx - footX) * tx + (by - footY) * ty
      const alongMm = baseMm + p * Math.round((currentMm - baseMm) / p)
      newX = footX + alongMm * tx
      newY = footY + alongMm * ty
    }
  } else {
    const dx = bx - ax
    const dy = by - ay
    const bearingDeg = Math.hypot(dx, dy) > EPS ? Math.atan2(dy, dx) * RAD_TO_DEG : 0
    newX = ax + distanceMm * Math.cos(bearingDeg * DEG_TO_RAD)
    newY = ay + distanceMm * Math.sin(bearingDeg * DEG_TO_RAD)
    const uA = ((type === 'internal' && B.kind === 'internal' ? bearingDeg + 180 : bearingDeg) - phaseAEffDeg) * (A.teeth / 360)
    if (type === 'external') {
      phaseBEffDeg = bearingDeg + 180 - ((0.5 - uA) * 360) / B.teeth
    } else if (A.kind === 'internal') {
      phaseBEffDeg = bearingDeg - ((uA - 0.5) * 360) / B.teeth
    } else {
      phaseBEffDeg = bearingDeg + 180 - ((uA + 0.5) * 360) / B.teeth
    }
  }

  const rotateDeg = B.kind === 'rack' ? 0 : nearest(phaseBEffDeg - twistDegAt(B, bAxial, stationMm) - fb.phaseDeg, 360 / B.teeth)
  const centerMm = /** @type {Vec3Mm} */ ([0, 1, 2].map((i) => u[i] * newX + v[i] * newY + n[i] * bAxial))
  return Object.freeze({
    centerMm,
    phaseDeg: fb.phaseDeg + rotateDeg,
    translateMm: /** @type {Vec3Mm} */ ([0, 1, 2].map((i) => centerMm[i] - fb.centerMm[i])),
    rotateDeg,
    centerDistanceMm: distanceMm,
    ratio: type === 'rack' ? null : gearRatio(a, b),
    pitchPlane: plane,
  })
}

/**
 * Gear 2's phase that interleaves its teeth with gear 1's — the half-tooth rule generalised
 * (module doc), within half a tooth of its current phase. With gear 1 at rest and gear 2 on
 * `+u` it is V1's `180 + 180/z₂`, modulo one tooth. A rack as gear 2 does not turn: its phase
 * is returned unchanged, and the slide is {@link meshPlacement}'s `centerMm`.
 *
 * @param {MeshGear} a
 * @param {MeshGear} b
 * @returns {number} degrees, CCW about the pitch plane's axis.
 * @throws {GearParameterError | GearMeshError} as {@link meshPlacement}.
 */
export function meshPhaseDeg(a, b) {
  return meshPlacement(a, b).phaseDeg
}

/**
 * Every reason the pair will not mesh (`severity: 'error'`) or may not run cleanly
 * (`'warning'`), each a code and one sentence the UI can show verbatim; `[]` for a good pair.
 * Checks the kinds, module, pressure angle, helix angle and hand for the axis arrangement
 * (opposite hands on parallel external shafts, the same hand for a ring pair and on crossed
 * shafts), herringbones, a ring's pinion (`checkRingPinion`, `core-043`), tip-to-root
 * clearance at the working centre distance, and — given both frames and face widths — whether
 * the faces overlap along the axis.
 *
 * @param {MeshGear} a
 * @param {MeshGear} b
 * @param {{ axes?: MeshAxes }} [options] `axes` defaults to `'crossed'` when the two frames
 *   are in different pitch planes, else `'parallel'`.
 * @returns {MeshReason[]}
 * @throws {GearParameterError} for malformed or hostile params — never for a mismatch.
 */
export function compatibility(a, b, options) {
  const A = resolveGear(a, 'gear 1')
  const B = resolveGear(b, 'gear 2')
  const crossed = isCrossed(A, B, resolveOptions(options).axes)
  const kind = kindReason(A, B)
  if (kind) return [kind]
  const profile = profileReasons(A, B)
  /** @type {MeshReason[]} */
  const reasons = [...profile, ...helixReasons(A, B, crossed)]
  if (profile.length > 0 || crossed) return reasons
  if (pairType(A, B) === 'internal') reasons.push(...(A.kind === 'internal' ? ringReasons(A, B) : ringReasons(B, A)))
  if (reasons.some((r) => BLOCKING.has(r.code))) return reasons

  let workingMm
  try {
    workingMm = working(A, B).centerDistanceMm
  } catch (error) {
    if (!(error instanceof GearMeshError)) throw error
    reasons.push(reason(/** @type {MeshReasonCode} */ (error.code), error.message))
    return reasons
  }
  const clearanceMm = tipClearanceMm(A, B, workingMm)
  if (clearanceMm < -EPS) {
    reasons.push(
      reason(
        'tip-clearance',
        `A tooth tip would dig ${fmt(-clearanceMm)} mm into the other gear's root at the ${fmt(workingMm)} mm centre distance — reduce the profile shift or raise clearanceMm.`
      )
    )
  }

  if (A.frame && B.frame) {
    const { n } = PITCH_PLANE_BASIS[A.frame.pitchPlane]
    const aAxial = dot(A.frame.centerMm, n)
    const bAxial = dot(B.frame.centerMm, n)
    if (A.thicknessMm !== undefined && B.thicknessMm !== undefined) {
      const lo = Math.max(aAxial - A.thicknessMm / 2, bAxial - B.thicknessMm / 2)
      const hi = Math.min(aAxial + A.thicknessMm / 2, bAxial + B.thicknessMm / 2)
      if (!(hi - lo > EPS)) {
        reasons.push(reason('no-face-overlap', "The two gears' faces do not overlap along their axes — move one so they share some face width."))
      }
    }
    if (A.herringbone && B.herringbone && A.helixAngleDeg > 0 && Math.abs(aAxial - bAxial) > 1e-6) {
      reasons.push(
        reason('herringbone-apex-offset', `Herringbone gears must have their apexes level — these are ${fmt(Math.abs(aAxial - bAxial))} mm apart along the axis.`)
      )
    }
  }
  return reasons
}

/**
 * The tighter of the two tip-to-root gaps at centre distance `aMm` (negative: a tip digs in).
 *
 * @param {ResolvedGear} A
 * @param {ResolvedGear} B
 * @param {number} aMm
 * @returns {number} mm
 */
function tipClearanceMm(A, B, aMm) {
  const type = pairType(A, B)
  if (type === 'rack') {
    const [R, P] = A.kind === 'rack' ? [A, B] : [B, A]
    return Math.min(aMm - P.tipMm + R.rootMm, aMm - R.tipMm - P.rootMm)
  }
  if (type === 'internal') {
    const [R, P] = A.kind === 'internal' ? [A, B] : [B, A]
    return Math.min(R.rootMm - (aMm + P.tipMm), R.tipMm - aMm - P.rootMm)
  }
  return Math.min(aMm - A.tipMm - B.rootMm, aMm - B.tipMm - A.rootMm)
}
