/**
 * Human labels for a timeline row (`TODO/ui-032`).
 *
 * `src/core/document.js` already labels a record — but deliberately *shallowly*,
 * for the Undo tooltip, and its own module doc draws the line this file sits on
 * the other side of:
 *
 * > `ui-032`'s timeline rows want the richer `Chamfer Top (+Z) 5 mm on Cube 1`,
 * > which reads params and belongs with the panel that shows them, not here.
 *
 * "Belongs with the panel" is where it belongs *conceptually*; CLAUDE.md's
 * Conventions put the code in `src/core/` all the same — "geometry logic belongs
 * in `src/core/`, not in components", and formatting six op families' params into
 * millimetres and face names is exactly the kind of thing that rots when it lives
 * in a `.vue` file. So: pure, framework-free, and unit-tested against the exact
 * strings `TODO/ACCEPTANCE.md` scenario 12 reads off the screen.
 *
 * Two rules the tests pin down and the panel depends on:
 *
 * - **A label never throws.** The list renders suppressed, inactive and *broken*
 *   rows too, and a label that threw on a malformed record would take the whole
 *   panel down with it — strictly worse than an ugly row, and precisely when the
 *   user most needs to see what went wrong.
 * - **A subject is resolved back to the body's name, never the acting record's
 *   id.** A transform or a param-edit record carries no name of its own (see
 *   `src/core/transform.js` on why), so the walk back along `supersedes` is the
 *   only thing standing between the user and a row that reads `Move move-7`.
 *
 * @module core/timelineLabel
 */

import { RIM_ORIENTATIONS } from './kernel/fillet.js'
import { colorIntToCssHex } from './colorOverride.js'

/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */

/**
 * The six rim faces in plain language — never "edge", per `ui-027`'s labelling
 * requirement, since these ops round or bevel a whole *face's* rim.
 *
 * Canonical here rather than in `OperationsToolbar.vue`, which is where they
 * were first written: the History panel has to render the same words for a past
 * chamfer that the popover offered when it was created, and two copies of this
 * table would drift into a row saying `Top (+Z)` beside a form saying `z+`.
 *
 * @type {ReadonlyArray<{ value: string, label: string }>}
 */
export const RIM_FACE_OPTIONS = Object.freeze([
  { value: 'z+', label: 'Top (+Z)' },
  { value: 'z-', label: 'Bottom (−Z)' },
  { value: 'y+', label: 'Front (+Y)' },
  { value: 'y-', label: 'Back (−Y)' },
  { value: 'x+', label: 'Right (+X)' },
  { value: 'x-', label: 'Left (−X)' },
])

// A label missing for a real orientation would silently print the raw `z-` in
// the panel. Cheap to assert once at module load; impossible to notice later.
/* c8 ignore next 3 */
if (RIM_FACE_OPTIONS.length !== RIM_ORIENTATIONS.length) {
  throw new Error('timelineLabel: RIM_FACE_OPTIONS must cover every RIM_ORIENTATIONS value')
}

/** @type {Readonly<Record<string, string>>} */
const FACE_LABELS = Object.freeze(
  Object.fromEntries(RIM_FACE_OPTIONS.map((option) => [option.value, option.label]))
)

/**
 * Verb per op — the same shallow table `document.js` keeps for the Undo tooltip,
 * repeated rather than exported from there on purpose: that one is private to a
 * framework-free module whose contract is "name the action", and this one is
 * free to grow richer per-op formatting (below) without changing what a button
 * says it will do.
 */
const VERBS = Object.freeze({
  'transform.translate': 'Move',
  'transform.rotate': 'Rotate',
  'boolean.union': 'Union',
  'boolean.subtract': 'Subtract',
  'boolean.intersect': 'Intersect',
  'group.assemble': 'Group',
  'group.snap': 'Snap',
  'group.align': 'Align',
  'modify.filletRim': 'Fillet',
  'modify.chamferRim': 'Chamfer',
  'modify.enlarge': 'Resize',
  'modify.fit': 'Fit',
  'modify.bisect': 'Bisect',
})

/** Ops whose row reads `<Verb> <face> <radius> mm on <subject>`. */
const RIM_OPS = new Set(['modify.filletRim', 'modify.chamferRim'])

const SKETCH_OP_PREFIX = 'sketch.'

/**
 * A millimetre value as a user would write it: `5`, not `5.0`; `2.5`, not
 * `2.50000001`.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function formatMm(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '?'
  // Three decimals is past anything a rim radius field offers and short of
  // floating-point noise; `Number` then drops the trailing zeros.
  return String(Number(value.toFixed(3)))
}

/**
 * Map every record id to the **body name** a user would call it — its own
 * `name`, or the nearest named ancestor along `supersedes`.
 *
 * Built once per render of the list rather than walked per row: a long log
 * walked per row is quadratic, and the panel re-derives this on every version
 * bump.
 *
 * @param {readonly OpRecord[]} records
 * @returns {Map<string, string>} Ids with no resolvable name are simply absent,
 *   so a caller can tell "unnamed" from "named the empty string".
 */
export function buildNameIndex(records) {
  /** @type {Map<string, OpRecord>} */
  const byId = new Map()
  for (const record of records ?? []) {
    if (record && typeof record.id === 'string') byId.set(record.id, record)
  }

  /** @type {Map<string, string>} */
  const names = new Map()
  for (const [id, record] of byId) {
    // Cycle-guarded: a malformed document must give a short answer, not hang
    // the render loop. Same defence `document.js`'s `displayNameOf` takes.
    const seen = new Set()
    let cursor = /** @type {OpRecord | undefined} */ (record)
    let cursorId = id
    while (cursor !== undefined && !seen.has(cursorId)) {
      seen.add(cursorId)
      if (typeof cursor.name === 'string' && cursor.name.length > 0) {
        names.set(id, cursor.name)
        break
      }
      if (typeof cursor.supersedes !== 'string') break
      cursorId = cursor.supersedes
      cursor = byId.get(cursorId)
    }
  }
  return names
}

/**
 * The name to print for a reference, or `undefined` when nothing names it.
 *
 * @param {unknown} ref A bare id, or a `{ id, pieces }` sub-part address
 *   (`core-024`) — the two shapes an operand can take.
 * @param {Map<string, string>} names
 * @returns {string | undefined}
 */
function nameOf(ref, names) {
  if (typeof ref === 'string') return names.get(ref)
  if (ref && typeof ref === 'object' && typeof (/** @type {any} */ (ref).id) === 'string') {
    return names.get(/** @type {any} */ (ref).id)
  }
  return undefined
}

/**
 * One row's label — the string the History list actually shows.
 *
 * @param {OpRecord | undefined} record
 * @param {Map<string, string>} names From {@link buildNameIndex}.
 * @returns {string} Always a non-empty string; see the module note on why this
 *   never throws.
 */
export function describeRow(record, names) {
  if (!record || typeof record.op !== 'string' || record.op.length === 0) return 'Unknown step'

  const index = names ?? new Map()
  const params = record.params ?? {}
  const subject = nameOf(record.supersedes ?? record.target, index)
  const verb = /** @type {Record<string, string>} */ (VERBS)[record.op]

  // A boolean or a group: its geometry *is* its operands, so the row names them
  // rather than pretending one of them is the subject — the same reasoning
  // `document.js`'s consumption note gives for not inheriting an operand's op.
  if (verb !== undefined && record.consumes !== undefined) {
    const operands = (record.operands ?? record.consumes)
      .map((ref) => nameOf(ref, index))
      .filter((name) => name !== undefined)
    return operands.length > 0 ? `${verb} ${operands.join(' + ')}` : verb
  }

  // A colour step (`TODO/ui-037`): which colour, on which part, of what — or a
  // reset, which has no colour to print. Built here rather than from the verb
  // table because the interesting part of the row is the value, as with a rim op.
  if (record.op === 'style.recolor') {
    const on = subject === undefined ? '' : ` on ${subject}`
    if (record.colorOverride === null) return `Reset color${on}`
    const part = typeof record.subPart === 'string' ? `${record.subPart} ` : ''
    const value = typeof record.colorOverride === 'number' ? colorIntToCssHex(record.colorOverride) : '?'
    return `Color ${part}${value}${on}`
  }

  if (RIM_OPS.has(record.op)) {
    const face = FACE_LABELS[params.orientation] ?? FACE_LABELS['z+']
    const size = `${face} ${formatMm(params.radius)} mm`
    return subject === undefined ? `${verb} ${size}` : `${verb} ${size} on ${subject}`
  }

  if (verb !== undefined) return subject === undefined ? verb : `${verb} ${subject}`

  // No verb: this is a *creation* op. Either it created the body, or — since
  // `ui-029` — it rebuilt one from edited params, reusing the creation op over
  // the lineage's terminal. Calling the second one "placed" would put two
  // placement rows in the list for one body, which is the confusion §13's row
  // text exists to prevent.
  const drawn = record.op.startsWith(SKETCH_OP_PREFIX)
  if (record.supersedes !== undefined) {
    return subject === undefined ? 'Edited' : `${subject} — edited`
  }
  const noun = record.name ?? record.id ?? record.op
  return `${noun} — ${drawn ? 'drawn' : 'placed'}`
}
