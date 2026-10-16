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
 * ## Crossed axes (TODO/core-046)
 *
 * Two helical gears on shafts `Σ` apart that do not meet (`axes: 'crossed'`, or frames in
 * different pitch planes) touch at one point `P` on the line of centres. Each meshes with the
 * same imaginary rack in the plane normal to its teeth, so the centre distance is
 * `R₁ + x₁·m + R₂ + x₂·m` on each gear's own transverse pitch circle — no working-angle
 * correction. At `P` the two teeth must be parallel: gear 1's right-hand tooth leans `+β₁`
 * from its axis, and gear 2's leans the same way only if gear 2's axis is gear 1's turned
 * **`−Σ` about the line of centres for a right hand, `+Σ` for a left** (`Σ = β₁ + β₂`, the
 * same hand on both). The half-tooth rule is the external one, `u₁ + u₂ ≡ ½`, with `u` read
 * at `P`: projected onto the normal of the tooth direction both gears have normal pitch
 * `π·mₙ`, so the transverse pitches cancel out of the rule. Each gear's phase there carries its
 * own twist at `P`'s height — gear 1's at gear 2's height along gear 1's axis, gear 2's at its
 * own mid-plane — so both face widths are needed.
 *
 * ## Worms (TODO/core-047)
 *
 * A worm (`kind: 'worm'`) is a helical gear of `starts` teeth whose helix is `90° − γ` (γ its
 * lead angle), and its wheel a helical gear of helix γ and the same hand (`./worm.js`), so a
 * worm pair is a crossed pair at Σ = 90° and every rule above applies as written: centres
 * `R_worm + R_wheel` apart (`(d_worm + d_wheel) / 2`), the same-hand rule, the external
 * half-tooth rule with the worm's `starts` teeth round its transverse section, and its twist
 * `2π·z / lead` at the contact point. A worm forces crossed axes (`'worm-needs-crossed-axes'`
 * if told `'parallel'`); two worms do not mesh (`'two-worms'`). The ratio is
 * {@link gearRatio}'s `b.teeth / a.teeth` with the worm's `starts` as its teeth — wheel teeth :
 * starts. For a worm pair the helix reasons come before the module and pressure angle ones: a
 * wheel cut for another worm differs in lead angle first, and in normal module and pressure
 * angle only because of it.
 *
 * ## Bevel pairs (TODO/core-046)
 *
 * Two bevel gears mesh with their **apexes on one point** and their axes `Σ` apart; their
 * pitch cones (`δ₁ + δ₂ = Σ`, `./bevel.js`) touch along one line. Gear 2's frame is gear 1's
 * turned to the contact azimuth `ψ` about gear 1's axis, then by `Σ` about the turned `+Y`:
 * `R₂ = R₁ · Rz(ψ) · Ry(Σ)`. In that frame the contact line lies at bearing 180°, as gear 2's
 * centre does on a spur pair. **Phase**: on the back cone each gear is its virtual spur gear
 * of `z' = z / cos δ` teeth, and a virtual angle is a real one times `cos δ`, so
 * `u' = (ψ' − φ') · z' / 360` is exactly `u = (ψ − φ) · z / 360`. The two virtual gears are an
 * external pair rolling at `P`, and a turn of either about its own axis (apex toward its large
 * end) moves its pitch point the same way round as on a spur pair, so the rule is again
 * `u₁ + u₂ ≡ ½`: `φ₂ = 180° − (½ − u₁) · 360 / z₂`, V1's `180 + 180/z₂` at rest. It comes out
 * the same form as the spur rule — derived, not copied — and does not depend on Σ.
 * {@link bevelCompatibility} checks module, pressure angle, shaft angle, `δ₁ + δ₂ = Σ` and the
 * cone distance; spiral bevels (and so hand) are not built (`./bevel.js`).
 *
 * A **rotation** crosses this module as `transform.rotate`'s three angles (`orientationDeg`,
 * `rotateDeg` on a bevel): X first, then Y, then Z, the order {@link PITCH_PLANE_BASIS}'s
 * `rotateDeg` is written in. A gear's own turn about its axis (`phaseDeg`) is always applied
 * before it, about local Z.
 *
 * Framework-free and kernel-free: no Vue, no DOM, no three.js, no `@jscad/modeling`.
 *
 * @module core/gear/mesh
 */

import { DEFAULT_SHAFT_ANGLE_DEG, bevelGearDimensions } from './bevel.js'
import { GearParameterError, gearDimensions } from './dimensions.js'
import { helixTwistRad } from './helix.js'
import { GearMeshError, checkRingPinion, ringGearDimensions } from './internal.js'
import { BEVEL_LIMITS, GEAR_LIMITS, RACK_LIMITS, RING_LIMITS, WORM_LIMITS, checkGearLimits } from './limits.js'
import { DEFAULT_RACK_TEETH, rackDimensions } from './rack.js'
import { wormDimensions } from './worm.js'

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
/** Below this, two lengths (mm) or angles (degrees) are the same. */
const EPS = 1e-9
const BISECT_ITERATIONS = 64

/** @param {number} a Radians. */
const inv = (a) => Math.tan(a) - a

/** @typedef {[number, number, number]} Vec3Mm */
/** @typedef {[number, number, number]} Vec3 A direction, or three angles in degrees. */
/** @typedef {[[number, number, number], [number, number, number], [number, number, number]]} Mat3 */
/** @typedef {'external' | 'internal' | 'rack' | 'worm'} GearKind */
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
 *   | 'shift-too-negative' | 'rack-pair' | 'shaft-angle-mismatch' | 'cone-angle-sum'
 *   | 'cone-distance-mismatch' | 'two-worms' | 'worm-needs-crossed-axes'} MeshReasonCode
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
 * @property {number} [starts] A worm's (`kind: 'worm'`), in place of `teeth`.
 * @property {number} [pitchDiameterMm] A worm's: a free param, not `teeth · module`.
 * @property {number} [lengthMm] A worm's length — its face width here.
 * @property {MeshFrame} [frame] Where the gear is now; the origin, in XY, at phase 0 if omitted.
 *
 * On a **worm** (`kind: 'worm'`, `./worm.js`) `moduleMm` and `pressureAngleDeg` are the
 * **axial** values, as `gear.worm` stores them; it is resolved to the helical gear of
 * `starts` teeth it is (normal module and pressure angle, helix `90° − γ`, pitch radius
 * `pitchDiameterMm / 2`), so the crossed-axis rules apply to it unchanged.
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
 * @property {PitchPlane} pitchPlane Gear 1's.
 * @property {MeshAxes} axes
 * @property {number} shaftAngleDeg 0 on parallel axes.
 * @property {Vec3} axis Gear 2's axis there, a unit vector.
 * @property {Vec3} orientationDeg The `transform.rotate` angles that stand gear 2 — built in
 *   XY, axis +Z, already turned by `phaseDeg` about it — where it goes, before the move to
 *   `centerMm`. On parallel axes the pitch plane's {@link PITCH_PLANE_BASIS} `rotateDeg`.
 */

/**
 * Where a bevel gear is: its apex (world mm), and the rotation that stands it up from its
 * as-built layout (axis +Z, apex at the origin, tooth 0 on +X), after its own turn about +Z.
 *
 * @typedef {object} BevelFrame
 * @property {Vec3Mm} apexMm
 * @property {Vec3} [rotateDeg=[0, 0, 0]] `transform.rotate` angles.
 * @property {number} [phaseDeg=0] Its turn about its own axis, applied first, degrees.
 */

/**
 * A bevel gear's params — `gear.bevel`'s canonical names (a record's `boreMm` and
 * `hubLengthMm` are ignored) — and where it is.
 *
 * @typedef {object} BevelMeshGear
 * @property {number} teeth
 * @property {number} mateTeeth The tooth count it was cut to mesh with.
 * @property {number} moduleMm At the large end.
 * @property {number} [shaftAngleDeg=90] The Σ it was cut for.
 * @property {number} [pressureAngleDeg=20]
 * @property {number} [clearanceMm]
 * @property {number} [backlashMm=0]
 * @property {number} [faceWidthMm]
 * @property {BevelFrame} [frame] The origin, unturned, if omitted.
 */

/**
 * @typedef {object} BevelMeshPlacement
 * @property {Vec3Mm} apexMm Gear 2's apex: gear 1's.
 * @property {Vec3Mm} translateMm The move from gear 2's current apex.
 * @property {Vec3} rotateDeg Gear 2's `transform.rotate` angles (its {@link BevelFrame}'s).
 * @property {number} phaseDeg Gear 2's turn about its own axis, in `[0, 360/z₂)`.
 * @property {Vec3} axis Gear 2's axis (apex toward its large end), a unit vector.
 * @property {number} shaftAngleDeg
 * @property {[number, number]} pitchConeAnglesDeg `[δ₁, δ₂]`.
 * @property {number} coneDistanceMm Apex to either large-end pitch circle.
 * @property {number} ratio `−z₂ / z₁`, each gear turning about its own axis.
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

const KINDS = Object.freeze(/** @type {const} */ (['external', 'internal', 'rack', 'worm']))

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

/**
 * @typedef {object} ResolvedBevel
 * @property {string} label
 * @property {number} teeth
 * @property {number} moduleMm
 * @property {number} pressureAngleDeg
 * @property {import('./bevel.js').BevelGearDimensions} dims
 * @property {{ apexMm: Vec3Mm, rotateDeg: Vec3, phaseDeg: number } | undefined} frame
 */

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
  if (kind === 'worm') return resolveWorm(g, label)
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
 * A worm, checked as a worm (`./worm.js`, `WORM_LIMITS` first) and resolved to the helical
 * gear of `starts` teeth it is (module doc): normal module and pressure angle, helix
 * `90° − γ`, pitch radius `pitchDiameterMm / 2`, its length as its face width.
 *
 * @param {Record<string, unknown>} g
 * @param {string} label
 * @returns {ResolvedGear}
 */
function resolveWorm(g, label) {
  checkGearLimits(g, { op: label, required: ['starts', 'moduleMm', 'pitchDiameterMm'], limits: WORM_LIMITS })
  for (const [name, why] of /** @type {const} */ ([
    ['teeth', 'its starts are its teeth'],
    ['profileShift', 'it has no profile shift'],
    ['helixAngleDeg', 'its helix is the complement of its lead angle, which its starts, module and pitch diameter fix'],
    ['herringbone', 'it has no herringbone'],
  ])) {
    if (g[name] !== undefined) throw new GearParameterError(`${label}: a worm has no ${name} — ${why}`)
  }
  const frame = resolveFrame(g.frame, label)
  const worm = wormDimensions(/** @type {any} */ (g), { op: label })
  const helixAngleDeg = worm.helixAngleDeg
  return {
    label,
    kind: 'worm',
    teeth: worm.starts,
    moduleMm: worm.normalModuleMm,
    pressureAngleDeg: worm.normalPressureAngleDeg,
    transversePressureAngleDeg:
      Math.atan(Math.tan(worm.normalPressureAngleDeg * DEG_TO_RAD) / Math.cos(helixAngleDeg * DEG_TO_RAD)) * RAD_TO_DEG,
    helixAngleDeg,
    handedness: worm.handedness,
    herringbone: false,
    profileShift: 0,
    thicknessMm: worm.lengthMm,
    pitchRadiusMm: worm.pitchRadiusMm,
    circularPitchMm: (Math.PI * worm.pitchDiameterMm) / worm.starts,
    tipMm: worm.tipRadiusMm,
    rootMm: worm.rootRadiusMm,
    ring: undefined,
    frame,
  }
}

/**
 * @typedef {object} MeshOptions
 * @property {number} [extraBacklashMm=0] Play beyond the gears' own `backlashMm`,
 *   circumferential mm on the pitch circle.
 * @property {MeshAxes} [axes] Default `'crossed'` when both frames are given in different
 *   pitch planes, else `'parallel'`.
 * @property {number} [shaftAngleDeg=90] Crossed axes only: the angle between the shafts,
 *   `0 < Σ < 180`; the two helix angles must add up to it.
 */

/**
 * @param {unknown} options
 * @returns {{ extraBacklashMm: number, axes: MeshAxes | undefined, shaftAngleDeg: number }}
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
  const shaftAngleDeg = o.shaftAngleDeg ?? DEFAULT_SHAFT_ANGLE_DEG
  if (typeof shaftAngleDeg !== 'number' || !Number.isFinite(shaftAngleDeg) || !(shaftAngleDeg > 0 && shaftAngleDeg < 180)) {
    throw new GearParameterError(`shaftAngleDeg must be between 0° and 180° (exclusive), got ${String(shaftAngleDeg)}`)
  }
  return { extraBacklashMm: extra, axes: /** @type {MeshAxes | undefined} */ (axes), shaftAngleDeg }
}

/**
 * Crossed when asked, when both frames are given in different pitch planes, or whenever a
 * worm is one of the pair.
 *
 * @param {ResolvedGear} A
 * @param {ResolvedGear} B
 * @param {MeshAxes | undefined} axes
 * @returns {boolean}
 * @throws {GearMeshError} `'worm-needs-crossed-axes'` for a worm told `'parallel'`.
 */
function isCrossed(A, B, axes) {
  const wormAxes = wormAxesReason(A, B, axes)
  if (wormAxes) throw new GearMeshError(wormAxes.message, wormAxes.code)
  if (A.kind === 'worm' || B.kind === 'worm') return true
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
  if (A.kind === 'worm' && B.kind === 'worm') {
    return reason('two-worms', 'Two worms cannot mesh — a worm drives a worm wheel, a helical gear cut to its lead angle.')
  }
  const flat = (/** @type {GearKind} */ k) => k === 'internal' || k === 'rack'
  if (flat(A.kind) && flat(B.kind)) {
    return reason('ring-and-rack', 'A ring gear and a rack cannot mesh — each needs an external gear (a pinion).')
  }
  return undefined
}

/**
 * A worm only meshes on crossed axes: told `'parallel'`, this is why not.
 *
 * @param {ResolvedGear} A
 * @param {ResolvedGear} B
 * @param {MeshAxes | undefined} axes
 * @returns {MeshReason | undefined}
 */
function wormAxesReason(A, B, axes) {
  if (axes !== 'parallel' || (A.kind !== 'worm' && B.kind !== 'worm')) return undefined
  return reason('worm-needs-crossed-axes', 'A worm only meshes with its wheel on crossed axes — its shaft runs square to the wheel’s, not parallel to it.')
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
 * @param {number} [shaftAngleDeg=90] Crossed axes only.
 * @returns {MeshReason[]}
 */
function helixReasons(A, B, crossed, shaftAngleDeg = DEFAULT_SHAFT_ANGLE_DEG) {
  /** @type {MeshReason[]} */
  const out = []
  const rack = A.kind === 'rack' ? A : B.kind === 'rack' ? B : undefined
  if (crossed) {
    const round = (/** @type {GearKind} */ k) => k === 'external' || k === 'worm'
    if (!round(A.kind) || !round(B.kind)) {
      out.push(reason('axes-not-parallel', `A ${rack ? 'rack' : 'ring gear'} only meshes with a pinion on a parallel axis.`))
      return out
    }
    if (A.helixAngleDeg === 0 || B.helixAngleDeg === 0 || Math.abs(A.helixAngleDeg + B.helixAngleDeg - shaftAngleDeg) > EPS) {
      out.push(
        reason(
          'helix-angle-mismatch',
          `Gears on crossed axes need helix angles that add up to the ${fmt(shaftAngleDeg)}° between the shafts — these are ${fmt(A.helixAngleDeg)}° and ${fmt(B.helixAngleDeg)}°.`
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
 * Throw the first reason that makes centre distance and phase meaningless. On crossed axes
 * that is every error: the hand decides which way the shafts cross, so a pair of the wrong
 * hands has no placement at all.
 *
 * @param {ResolvedGear} A
 * @param {ResolvedGear} B
 * @param {boolean} crossed
 * @param {number} [shaftAngleDeg=90] Crossed axes only.
 * @returns {void}
 * @throws {GearMeshError}
 */
function assertMeshable(A, B, crossed, shaftAngleDeg = DEFAULT_SHAFT_ANGLE_DEG) {
  if (crossed) {
    const kind = kindReason(A, B)
    const first = kind ?? crossedReasons(A, B, shaftAngleDeg).find((r) => r.severity === 'error')
    if (first) throw new GearMeshError(first.message, first.code)
    return
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
 * Every profile and helix reason for a crossed pair — for a worm pair the helix ones first
 * (module doc: a wheel cut for another worm differs in lead angle first).
 *
 * @param {ResolvedGear} A
 * @param {ResolvedGear} B
 * @param {number} shaftAngleDeg
 * @returns {MeshReason[]}
 */
function crossedReasons(A, B, shaftAngleDeg) {
  const profile = profileReasons(A, B)
  const helix = helixReasons(A, B, true, shaftAngleDeg)
  return A.kind === 'worm' || B.kind === 'worm' ? [...helix, ...profile] : [...profile, ...helix]
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
 * Crossed axes: each gear meshes with the same normal rack, so the shifts add straight on and
 * the pair runs at the normal pressure angle (module doc). Assumes {@link assertMeshable} passed.
 *
 * @param {ResolvedGear} A
 * @param {ResolvedGear} B
 * @returns {{ centerDistanceMm: number, workingAngleRad: number }}
 */
function crossedWorking(A, B) {
  return {
    centerDistanceMm: A.pitchRadiusMm + B.pitchRadiusMm + (A.profileShift + B.profileShift) * A.moduleMm,
    workingAngleRad: A.pressureAngleDeg * DEG_TO_RAD,
  }
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
 * On crossed axes it is `R₁ + R₂ + (x₁ + x₂)·m`, each on its own transverse pitch circle.
 *
 * @param {MeshGear} a
 * @param {MeshGear} b
 * @param {MeshOptions} [options] `extraBacklashMm` spreads the shafts by `Δa = j / (2 tan α_w)`
 *   (crossed: the normal pressure angle).
 * @returns {number} mm. For a rack pair: pinion axis to the rack's pitch line.
 * @throws {GearParameterError} for malformed or hostile params.
 * @throws {GearMeshError} for a pair that cannot mesh (its {@link MeshReasonCode}).
 */
export function centerDistanceMm(a, b, options) {
  const A = resolveGear(a, 'gear 1')
  const B = resolveGear(b, 'gear 2')
  const { extraBacklashMm, axes, shaftAngleDeg } = resolveOptions(options)
  const crossed = isCrossed(A, B, axes)
  assertMeshable(A, B, crossed, shaftAngleDeg)
  if (crossed) {
    const { centerDistanceMm: crossedMm, workingAngleRad } = crossedWorking(A, B)
    return crossedMm + extraBacklashMm / (2 * Math.tan(workingAngleRad))
  }
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
 * A **worm** counts its `starts` as its teeth, so a worm and its wheel give wheel teeth :
 * starts (TODO/core-047) — `gearRatio(worm, wheel)` is `−z / starts` worm turns per wheel
 * turn. On crossed axes, as on a bevel pair, the sign is each gear's turn about its own axis
 * (its placement's `axis` for gear 2).
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
 * gear 2 keeps its direction and slides along itself instead.
 *
 * On **crossed axes** (`options.axes`, or frames in different pitch planes) gear 2 goes the
 * same way along the same bearing, keeping its height along gear 1's axis, and its axis is
 * gear 1's turned `∓Σ` about the line of centres (module doc): `orientationDeg` stands it up.
 * Its pitch plane is ignored past telling the axes are crossed. Both face widths are needed.
 *
 * @param {MeshGear} a Gear 1; its frame (default: origin, XY, phase 0) is kept.
 * @param {MeshGear} b Gear 2; its frame (default: gear 1's centre, phase 0) is moved.
 * @param {MeshOptions} [options] As {@link centerDistanceMm}.
 * @returns {MeshPlacement}
 * @throws {GearParameterError} for malformed or hostile params, a helical pair whose faces
 *   are not level and whose `thicknessMm` is not given, or a crossed pair missing either.
 * @throws {GearMeshError} for a pair that cannot mesh; `'no-face-overlap'` on crossed axes
 *   when the contact point is off gear 1's face.
 */
export function meshPlacement(a, b, options) {
  const A = resolveGear(a, 'gear 1')
  const B = resolveGear(b, 'gear 2')
  const { axes, shaftAngleDeg } = resolveOptions(options)
  const crossed = isCrossed(A, B, axes)
  assertMeshable(A, B, crossed, shaftAngleDeg)
  const distanceMm = centerDistanceMm(a, b, { ...options, axes: crossed ? 'crossed' : 'parallel' })
  if (crossed) return crossedPlacement(A, B, distanceMm, shaftAngleDeg, gearRatio(a, b))
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
    axes: /** @type {MeshAxes} */ ('parallel'),
    shaftAngleDeg: 0,
    axis: /** @type {Vec3} */ ([n[0], n[1], n[2]]),
    orientationDeg: /** @type {Vec3} */ ([...PITCH_PLANE_BASIS[plane].rotateDeg]),
  })
}

/**
 * {@link meshPlacement} on crossed axes, after {@link assertMeshable} passed (module doc).
 *
 * @param {ResolvedGear} A
 * @param {ResolvedGear} B
 * @param {number} distanceMm
 * @param {number} shaftAngleDeg
 * @param {number} ratio
 * @returns {MeshPlacement}
 */
function crossedPlacement(A, B, distanceMm, shaftAngleDeg, ratio) {
  for (const G of [A, B]) {
    if (G.thicknessMm === undefined) {
      throw new GearParameterError(`${G.label}: thicknessMm is required to mesh helical gears on crossed axes — each section's twist at the contact point depends on it`)
    }
  }
  const plane = A.frame?.pitchPlane ?? 'xy'
  const { u, v, n, rotateDeg: planeDeg } = PITCH_PLANE_BASIS[plane]
  const fa = A.frame ?? { centerMm: /** @type {Vec3Mm} */ ([0, 0, 0]), pitchPlane: plane, phaseDeg: 0 }
  const fb = B.frame ?? { centerMm: fa.centerMm, pitchPlane: plane, phaseDeg: 0 }
  const [ax, ay, aAxial] = [dot(fa.centerMm, u), dot(fa.centerMm, v), dot(fa.centerMm, n)]
  const [bx, by, bAxial] = [dot(fb.centerMm, u), dot(fb.centerMm, v), dot(fb.centerMm, n)]
  const halfFaceMm = /** @type {number} */ (A.thicknessMm) / 2
  if (Math.abs(bAxial - aAxial) > halfFaceMm + EPS) {
    throw new GearMeshError(
      `The contact point would be ${fmt(Math.abs(bAxial - aAxial))} mm along gear 1's axis from its middle, off its ${fmt(2 * halfFaceMm)} mm face — move gear 2 level with gear 1's face.`,
      'no-face-overlap'
    )
  }
  const dx = bx - ax
  const dy = by - ay
  const bearingDeg = Math.hypot(dx, dy) > EPS ? Math.atan2(dy, dx) * RAD_TO_DEG : 0
  const newX = ax + distanceMm * Math.cos(bearingDeg * DEG_TO_RAD)
  const newY = ay + distanceMm * Math.sin(bearingDeg * DEG_TO_RAD)
  // Gear 2's local +X runs along the line of centres, away from gear 1, so the contact point
  // is at its bearing 180°; its axis is gear 1's turned −Σ (right hand) or +Σ (left) about it.
  const sense = A.handedness === 'left' ? 1 : -1
  const R = matMul(matMul(matFromEulerDeg(planeDeg), rotZ(bearingDeg)), rotX(sense * shaftAngleDeg))
  const phaseAEffDeg = fa.phaseDeg + twistDegAt(A, aAxial, bAxial)
  const uA = ((bearingDeg - phaseAEffDeg) * A.teeth) / 360
  const phaseBDeg = 180 - ((0.5 - uA) * 360) / B.teeth - twistDegAt(B, 0, 0)
  const rotateDeg = nearest(phaseBDeg - fb.phaseDeg, 360 / B.teeth)
  const centerMm = /** @type {Vec3Mm} */ ([0, 1, 2].map((i) => u[i] * newX + v[i] * newY + n[i] * bAxial))
  return Object.freeze({
    centerMm,
    phaseDeg: fb.phaseDeg + rotateDeg,
    translateMm: /** @type {Vec3Mm} */ ([0, 1, 2].map((i) => centerMm[i] - fb.centerMm[i])),
    rotateDeg,
    centerDistanceMm: distanceMm,
    ratio,
    pitchPlane: plane,
    axes: /** @type {MeshAxes} */ ('crossed'),
    shaftAngleDeg,
    axis: columnZ(R),
    orientationDeg: eulerDegFromMat(R),
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
 * @param {MeshOptions} [options] `axes` defaults to `'crossed'` when the two frames are in
 *   different pitch planes, else `'parallel'`; `shaftAngleDeg` (crossed) defaults to 90°.
 * @returns {MeshReason[]}
 * @throws {GearParameterError} for malformed or hostile params — never for a mismatch.
 */
export function compatibility(a, b, options) {
  const A = resolveGear(a, 'gear 1')
  const B = resolveGear(b, 'gear 2')
  const { axes, shaftAngleDeg } = resolveOptions(options)
  const kind = kindReason(A, B)
  if (kind) return [kind]
  const wormAxes = wormAxesReason(A, B, axes)
  if (wormAxes) return [wormAxes]
  const crossed = isCrossed(A, B, axes)
  if (crossed) return crossedReasons(A, B, shaftAngleDeg)
  const profile = profileReasons(A, B)
  /** @type {MeshReason[]} */
  const reasons = [...profile, ...helixReasons(A, B, false, shaftAngleDeg)]
  if (profile.length > 0) return reasons
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

// ── Rotations ────────────────────────────────────────────────────────────────────────
// 3 × 3 matrices, rows of columns-as-used: `M · p`. Only the few a placement composes.

/** @param {number} deg */
function rotX(deg) {
  const c = Math.cos(deg * DEG_TO_RAD)
  const s = Math.sin(deg * DEG_TO_RAD)
  return /** @type {Mat3} */ ([
    [1, 0, 0],
    [0, c, -s],
    [0, s, c],
  ])
}

/** @param {number} deg */
function rotY(deg) {
  const c = Math.cos(deg * DEG_TO_RAD)
  const s = Math.sin(deg * DEG_TO_RAD)
  return /** @type {Mat3} */ ([
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ])
}

/** @param {number} deg */
function rotZ(deg) {
  const c = Math.cos(deg * DEG_TO_RAD)
  const s = Math.sin(deg * DEG_TO_RAD)
  return /** @type {Mat3} */ ([
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ])
}

/**
 * @param {Mat3} p
 * @param {Mat3} q
 * @returns {Mat3}
 */
function matMul(p, q) {
  return /** @type {Mat3} */ (
    [0, 1, 2].map((i) => [0, 1, 2].map((j) => p[i][0] * q[0][j] + p[i][1] * q[1][j] + p[i][2] * q[2][j]))
  )
}

/**
 * `transform.rotate`'s matrix: X first, then Y, then Z — `Rz · Ry · Rx`.
 *
 * @param {readonly number[]} anglesDeg
 * @returns {Mat3}
 */
function matFromEulerDeg(anglesDeg) {
  return matMul(matMul(rotZ(anglesDeg[2]), rotY(anglesDeg[1])), rotX(anglesDeg[0]))
}

/** @param {number} x Below 1e-12 is 0, and never `−0`. */
const tidy = (x) => (Math.abs(x) < 1e-12 ? 0 : x)

/**
 * The `transform.rotate` angles of `M` (the inverse of {@link matFromEulerDeg}). Of the two
 * angle triples every rotation has, the one turning least about X and Z — so a turn of Σ
 * about Y reads `[0, Σ, 0]` for any Σ, not `[180, 180 − Σ, 180]`.
 *
 * @param {Mat3} M
 * @returns {Vec3} degrees
 */
function eulerDegFromMat(M) {
  const sinB = Math.max(-1, Math.min(1, -M[2][0]))
  if (Math.abs(sinB) > 1 - 1e-12) {
    // Gimbal lock: only a − c (or a + c) is defined; put it all on Z.
    return [0, sinB > 0 ? 90 : -90, tidy(Math.atan2(-M[0][1], M[1][1]) * RAD_TO_DEG)]
  }
  const b1 = Math.asin(sinB) * RAD_TO_DEG
  const first = [Math.atan2(M[2][1], M[2][2]) * RAD_TO_DEG, b1, Math.atan2(M[1][0], M[0][0]) * RAD_TO_DEG]
  const second = [Math.atan2(-M[2][1], -M[2][2]) * RAD_TO_DEG, b1 > 0 ? 180 - b1 : -180 - b1, Math.atan2(-M[1][0], -M[0][0]) * RAD_TO_DEG]
  const cost = (/** @type {number[]} */ t) => Math.abs(t[0]) + Math.abs(t[2])
  const best = cost(second) < cost(first) - 1e-9 ? second : first
  return /** @type {Vec3} */ (best.map(tidy))
}

/**
 * `M`'s image of +Z, a unit vector.
 *
 * @param {Mat3} M
 * @returns {Vec3}
 */
function columnZ(M) {
  return [tidy(M[0][2]), tidy(M[1][2]), tidy(M[2][2])]
}

// ── Bevel pairs ──────────────────────────────────────────────────────────────────────

/**
 * @param {unknown} value
 * @param {string} what
 * @param {string} label
 * @returns {Vec3}
 */
function finiteTriple(value, what, label) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((x) => typeof x === 'number' && Number.isFinite(x))) {
    throw new GearParameterError(`${label}: ${what} must be three finite numbers, got ${JSON.stringify(value)}`)
  }
  return [value[0], value[1], value[2]]
}

/**
 * @param {unknown} frame
 * @param {string} label
 * @returns {ResolvedBevel['frame']}
 */
function resolveBevelFrame(frame, label) {
  if (frame === undefined) return undefined
  if (frame === null || typeof frame !== 'object' || Array.isArray(frame)) {
    throw new GearParameterError(`${label}: frame must be an object with an apexMm`)
  }
  const f = /** @type {Record<string, unknown>} */ (frame)
  const apexMm = finiteTriple(f.apexMm, 'frame.apexMm (millimetres)', label)
  const rotateDeg = f.rotateDeg === undefined ? /** @type {Vec3} */ ([0, 0, 0]) : finiteTriple(f.rotateDeg, 'frame.rotateDeg (degrees)', label)
  const phaseDeg = f.phaseDeg ?? 0
  if (typeof phaseDeg !== 'number' || !Number.isFinite(phaseDeg)) {
    throw new GearParameterError(`${label}: frame.phaseDeg must be a finite number of degrees, got ${String(phaseDeg)}`)
  }
  return { apexMm, rotateDeg, phaseDeg }
}

/**
 * Check one bevel gear's params (caps first, `./limits.js`) and derive its cone
 * (`./bevel.js`'s `bevelGearDimensions`, which refuses a crown gear by name).
 *
 * @param {unknown} gear
 * @param {string} label
 * @returns {ResolvedBevel}
 */
function resolveBevel(gear, label) {
  if (gear === null || typeof gear !== 'object' || Array.isArray(gear)) {
    throw new GearParameterError(`${label}: a bevel gear must be an object of params`)
  }
  const g = /** @type {Record<string, unknown>} */ (gear)
  checkGearLimits(g, { op: label, required: ['teeth', 'mateTeeth', 'moduleMm'], limits: BEVEL_LIMITS })
  const frame = resolveBevelFrame(g.frame, label)
  try {
    const dims = bevelGearDimensions(/** @type {any} */ (g))
    return { label, teeth: dims.teeth, moduleMm: dims.moduleMm, pressureAngleDeg: dims.pressureAngleDeg, dims, frame }
  } catch (error) {
    throw about(error, label)
  }
}

/**
 * @param {ResolvedBevel} A
 * @param {ResolvedBevel} B
 * @returns {MeshReason[]}
 */
function bevelReasons(A, B) {
  /** @type {MeshReason[]} */
  const out = profileReasons(/** @type {any} */ (A), /** @type {any} */ (B))
  const sigmaA = A.dims.shaftAngleDeg
  const sigmaB = B.dims.shaftAngleDeg
  if (Math.abs(sigmaA - sigmaB) > EPS) {
    out.push(
      reason(
        'shaft-angle-mismatch',
        `These bevel gears were cut for shafts ${fmt(sigmaA)}° and ${fmt(sigmaB)}° apart — a pair only meshes on the shaft angle both were cut for.`
      )
    )
    return out
  }
  const sumDeg = A.dims.pitchConeAngleDeg + B.dims.pitchConeAngleDeg
  if (Math.abs(sumDeg - sigmaA) > EPS) {
    out.push(
      reason(
        'cone-angle-sum',
        `Pitch cones of ${fmt(A.dims.pitchConeAngleDeg)}° and ${fmt(B.dims.pitchConeAngleDeg)}° add up to ${fmt(sumDeg)}°, not the ${fmt(sigmaA)}° between the shafts — each gear must be cut for the other's tooth count (${A.teeth}-tooth gear for ${A.dims.mateTeeth}, ${B.teeth}-tooth for ${B.dims.mateTeeth}).`
      )
    )
    return out
  }
  const lA = A.dims.coneDistanceMm
  const lB = B.dims.coneDistanceMm
  if (Math.abs(lA - lB) > EPS * Math.max(1, lA, lB)) {
    out.push(
      reason(
        'cone-distance-mismatch',
        `Cone distances of ${fmt(lA)} mm and ${fmt(lB)} mm differ — the cones have the right angles but different sizes, so the large ends cannot meet; each gear must be cut for the other's tooth count.`
      )
    )
  }
  return out
}

/**
 * Every reason two bevel gears will not mesh, each a code and one sentence the UI can show
 * verbatim; `[]` for a good pair. Checks module and pressure angle, that both were cut for
 * the same shaft angle (`'shaft-angle-mismatch'`), that their pitch cones add up to it
 * (`'cone-angle-sum'`), and that the cones are the same length (`'cone-distance-mismatch'`).
 *
 * @param {BevelMeshGear} a
 * @param {BevelMeshGear} b
 * @returns {MeshReason[]}
 * @throws {GearParameterError} for malformed or hostile params, and `./bevel.js`'s
 *   `BevelGearError` (`'crown-gear'`, `'shaft-angle'`, `'face-width'`) for a gear that cannot be
 *   built — never for a mismatch.
 */
export function bevelCompatibility(a, b) {
  return bevelReasons(resolveBevel(a, 'gear 1'), resolveBevel(b, 'gear 2'))
}

/**
 * Where bevel gear 2 goes to mesh with gear 1: its apex on gear 1's, its axis Σ from gear 1's
 * at `azimuthDeg` round it, turned to interleave the teeth (module doc). Gear 1 stays put.
 *
 * @param {BevelMeshGear} a Gear 1; its frame (default: apex at the origin, unturned) is kept.
 * @param {BevelMeshGear} b Gear 2; only its frame's apex is read, for `translateMm`.
 * @param {{ azimuthDeg?: number }} [options] Where round gear 1's axis the pitch cones touch,
 *   degrees CCW from its frame's local +X (before its own phase). Default 0.
 * @returns {BevelMeshPlacement}
 * @throws {GearParameterError | GearMeshError} as {@link bevelCompatibility}, plus a
 *   `GearMeshError` with the first error's code for a pair that cannot mesh.
 */
export function bevelMeshPlacement(a, b, options) {
  const A = resolveBevel(a, 'gear 1')
  const B = resolveBevel(b, 'gear 2')
  const azimuthDeg = /** @type {Record<string, unknown>} */ (options ?? {}).azimuthDeg ?? 0
  if (typeof azimuthDeg !== 'number' || !Number.isFinite(azimuthDeg)) {
    throw new GearParameterError(`azimuthDeg must be a finite number of degrees, got ${String(azimuthDeg)}`)
  }
  const problem = bevelReasons(A, B).find((r) => r.severity === 'error')
  if (problem) throw new GearMeshError(problem.message, problem.code)

  const fa = A.frame ?? { apexMm: /** @type {Vec3Mm} */ ([0, 0, 0]), rotateDeg: /** @type {Vec3} */ ([0, 0, 0]), phaseDeg: 0 }
  const fromMm = B.frame?.apexMm ?? fa.apexMm
  const shaftAngleDeg = A.dims.shaftAngleDeg
  const R = matMul(matMul(matFromEulerDeg(fa.rotateDeg), rotZ(azimuthDeg)), rotY(shaftAngleDeg))
  const uA = ((azimuthDeg - fa.phaseDeg) * A.teeth) / 360
  const pitchDeg = 360 / B.teeth
  const raw = (((180 - ((0.5 - uA) * 360) / B.teeth) % pitchDeg) + pitchDeg) % pitchDeg
  const phaseDeg = Math.abs(raw - pitchDeg) < EPS ? 0 : tidy(raw)
  return Object.freeze({
    apexMm: /** @type {Vec3Mm} */ ([...fa.apexMm]),
    translateMm: /** @type {Vec3Mm} */ ([0, 1, 2].map((i) => fa.apexMm[i] - fromMm[i])),
    rotateDeg: eulerDegFromMat(R),
    phaseDeg,
    axis: columnZ(R),
    shaftAngleDeg,
    pitchConeAnglesDeg: /** @type {[number, number]} */ ([A.dims.pitchConeAngleDeg, B.dims.pitchConeAngleDeg]),
    coneDistanceMm: A.dims.coneDistanceMm,
    ratio: -B.teeth / A.teeth,
  })
}
