/**
 * The geometry kernel adapter's public entry point.
 *
 * Everything outside `src/core/kernel/` talks to the kernel through this module and
 * never imports `@jscad/modeling` directly — that indirection is what keeps the
 * kernel swappable if the Library-decisions health check ever has to revisit it
 * (`CLAUDE.md`, Project Structure).
 *
 * What lives here is the **fold**: `evaluate(records)` replays an ordered array of
 * plain-JSON op records into geometry, exactly as `Initial design.md` §3 describes,
 * and it is the same fold a composite recipe's expansion replays through (§4). That
 * sameness is the load-bearing property of the composite/native split — a
 * `hardware.bolt` line and the eleven primitive/transform/boolean records it expands
 * into are not two evaluation paths, they are one path called twice.
 *
 * This module is framework-free and synchronous. The worker RPC that keeps kernel
 * work off the main thread (`CLAUDE.md`, Architecture) wraps this; it is not built
 * yet and is deliberately not assumed by anything here.
 *
 * @module core/kernel
 */

import { add, createGroup, isGroup, toGeom3 } from './group.js'
import { boltSpecs } from './tables/bolt-specs.js'
import { nutSpecs } from './tables/nut-specs.js'
import { washerSpecs } from './tables/washer-specs.js'
import { FIT_CLEARANCE_MM } from './tables/fit-clearances.js'
import { assertOperandCount, getEntry, registry } from './registry.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./group.js').Group} Group */
/** @typedef {import('./registry.js').OpRecord} OpRecord */
/** @typedef {import('./registry.js').RegistryEntry} RegistryEntry */

/**
 * @typedef {object} EvaluateOptions
 * @property {Readonly<Record<string, RegistryEntry>>} [registry] Op catalogue;
 *   defaults to the real one.
 * @property {Record<string, any>} [tables] Size tables handed to composite recipes.
 * @property {string} [name] Label for the resulting group, used in error messages.
 * @property {{ byId?: Map<string, Geom3 | Group>, group?: Group }} [initial] Prior
 *   fold state to continue from — lets a caller (e.g. `src/core/replay.js`'s
 *   per-action document fold) evaluate one more record against ids an earlier
 *   `evaluate` call already produced, without re-running the whole history. Copied,
 *   never mutated in place, so the caller's own `byId`/`group` stay untouched.
 *   Applies to *these* records only — a composite record's recipe always expands
 *   against an empty fold, never against this scene (TODO/core-020).
 */

/**
 * @typedef {object} EvaluateResult
 * @property {Group} group Named results, in document order.
 * @property {Map<string, Geom3 | Group>} byId Every record's value, by its `id`.
 */

/** Size tables every composite recipe can read. */
const DEFAULT_TABLES = Object.freeze({ boltSpecs, nutSpecs, washerSpecs, FIT_CLEARANCE_MM })

/**
 * Normalise one `target`/`operands` entry to `{ id, pieces }`.
 *
 * A reference is either a bare id — every op's shape, unchanged since `core-001` —
 * or `{ id, pieces }`, which names a subset of that record's parts (TODO/core-013).
 * `pieces` reads the same on both sides of a `group.*` op: *measure using only these
 * named parts*. Which side it is decides what that measurement then does — the
 * moving group still travels as a whole, the reference never moves at all — but
 * that asymmetry belongs to the op, not to the address.
 *
 * V1 spelled the reference side `hinge.parts.body`, and the dot-path string
 * `'hinge.body'` was the obvious transcription of it. It was rejected: every id
 * lookup in this fold (`byId.get`, the duplicate-id check) would have to special-case
 * a `.`-delimited string, which is a change to the shared path for the sake of two
 * ops — and ids are user-supplied, so a legitimate id containing a dot would become
 * unaddressable.
 *
 * @param {unknown} ref
 * @param {string} op Named in the error, so a bad record says which line it is.
 * @returns {{ id: string, pieces?: string }}
 */
function normalizeRef(ref, op) {
  if (typeof ref === 'string') return { id: ref }
  if (ref !== null && typeof ref === 'object') {
    const { id, pieces } = /** @type {{ id?: unknown, pieces?: unknown }} */ (ref)
    if (typeof id === 'string' && id.length > 0) {
      if (pieces !== undefined && typeof pieces !== 'string') {
        throw new Error(
          `${op}: operand "${id}" has a non-string \`pieces\` — it must be a ` +
            `comma-separated part name list, e.g. "head" or "head,thread"`
        )
      }
      return pieces === undefined ? { id } : { id, pieces }
    }
  }
  throw new Error(
    `${op}: operand reference must be an id or { id, pieces }, got ${JSON.stringify(ref)}`
  )
}

/**
 * Fold op records into geometry.
 *
 * A record's value is bound to its `id` and can be referenced by later records; a
 * record with a `name` also becomes a part of the returned group. A composite op's
 * value is the `Group` its expansion produced, which collapses to geometry via
 * `combine` the moment something consumes it as an operand — the same implicit
 * coercion `jscad-utils` did when a `Group` was handed to something wanting a solid.
 *
 * @param {readonly OpRecord[]} records
 * @param {EvaluateOptions} [options]
 * @returns {EvaluateResult}
 */
export function evaluate(records, options = {}) {
  const ops = options.registry ?? registry
  const tables = options.tables ?? DEFAULT_TABLES
  /** @type {Map<string, Geom3 | Group>} */
  const byId = new Map(options.initial?.byId ?? [])
  let group = options.initial?.group ?? createGroup(options.name ?? '')

  for (const record of records) {
    const entry = ops[record.op]
    if (!entry) throw new Error(`unknown op "${record.op}" — not in the kernel registry`)

    const inputRefs = [
      ...(record.target === undefined || record.target === null ? [] : [record.target]),
      ...(record.operands ?? []),
    ].map((ref) => normalizeRef(ref, record.op))
    assertOperandCount(record.op, inputRefs.length, ops)

    // Almost every op is handed flat `Geom3`, and must be: a boolean or a transform
    // has no use for a composite's part breakdown and would have to collapse it
    // anyway. The two `group.*` ops (TODO/core-013) are the exception — snapping a
    // bolt *by its head* needs the head, and the answer has to keep the thread and
    // tap so the next op can still name them — so an entry may declare
    // `rawOperands` and receive {@link ResolvedOperand}s instead. The array is typed
    // loosely here because its element type is the entry's choice, not the fold's;
    // each raw op narrows it, the same way `profile.extrudeLinear` narrows a geom2.
    const wantsRaw = entry.rawOperands === true
    /** @type {any[]} */
    const inputs = inputRefs.map((ref) => {
      const resolved = byId.get(ref.id)
      if (resolved === undefined) {
        throw new Error(
          `${record.op}: operand "${ref.id}" has not been evaluated ` +
            `(known ids: ${[...byId.keys()].join(',') || 'none'})`
        )
      }
      if (!wantsRaw) {
        if (ref.pieces !== undefined) {
          // Dropping the piece name silently would subtract the whole bolt while the
          // record plainly says `tap` — wrong geometry with no error, which is the
          // exact failure class this project has already shipped twice.
          throw new Error(
            `${record.op}: operand "${ref.id}" names pieces ("${ref.pieces}"), but ` +
              `${record.op} consumes whole solids — only group.snap/group.align can ` +
              `address a sub-part`
          )
        }
        return toGeom3(resolved)
      }
      if (ref.pieces !== undefined && !isGroup(resolved)) {
        throw new Error(
          `${record.op}: operand "${ref.id}" names pieces ("${ref.pieces}") but is a ` +
            `single solid, not a group — only a composite item (a hardware.* or kit.* ` +
            `line) has named parts to address`
        )
      }
      return { value: resolved, pieces: ref.pieces }
    })

    /** @type {Geom3 | Group} */
    let value
    if (entry.kind === 'composite') {
      if (!entry.recipe) throw new Error(`${record.op}: composite entry has no recipe`)
      // Only `registry` and `tables` cross into the expansion — deliberately *not*
      // `options.initial`, and so deliberately not `...options` (TODO/core-020).
      // A recipe is a closed definition: its records address its own ids and
      // assemble into its own group. Spreading the caller's options carried
      // `initial` in, and since `initial.group` is what this fold seeds `group`
      // from, the expansion assembled into the *scene* group instead of a fresh
      // one — so a bolt appended after two bodies came back owning them as parts,
      // and spanning them. That never showed in a batch `evaluate([...])`, where
      // no caller passes `initial`; it appeared only on the incremental path
      // every document append takes (`src/core/replay.js`'s applyAction).
      value = evaluate(entry.recipe(record.params ?? {}, tables), {
        registry: ops,
        tables,
        name: record.op,
      }).group
    } else {
      if (!entry.build) throw new Error(`${record.op}: native entry has no build function`)
      // A `profile.*` op returns a flat `geom2` rather than a solid (TODO/core-012).
      // Such a value only ever transits the fold as an *unnamed* intermediate inside
      // a composite recipe's own nested `evaluate` below — whose `byId` is discarded,
      // only its `group` escaping — and a group is built from `name`d records alone,
      // every one of which is a solid. So the fold's public types stay solid-only and
      // this is the one place the wider possibility is acknowledged.
      // A `group.*` op hands back the `Group` it was given, parts intact — that is
      // what lets V1's `.snap(...).snap(...)` chain survive the fold as two records.
      value = /** @type {Geom3 | Group} */ (entry.build({ params: record.params ?? {}, inputs }))
    }

    if (record.id !== undefined) {
      if (byId.has(record.id)) {
        throw new Error(`duplicate record id "${record.id}" — ids must be unique within a fold`)
      }
      byId.set(record.id, value)
    }

    if (record.name) {
      group = add(group, value, record.name, { hidden: record.hidden === true })
    }
  }

  return { group, byId }
}

/**
 * Evaluate a single op the way a document line would, without building a record array
 * by hand. A native op yields geometry; a composite op yields its `Group`.
 *
 * @param {string} op
 * @param {Record<string, any>} [params]
 * @param {EvaluateOptions} [options]
 * @returns {Geom3 | Group}
 */
export function evaluateOp(op, params = {}, options = {}) {
  const { byId } = evaluate([{ id: op, op, params }], options)
  const value = byId.get(op)
  if (value === undefined) throw new Error(`${op}: produced no value`)
  return value
}

/**
 * The op records a composite op expands into, without evaluating them.
 *
 * This is the introspection §4 promises: a composite library item's definition can be
 * dumped, diffed and reviewed as plain JSON — by a human, or by the AI partner, which
 * can read a bolt's definition in the same vocabulary as the rest of the document
 * without understanding `@jscad/modeling` call semantics at all.
 *
 * @param {string} op
 * @param {Record<string, any>} [params]
 * @param {EvaluateOptions} [options]
 * @returns {OpRecord[]}
 */
export function expand(op, params = {}, options = {}) {
  const entry = getEntry(op)
  if (entry.kind !== 'composite' || !entry.recipe) {
    throw new Error(`${op} is a native op — it has no recipe to expand`)
  }
  return entry.recipe(params, options.tables ?? DEFAULT_TABLES)
}

export {
  acceptsOperandCount,
  assertOperandCount,
  DEFAULT_SEGMENTS,
  degToRad,
  getEntry,
  registry,
} from './registry.js'
export {
  add,
  addHole,
  align,
  axisApply,
  boundsOf,
  calcCenterWith,
  calcSnap,
  centroidOf,
  combine,
  createGroup,
  isGroup,
  pick,
  sizeOf,
  snap,
  toGeom3,
  translate,
  SNAP_SIDES,
} from './group.js'
export { boltSpecs, FIT_CLASSES, inchToMm } from './tables/bolt-specs.js'
export { nutSpecs } from './tables/nut-specs.js'
export { washerSpecs } from './tables/washer-specs.js'
export { FIT_CLEARANCE_MM } from './tables/fit-clearances.js'
