/**
 * `src/sketch/`'s first module: the sketch entity model.
 *
 * Framework-free, per CLAUDE.md's Project Structure — no Vue, no DOM, no
 * three.js, and (unlike everything in `src/core/kernel/`) no `@jscad/modeling`
 * either. A sketch entity is 2D vector data on the working plane, not a solid:
 * it is never tessellated, never booleaned, and never reaches the geometry
 * kernel at all (see `src/core/document.js`'s sketch branch for why that
 * boundary is drawn here rather than inside the kernel adapter).
 *
 * Pure functions over plain values, mirroring `src/core/kernel/group.js`'s own
 * convention: nothing here holds state, and every function that "changes" an
 * entity returns a new one. That is not stylistic — the document log is
 * append-only and its records are immutable, so editing an endpoint means
 * appending a record that *supersedes* the old one, never rewriting it.
 *
 * ## Scope
 *
 * One entity type — a straight line segment (`TODO/ui-020`). Rectangle, circle
 * and arc are later tasks that extend this module; nothing here is shaped to
 * anticipate them beyond keeping the record's params plain JSON.
 *
 * ## Units and spaces
 *
 * Millimetres, on the Z=0 working plane, X then Y — the same plane
 * `src/render/pick.js` already projects a pointer onto, so a sketch point and a
 * placement drop point are literally the same measurement. The `Mm` suffix on
 * every field name is CLAUDE.md's "a raw number never crosses a module edge
 * without its space being obvious from the name".
 *
 * @module sketch/entity
 */

/**
 * The op string a line entity is recorded under.
 *
 * `document.js`'s fold routes on the `sketch.` **prefix**, so this constant and
 * that prefix are asserted against each other in this module's spec rather than
 * left to drift apart in two files.
 */
export const SKETCH_LINE_OP = 'sketch.line'

/** @typedef {[number, number]} Vec2Mm Millimetres on the working plane, X then Y. */

/**
 * @typedef {object} LineEntity
 * @property {string} id The entity's stable identity — a document lineage root
 *   id, so it survives an endpoint edit (see `sketchEntities()`).
 * @property {Vec2Mm} startMm
 * @property {Vec2Mm} endMm
 */

/**
 * Two finite millimetre numbers, or not.
 *
 * @param {unknown} value
 * @returns {value is Vec2Mm}
 */
function isVec2(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
}

/**
 * A line entity.
 *
 * @param {string} id
 * @param {Vec2Mm} startMm
 * @param {Vec2Mm} endMm
 * @returns {LineEntity}
 */
export function createLineEntity(id, startMm, endMm) {
  return { id, startMm: [startMm[0], startMm[1]], endMm: [endMm[0], endMm[1]] }
}

/**
 * A segment's length, in millimetres.
 *
 * Deliberately tolerant of the degenerate case rather than guarding against it:
 * a zero-length segment measures `0`, and *refusing to commit* one is the
 * interaction layer's job (see {@link isDegenerate}). A measurement function
 * that threw would push that decision into every caller.
 *
 * @param {Vec2Mm} startMm
 * @param {Vec2Mm} endMm
 * @returns {number} Millimetres, always ≥ 0.
 */
export function lengthOf(startMm, endMm) {
  return Math.hypot(endMm[0] - startMm[0], endMm[1] - startMm[1])
}

/**
 * Whether a drag never really moved — the Interaction model's explicit
 * degenerate case: "a zero-length release commits nothing".
 *
 * Takes an explicit tolerance rather than testing for exact equality, because
 * the caller's two points come from a *pointer*, and a tap on a touch screen
 * always wanders a fraction of a millimetre. The same reasoning, and the same
 * shape, as `Viewport.vue`'s existing `CLICK_SLOP_PX`.
 *
 * @param {Vec2Mm} startMm
 * @param {Vec2Mm} endMm
 * @param {number} toleranceMm
 * @returns {boolean}
 */
export function isDegenerate(startMm, endMm, toleranceMm) {
  return lengthOf(startMm, endMm) <= toleranceMm
}

/**
 * The same line with one endpoint moved — an endpoint-handle drag's result, and
 * a typed Inspector coordinate's result, which are required to be the same
 * mutation (`docs/decisions/interaction-model-qa.md` section 7's Q14).
 *
 * @param {LineEntity} entity
 * @param {'start' | 'end'} which
 * @param {Vec2Mm} pointMm
 * @returns {LineEntity} A **new** entity; `entity` is never mutated.
 */
export function moveEndpoint(entity, which, pointMm) {
  if (which !== 'start' && which !== 'end') {
    throw new Error(`moveEndpoint: unknown endpoint "${which}" — expected "start" or "end"`)
  }
  return createLineEntity(
    entity.id,
    which === 'start' ? pointMm : entity.startMm,
    which === 'end' ? pointMm : entity.endMm,
  )
}

/**
 * @typedef {object} LineParams
 * @property {Vec2Mm} start
 * @property {Vec2Mm} end
 */

/**
 * The `params` half of a `sketch.line` record — plain JSON, so a document
 * serialises and round-trips through `src/core/ndjson.js` with no special case.
 *
 * Defined here rather than inline at each call site so the writer
 * (`useSketchCommands`) and the reader ({@link lineFromParams}) cannot disagree
 * about the shape.
 *
 * @param {Vec2Mm} startMm
 * @param {Vec2Mm} endMm
 * @returns {LineParams}
 */
export function lineParams(startMm, endMm) {
  return { start: [startMm[0], startMm[1]], end: [endMm[0], endMm[1]] }
}

/**
 * Read a line entity back out of a record's params.
 *
 * **Validates rather than trusts**, and returns `null` instead of throwing: a
 * document can arrive from an untrusted URL (`src/core/replay.js`'s own "loud
 * locally, lenient remotely" reasoning), and one malformed sketch record must
 * not take the whole overlay down with it.
 *
 * @param {string} id
 * @param {LineParams | Record<string, unknown> | undefined} params
 * @returns {LineEntity | null}
 */
export function lineFromParams(id, params) {
  if (!params || typeof params !== 'object') return null
  const { start, end } = /** @type {any} */ (params)
  if (!isVec2(start) || !isVec2(end)) return null
  return createLineEntity(id, start, end)
}
