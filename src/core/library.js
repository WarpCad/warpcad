/**
 * The Library panel's catalogue, derived from the kernel registry.
 *
 * CLAUDE.md is explicit that "read the registry, don't hardcode a list" is the
 * right instinct *and* that it produces a broken UI unless the registry itself
 * encodes what the UI needs to act on. So the rows come from the registry's own
 * `primitive.*` entries and their `ui` metadata (label + default params), and this
 * module adds only the two things that are genuinely about placement rather than
 * about the op: the drop position, and the per-type instance name.
 *
 * That is what makes drag-place **one** mechanism parameterised by an op string
 * rather than seven near-identical hand-copies — adding an eighth primitive to the
 * registry adds its Library row, its ghost preview and its drop behaviour with no
 * change here or in any component.
 *
 * Framework-free (CLAUDE.md's Project Structure): the geometry maths that decides
 * where a dropped body sits lives here, not in a component.
 *
 * @module core/library
 */

import { evaluateOp } from './kernel/index.js'
import { boundsOf } from './kernel/group.js'
import { registry } from './kernel/registry.js'

/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */
/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {{ x: number, y: number }} PointMm A point on the working plane, in mm. */

/**
 * @typedef {object} LibraryRow
 * @property {string} op Registry key — the drag payload, and the whole parameter.
 * @property {string} label Human name, e.g. `"Cube"`.
 * @property {Record<string, any>} defaults Params a fresh instance is created with.
 * @property {0 | 1 | '2+'} operandCount Always `0` here: these create from nothing.
 */

/**
 * Ordered so the rows read the way `Initial design.md` §6's Base creation rows do
 * — the primitives a user reaches for most, first — rather than in whatever order
 * `Object.keys` happens to return.
 */
const ROW_ORDER = Object.freeze([
  'primitive.cuboid',
  'primitive.cylinder',
  'primitive.cone',
  'primitive.hexagon',
  'primitive.triangle',
  'primitive.tube',
  'primitive.sphere',
])

/**
 * @param {Readonly<Record<string, import('./kernel/registry.js').RegistryEntry>>} ops
 * @returns {LibraryRow[]}
 */
function buildRows(ops) {
  const keys = Object.keys(ops).filter((op) => op.startsWith('primitive.'))
  keys.sort((a, b) => {
    const rankA = ROW_ORDER.indexOf(a)
    const rankB = ROW_ORDER.indexOf(b)
    // An op the order list has never heard of sorts after the known ones rather
    // than silently vanishing — a new registry entry should show up in the panel.
    return (rankA === -1 ? ROW_ORDER.length : rankA) - (rankB === -1 ? ROW_ORDER.length : rankB)
  })
  return keys.map((op) => {
    const entry = ops[op]
    if (!entry.ui) {
      throw new Error(
        `${op}: a primitive.* registry entry needs \`ui\` metadata (label + defaults) ` +
          'before the Library panel can offer it as a row'
      )
    }
    return Object.freeze({
      op,
      label: entry.ui.label,
      defaults: entry.ui.defaults,
      operandCount: entry.operandCount,
    })
  })
}

/**
 * The "Primitives" section of the Library panel.
 *
 * @type {readonly LibraryRow[]}
 */
export const PRIMITIVE_LIBRARY = Object.freeze(buildRows(registry))

/**
 * Look a row up by op.
 *
 * @param {string} op
 * @returns {LibraryRow}
 */
export function libraryRow(op) {
  const row = PRIMITIVE_LIBRARY.find((candidate) => candidate.op === op)
  if (!row) throw new Error(`${op} is not a Library row — nothing can be dragged from it`)
  return row
}

/**
 * Millimetre centre that leaves a primitive resting **on** the working plane
 * rather than half-buried in it.
 *
 * Every primitive's `center` param is its bounding-box centre, so dropping at the
 * grid's Z=0 with `center.z = 0` would sink half the solid below the grid — which
 * reads as a rendering bug the first time anyone drops a cube. The offset is
 * measured from the built solid rather than derived per primitive, so it is
 * correct for all seven without a per-type branch (and for the eighth).
 *
 * @param {string} op
 * @param {Record<string, any>} params
 * @param {PointMm} pointMm Where on the plane the pointer released.
 * @returns {[number, number, number]}
 */
export function restingCenter(op, params, pointMm) {
  const probe = evaluateOp(op, { ...params, center: [0, 0, 0] })
  const [min] = boundsOf(probe)
  return [pointMm.x, pointMm.y, -min[2]]
}

/**
 * Params for an instance of a row dropped at a point.
 *
 * The drop position goes straight into the primitive's own `center` param: every
 * `primitive.*` entry already takes one, so a placed body is **one** record, not a
 * primitive plus a trailing `transform.translate`. (TODO/ui-010 asked for that
 * check before assuming a second record was needed — this is the answer.)
 *
 * The drag ghost and the committed record both come through here, so the preview
 * a user drags around is built from exactly the params the drop will commit.
 *
 * @param {string} op
 * @param {PointMm} pointMm
 * @param {Record<string, any>} [overrides]
 * @returns {Record<string, any>}
 */
export function paramsForDrop(op, pointMm, overrides = {}) {
  const params = { ...libraryRow(op).defaults, ...overrides }
  return { ...params, center: restingCenter(op, params, pointMm) }
}

/**
 * Build the op record one drop commits.
 *
 * @param {string} op Registry key from the dragged row.
 * @param {PointMm} pointMm Drop position on the working plane.
 * @param {WarpDocument} document Supplies the id and the per-type instance number.
 * @param {Record<string, any>} [overrides] Extra params, e.g. a non-default size.
 * @returns {OpRecord}
 */
export function recordForDrop(op, pointMm, document, overrides = {}) {
  const row = libraryRow(op)
  return {
    id: document.nextId(op.replace('primitive.', '')),
    op,
    name: document.nextName(row.label),
    params: paramsForDrop(op, pointMm, overrides),
  }
}
