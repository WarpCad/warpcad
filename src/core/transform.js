/**
 * Moving and turning a body: the one place either mutation is built.
 *
 * ## Why this is one module and not two handlers
 *
 * `TODO/ui-012` has two triggers for the same mutation — a pointer-drag on a
 * gizmo handle, and a typed value in the Inspector's Transform section — and
 * `docs/decisions/interaction-model-qa.md` control 4 requires that "either path
 * results in the same underlying mutation". Two handlers each building their own
 * record is exactly how those two paths drift apart, which is the trap
 * `render-001` avoided by keeping one camera model behind a gesture and a button,
 * and `ui-010` avoided by building the drag ghost and the committed record from
 * one `paramsForDrop`. So both triggers call the builders here, and neither knows
 * how a transform record is shaped.
 *
 * Framework-free, per CLAUDE.md's Project Structure: no Vue, no DOM, no three.js.
 * `src/composables/useTransformCommands.js` is the thin reactive adapter that
 * hands these records to the document store.
 *
 * ## Absolute state on a relative record
 *
 * Both ops here are **deltas** — `transform.translate` takes a vector, and
 * `transform.rotate` takes angles — because that is what the kernel does and what
 * a drag naturally produces. But the Inspector shows **absolute** values, and a
 * typed field is an absolute target. The conversion happens here, against the
 * body's current evaluated state, so a component never subtracts one position
 * from another.
 *
 * Rotation additionally has nowhere to be *read back* from: a rotated solid's
 * polygons carry no memory of the angle that produced them, and re-deriving one
 * from geometry is ill-posed. So every transform record built here carries the
 * body's resulting **absolute** rotation in `params.rotation`, and
 * `src/core/document.js` surfaces the terminal record's copy as
 * `Body.rotationDeg`. Every record carries it, including translations — a move
 * after a turn must not silently reset the Inspector's Rotation fields to zero.
 *
 * That carried value is the **composition** of the body's deltas, not their sum
 * (`TODO/core-004`): `transform.rotate` applies each delta about world axes on
 * top of whatever the solid already is, and rotations do not commute, so adding
 * them described a body's orientation faithfully only for a single-axis history
 * or one applied X-then-Y-then-Z. `src/core/rotation.js` owns that arithmetic —
 * including why the carried value stays three degree numbers rather than
 * becoming a quaternion — and both builders below go through it, so the drag path
 * and the typed path cannot compose differently from each other.
 *
 * ## Why transform records are unnamed
 *
 * A record with a `name` is added to the scene group's `names` list, which
 * `src/core/kernel/group.js` does **not** deduplicate. A superseding record
 * reusing its predecessor's name would therefore make `combine()` union a body
 * with itself. `document.bodies()` — the actual render path — does not go through
 * `combine()`, so nothing here trips that today, but leaving these records
 * unnamed means nothing here can start to. See `TROUBLESHOOTING.md`.
 *
 * @module core/transform
 */

import { boundsOf } from './kernel/group.js'
import { composeDeg, relativeDeg } from './rotation.js'

/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {import('./document.js').Body} Body */
/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */
/** @typedef {[number, number, number]} Vec3Mm */
/** @typedef {[number, number, number]} Vec3Deg */

/**
 * Find a body by its logical (lineage root) id, or fail by name.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId
 * @returns {Body}
 */
function bodyOf(document, bodyId) {
  const body = document.bodies().find((candidate) => candidate.id === bodyId)
  if (!body) throw new Error(`transform: no body "${bodyId}" in this document`)
  return body
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {[number, number, number]}
 */
function requireVec3(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) {
    throw new Error(`transform: ${label} must be three finite numbers, got ${JSON.stringify(value)}`)
  }
  return [value[0], value[1], value[2]]
}

/**
 * Where a body actually is: the bounding-box centre of its **evaluated**
 * geometry, not its creation record's `center` param.
 *
 * The difference is not cosmetic. `ui-010` stores a dropped primitive's position
 * in its own `center` param, so a body that has since been moved by a
 * `transform.translate` has a `center` that no longer says where it is at all —
 * and a cylinder resting on the grid has a `center.z` of half its height. This is
 * the same measurement `src/core/inspector.js` shows in the Transform section, so
 * a typed field and this function can never disagree about the starting point.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId Lineage root id.
 * @returns {Vec3Mm}
 */
export function positionOf(document, bodyId) {
  const [min, max] = boundsOf(bodyOf(document, bodyId).geometry)
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}

/**
 * A body's absolute rotation in degrees, as carried on its terminal record.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId Lineage root id.
 * @returns {Vec3Deg}
 */
export function rotationOf(document, bodyId) {
  const { rotationDeg } = bodyOf(document, bodyId)
  return [rotationDeg[0], rotationDeg[1], rotationDeg[2]]
}

/**
 * The id a new transform record must target: the lineage's current terminal.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId
 * @returns {string}
 */
function currentIdOf(document, bodyId) {
  const currentId = document.currentIdOf(bodyId)
  if (currentId === undefined) throw new Error(`transform: no record "${bodyId}" in this document`)
  return currentId
}

/**
 * Move a body by a millimetre delta.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId Lineage root id — the body's stable identity.
 * @param {Vec3Mm} deltaMm
 * @returns {OpRecord} Append it through the command layer; nothing is mutated here.
 */
export function translateRecord(document, bodyId, deltaMm) {
  const vector = requireVec3(deltaMm, 'a translation')
  const currentId = currentIdOf(document, bodyId)
  return {
    id: document.nextId(`${bodyId}-move`),
    op: 'transform.translate',
    target: currentId,
    supersedes: currentId,
    params: { vector, rotation: rotationOf(document, bodyId) },
  }
}

/**
 * Turn a body by a degree delta, about its own centre.
 *
 * About its own centre, not the world origin: a body sitting 300 mm out would
 * otherwise swing across the scene rather than turning on the spot, which is
 * never what dragging a rotate ring means. The centre is baked into the record's
 * params so the document replays identically later, when the body may be
 * somewhere else entirely.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId Lineage root id.
 * @param {Vec3Deg} deltaDeg
 * @returns {OpRecord}
 */
export function rotateRecord(document, bodyId, deltaDeg) {
  const angles = requireVec3(deltaDeg, 'a rotation')
  const currentId = currentIdOf(document, bodyId)
  const current = rotationOf(document, bodyId)
  return {
    id: document.nextId(`${bodyId}-turn`),
    op: 'transform.rotate',
    target: currentId,
    supersedes: currentId,
    params: {
      angles,
      center: positionOf(document, bodyId),
      // Composed, not added (`TODO/core-004`). `transform.rotate` turns the solid
      // about world axes on top of whatever it already is, so the body's true
      // orientation after this record is `R(angles)·R(current)` — and rotations
      // do not commute, so a running sum only agreed with that for a single-axis
      // history or one applied X-then-Y-then-Z. See `src/core/rotation.js` for
      // why the carried value stays three degree numbers rather than becoming a
      // quaternion.
      rotation: composeDeg(angles, current),
    },
  }
}

/**
 * Move a body so its centre lands on an absolute millimetre position — the
 * Inspector's typed-Position path, expressed as the same delta record a drag
 * produces.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId
 * @param {Vec3Mm} targetMm
 * @returns {OpRecord}
 */
export function moveToRecord(document, bodyId, targetMm) {
  const target = requireVec3(targetMm, 'a position')
  const current = positionOf(document, bodyId)
  return translateRecord(document, bodyId, [
    target[0] - current[0],
    target[1] - current[1],
    target[2] - current[2],
  ])
}

/**
 * Turn a body to an absolute rotation — the Inspector's typed-Rotation path.
 *
 * The delta is the *relative* rotation `R(target)·R(current)⁻¹`, not the per-axis
 * difference `target − current` (`TODO/core-004`). Subtracting was only ever the
 * right inverse of adding; now that {@link rotateRecord} composes, subtracting
 * would land the solid somewhere other than the typed value after any
 * out-of-order history. The two paths have to stay exact inverses of each other,
 * or a typed field and a ring drag stop being the same mutation — which is the
 * whole premise of this module.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId
 * @param {Vec3Deg} targetDeg
 * @returns {OpRecord}
 */
export function rotateToRecord(document, bodyId, targetDeg) {
  const target = requireVec3(targetDeg, 'a rotation')
  const current = rotationOf(document, bodyId)
  return rotateRecord(document, bodyId, relativeDeg(target, current))
}

/**
 * Replace one component of a vector, leaving the others alone — what editing a
 * single Position or Rotation field means.
 *
 * @param {Vec3Mm | Vec3Deg} vector
 * @param {number} axisIndex 0 | 1 | 2.
 * @param {number} value
 * @returns {[number, number, number]}
 */
export function withAxis(vector, axisIndex, value) {
  /** @type {[number, number, number]} */
  const next = [vector[0], vector[1], vector[2]]
  next[axisIndex] = value
  return next
}
