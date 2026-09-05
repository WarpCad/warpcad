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

import { add, createGroup, toGeom3 } from './group.js'
import { boltSpecs } from './tables/bolt-specs.js'
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
 */

/**
 * @typedef {object} EvaluateResult
 * @property {Group} group Named results, in document order.
 * @property {Map<string, Geom3 | Group>} byId Every record's value, by its `id`.
 */

/** Size tables every composite recipe can read. */
const DEFAULT_TABLES = Object.freeze({ boltSpecs })

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

    const inputIds = [
      ...(record.target === undefined || record.target === null ? [] : [record.target]),
      ...(record.operands ?? []),
    ]
    assertOperandCount(record.op, inputIds.length, ops)

    const inputs = inputIds.map((id) => {
      const resolved = byId.get(id)
      if (resolved === undefined) {
        throw new Error(
          `${record.op}: operand "${id}" has not been evaluated ` +
            `(known ids: ${[...byId.keys()].join(',') || 'none'})`
        )
      }
      return toGeom3(resolved)
    })

    /** @type {Geom3 | Group} */
    let value
    if (entry.kind === 'composite') {
      if (!entry.recipe) throw new Error(`${record.op}: composite entry has no recipe`)
      value = evaluate(entry.recipe(record.params ?? {}, tables), {
        ...options,
        name: record.op,
      }).group
    } else {
      if (!entry.build) throw new Error(`${record.op}: native entry has no build function`)
      value = entry.build({ params: record.params ?? {}, inputs })
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
