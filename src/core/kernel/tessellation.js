// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * How finely curved geometry is faceted — the design's **resolution** (`TODO/core-035`).
 *
 * This is WarpCad's equivalent of the `resolution` parameter every JSCAD V1 project
 * carried to set `CSG.defaultResolution2D/3D` before building. It matters for fit, not
 * only for looks: a tessellated circle has its vertices *on* the nominal circle and its
 * flats *inside* it, so a faceted hole prints tight and a faceted peg prints loose, by
 * `r · (1 − cos(π / n))` on each side — an error that grows with the diameter when the
 * segment count is fixed.
 *
 * ## Presets are chord tolerances, not segment counts
 *
 * Each preset caps the distance between the true circle and a flat, in millimetres, and
 * derives `n = ceil(π / acos(1 − tol / r))` from it, clamped to `[minSegments, 256]`.
 * The floor keeps a small hole round enough that a bolt does not catch on its facets;
 * the ceiling stops a Ø300 disc from handing the kernel a runaway triangle count.
 *
 * **One tuning over the spec's table** (decided at `/fix-todo` Step 2): `n` is then
 * rounded **up** to a multiple of 4. That keeps a vertex on each of ±X and ±Y, so a
 * cylinder's bounding box — what the dimension lines, Snap, Align and the Inspector's
 * size fields all read — stays exactly its nominal diameter at every preset. Without it
 * Normal gives a Ø40 cylinder 45 sides and a 39.95 mm-wide bounding box. Rounding up only
 * ever makes the facets smaller, so every tolerance still holds.
 *
 * ## `legacy`
 *
 * A document saved before this setting existed has no `resolution`, and reads as
 * `legacy`: a fixed 32 segments, exactly what every op used before — so nothing already
 * saved changes shape when it is reopened. A missing policy anywhere in the fold means
 * `legacy` too, which is what keeps every pre-`core-035` caller byte-identical.
 *
 * Pure functions, framework-free, no kernel import.
 *
 * @module core/kernel/tessellation
 */

/** The segment count every curve used before `core-035`, and still uses under `legacy`. */
export const LEGACY_SEGMENTS = 32

/** The ceiling for every preset. */
export const MAX_SEGMENTS = 256

/** What a brand-new document starts at. */
export const DEFAULT_RESOLUTION = 'normal'

/**
 * @typedef {object} ResolutionPreset
 * @property {string} label What the controls call it.
 * @property {number} toleranceMm Maximum distance from the true circle to a flat.
 * @property {number} minSegments The floor, for small radii.
 */

/** @type {Readonly<Record<'draft' | 'normal' | 'fine' | 'print', Readonly<ResolutionPreset>>>} */
export const RESOLUTION_PRESETS = Object.freeze({
  draft: Object.freeze({ label: 'Draft', toleranceMm: 0.1, minSegments: 12 }),
  normal: Object.freeze({ label: 'Normal', toleranceMm: 0.05, minSegments: 16 }),
  fine: Object.freeze({ label: 'Fine', toleranceMm: 0.02, minSegments: 24 }),
  print: Object.freeze({ label: 'Print', toleranceMm: 0.01, minSegments: 32 }),
})

/** Every resolution a document can carry, `legacy` first. */
export const RESOLUTION_IDS = Object.freeze(['legacy', 'draft', 'normal', 'fine', 'print'])

/** The presets a user can choose, coarse to fine — `legacy` is only ever inherited. */
export const CHOOSABLE_RESOLUTIONS = Object.freeze(['draft', 'normal', 'fine', 'print'])

/**
 * @typedef {object} TessellationPolicy
 * @property {string} id One of {@link RESOLUTION_IDS}.
 * @property {string} label
 * @property {number | null} toleranceMm `null` for `legacy`.
 * @property {number} minSegments
 * @property {number} maxSegments
 * @property {number | null} fixedSegments `legacy`'s 32; `null` for a tolerance preset.
 */

/** @type {Readonly<Record<string, Readonly<TessellationPolicy>>>} */
const POLICIES = Object.freeze({
  legacy: Object.freeze({
    id: 'legacy',
    label: 'Legacy',
    toleranceMm: null,
    minSegments: LEGACY_SEGMENTS,
    maxSegments: LEGACY_SEGMENTS,
    fixedSegments: LEGACY_SEGMENTS,
  }),
  ...Object.fromEntries(
    Object.entries(RESOLUTION_PRESETS).map(([id, preset]) => [
      id,
      Object.freeze({
        id,
        label: preset.label,
        toleranceMm: preset.toleranceMm,
        minSegments: preset.minSegments,
        maxSegments: MAX_SEGMENTS,
        fixedSegments: null,
      }),
    ])
  ),
})

/**
 * @param {unknown} value
 * @returns {value is string} Whether `value` is a resolution a document may carry.
 */
export function isResolution(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(POLICIES, value)
}

/**
 * The policy for a resolution id. One frozen object per id, for the lifetime of the
 * module — so the `core-031` fold cache can tell two policies apart by identity.
 *
 * @param {string} id
 * @returns {Readonly<TessellationPolicy>}
 * @throws {Error} For an id that is not a resolution, naming it.
 */
export function policyFor(id) {
  if (!isResolution(id)) {
    throw new Error(
      `unknown resolution "${String(id)}" — expected one of ${RESOLUTION_IDS.join(', ')}`
    )
  }
  return POLICIES[id]
}

/** The policy a fold uses when none is given: `legacy`, i.e. exactly the old behaviour. */
export const LEGACY_POLICY = POLICIES.legacy

/**
 * The largest gap between a circle of radius `radiusMm` and an inscribed `n`-gon's flat.
 *
 * @param {number} radiusMm
 * @param {number} segments
 * @returns {number} Millimetres.
 */
export function chordDeviationMm(radiusMm, segments) {
  return radiusMm * (1 - Math.cos(Math.PI / segments))
}

/**
 * How many segments a full circle of radius `radiusMm` gets under `policy`.
 *
 * Never NaN: a radius at or below the tolerance (where `1 − tol / r` would leave
 * `acos`'s domain, or put the answer below a triangle), zero, negative or NaN takes the
 * floor; an infinite one takes the ceiling.
 *
 * @param {number} radiusMm
 * @param {Readonly<TessellationPolicy> | null | undefined} policy `legacy` when absent.
 * @returns {number} A multiple of 4 in `[minSegments, maxSegments]` (or 32 under legacy).
 */
export function segmentsFor(radiusMm, policy) {
  const active = policy ?? LEGACY_POLICY
  if (active.fixedSegments !== null) return active.fixedSegments
  const tolerance = /** @type {number} */ (active.toleranceMm)
  if (radiusMm === Number.POSITIVE_INFINITY) return active.maxSegments
  if (!(radiusMm > tolerance)) return roundUpToFour(active.minSegments, active.maxSegments)
  const raw = Math.ceil(Math.PI / Math.acos(1 - tolerance / radiusMm))
  return roundUpToFour(Math.max(active.minSegments, raw), active.maxSegments)
}

/**
 * @param {number} segments
 * @param {number} ceiling
 * @returns {number}
 */
function roundUpToFour(segments, ceiling) {
  return Math.min(ceiling, Math.ceil(segments / 4) * 4)
}

/**
 * Slices across a fillet rim's quarter-circle profile (`modify.filletRim`): a quarter of
 * the full-circle count at the same radius, so the rim meets the same tolerance as a
 * cylinder of that radius would. `legacy` keeps the old 32 slices.
 *
 * @param {number} radiusMm Fillet radius; read unsigned (a negative one flares outward
 *   over the same arc).
 * @param {Readonly<TessellationPolicy> | null | undefined} policy
 * @returns {number} At least 2.
 */
export function rimSlicesFor(radiusMm, policy) {
  const active = policy ?? LEGACY_POLICY
  if (active.fixedSegments !== null) return active.fixedSegments
  return Math.max(2, segmentsFor(Math.abs(radiusMm), active) / 4)
}

/**
 * The most slices a twisted extrude takes per twisted run (TODO/core-042), whatever the
 * tolerance asks for — the same role {@link MAX_SEGMENTS} plays for a circle.
 */
export const MAX_TWIST_STEPS = 360

/**
 * Steps so that a point at `radiusMm`, turned by `twistRad` in straight chords, never
 * strays more than `toleranceMm` from its true arc: each step at most `2 acos(1 − tol / r)`.
 * Uncapped. A zero, NaN or within-tolerance radius, or no twist, needs one step.
 *
 * @param {number} twistRad Read unsigned.
 * @param {number} radiusMm
 * @param {number} toleranceMm
 * @returns {number}
 */
function twistStepsAt(twistRad, radiusMm, toleranceMm) {
  const twist = Math.abs(twistRad)
  if (!(twist > 0) || !(radiusMm > toleranceMm)) return 1
  if (radiusMm === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY
  return Math.max(1, Math.ceil(twist / (2 * Math.acos(1 - toleranceMm / radiusMm))))
}

/**
 * The fewest steps any document may give a twist of `twistRad` at `radiusMm`: what the
 * coarsest preset (Draft) needs. It is policy-independent on purpose — an explicit
 * `twistSteps` is checked against it, so a record valid at preview is valid at export.
 * **Uncapped**, so a caller can tell when even the floor is past {@link MAX_TWIST_STEPS}.
 *
 * @param {number} twistRad Read unsigned.
 * @param {number} radiusMm The profile's outermost radius.
 * @returns {number} At least 1.
 */
export function minTwistSteps(twistRad, radiusMm) {
  return twistStepsAt(twistRad, radiusMm, RESOLUTION_PRESETS.draft.toleranceMm)
}

/**
 * How many steps a twisted extrude of `twistRad` takes under `policy`: enough that the
 * outermost point (`radiusMm`) stays within the policy's tolerance of its helix, so a
 * gear previews coarse and exports fine (TODO/core-035). `legacy` turns by one of its
 * fixed segments (`360° / 32`) per step. Never below {@link minTwistSteps}; capped at
 * {@link MAX_TWIST_STEPS}.
 *
 * @param {number} twistRad Read unsigned.
 * @param {number} radiusMm The profile's outermost radius.
 * @param {Readonly<TessellationPolicy> | null | undefined} policy `legacy` when absent.
 * @returns {number} An integer in `[1, MAX_TWIST_STEPS]`.
 */
export function twistStepsFor(twistRad, radiusMm, policy) {
  const active = policy ?? LEGACY_POLICY
  const twist = Math.abs(twistRad)
  if (!(twist > 0)) return 1
  const steps =
    active.toleranceMm === null
      ? Math.ceil(twist / ((2 * Math.PI) / (active.fixedSegments ?? LEGACY_SEGMENTS)))
      : twistStepsAt(twist, radiusMm, active.toleranceMm)
  return Math.min(MAX_TWIST_STEPS, Math.max(1, steps, minTwistSteps(twist, radiusMm)))
}

/**
 * A resolution's display name: `Normal`, or `Legacy (32 segments)`.
 *
 * @param {string} id
 * @returns {string}
 */
export function resolutionLabel(id) {
  if (id === 'legacy') return `Legacy (${LEGACY_SEGMENTS} segments)`
  return policyFor(id).label
}

/**
 * The one-line hint beside each choice: what the preset means at a reference hole, e.g.
 * `Ø20 hole: 52 sides, ≤0.02 mm off`.
 *
 * @param {string} id
 * @param {number} [diameterMm] Reference diameter, default Ø20.
 * @returns {string}
 */
export function resolutionHint(id, diameterMm = 20) {
  const policy = policyFor(id)
  const sides = segmentsFor(diameterMm / 2, policy)
  const offMm = chordDeviationMm(diameterMm / 2, sides)
  const tolerance = policy.toleranceMm === null ? offMm : policy.toleranceMm
  return `Ø${diameterMm} hole: ${sides} sides, ≤${formatMm(tolerance)} mm off`
}

/**
 * @param {number} mm
 * @returns {string}
 */
function formatMm(mm) {
  return mm >= 0.1 ? mm.toFixed(2).replace(/0$/, '') : mm.toFixed(2)
}
