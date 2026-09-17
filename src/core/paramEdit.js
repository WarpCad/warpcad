/**
 * Editing a body's **own** parameters — a cylinder's diameter, a cube's size.
 *
 * ## Why this is a rebuild, not a rewrite
 *
 * The log is append-only and its entries are immutable (`document.js`), so
 * "change this cylinder's diameter to 10" cannot mean reaching back into the
 * record that created it. `ui-012` already solved the analogous problem for
 * *moving* a body — append a new record that `supersedes` the lineage's current
 * terminal — and `document.js`'s supersession rule is deliberately generic over
 * what op either record carries. So a param edit is the same mechanism with a
 * different record on top: a **fresh creation record**, same `op` as the root,
 * the root's params with the edited key(s) overridden.
 *
 * Two consequences fall straight out of that and are the whole of this module:
 *
 * 1. **A rebuilt creation record ignores every prior record.** `primitive.*` ops
 *    are `operandCount: 0` (`kernel/registry.js`) — they build from params and
 *    nothing else. That is exactly what makes the rebuild possible, and exactly
 *    what makes it dangerous: anything the lineage had *done* to that geometry
 *    since is simply not in the new solid. Hence {@link paramEditability}.
 * 2. **The pose has to be re-applied on top.** The rebuilt record puts the solid
 *    back where its creation params say, un-turned. Restoring the body's actual
 *    position and rotation is two more appends through `transform.js`'s existing
 *    `rotateToRecord`/`moveToRecord` — see `src/composables/useParamCommands.js`,
 *    which owns that sequencing. Deliberately *not* folded in here: those two
 *    builders are already proven, and a third path that composed its own pose
 *    would be a second implementation of the same mutation, which is the trap
 *    `transform.js`'s own module doc exists to avoid.
 *
 * ## The read-only guard is the point of this module
 *
 * `TODO/ui-029`'s named failure mode is **silent data loss**: rebuild the
 * creation record under a `modify.filletRim` and the rounded rim vanishes with
 * no error anywhere, because every individual record involved is perfectly
 * valid. So the guard fails *safe* — it reports a lineage un-editable and the
 * Inspector keeps those fields read-only with a note saying why — rather than
 * failing loud after the fact. It is checked twice on purpose: once by the UI to
 * decide whether to offer an edit at all, and once inside
 * {@link paramEditRecord}, so a caller that skips the first check cannot build
 * a destructive record anyway.
 *
 * Replaying a fillet/chamfer/boolean on top of a rebuilt creation record is
 * explicitly **not** attempted here (`TODO/ui-029`'s own Proposed fix says so):
 * a rim op's params are meaningful only against the exact solid they were
 * measured for, so re-running one against a resized body could easily throw
 * `assertRadiusFits` — or, worse, succeed and produce a rim nobody asked for.
 * Freezing is the honest answer until someone asks for the other one.
 *
 * Framework-free, per CLAUDE.md's Project Structure: no Vue, no DOM, no three.js.
 *
 * @module core/paramEdit
 */

import { registry } from './kernel/registry.js'

/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */

/**
 * @typedef {object} ParamEditability
 * @property {boolean} editable
 * @property {string | null} blockedBy The op of the record that makes a rebuild
 *   unsafe, for a note the user can actually act on. `null` when the lineage is
 *   editable, and also when there is simply no such body.
 */

/**
 * Ops that may sit above a creation record without invalidating a rebuild: a
 * move or a turn is re-applied afterwards from the body's own measured pose, so
 * nothing it did is lost. A **prefix**, not a fixed list, matching how
 * `document.js` routes `sketch.` ops — a later `transform.*` needs no change
 * here, and anything that is not a transform is refused by default rather than
 * by omission.
 */
const TRANSFORM_OP_PREFIX = 'transform.'

/**
 * Params this path will not write, whatever a caller asks for.
 *
 * `center` is the body's *position* — the Transform section owns it, and writing
 * it here would fight `useParamCommands.js`'s pose-restore step rather than
 * resize anything. `segments` is a tessellation detail, not a dimension.
 * `rotation` is the absolute pose `transform.js` carries on every transform
 * record; a creation record claiming one would make `Body.rotationDeg` describe
 * an orientation the rebuilt solid is not in. The first two are already hidden
 * by `src/core/inspector.js`'s own `HIDDEN_PARAMS`, so this is the framework-free
 * enforcement of the same rule for any caller that does not go through the panel
 * — the MCP surface, a future script.
 */
const RESERVED_PARAMS = Object.freeze(new Set(['center', 'segments', 'rotation']))

/**
 * Is every record between a lineage's creation record and its terminal something
 * a rebuild can safely throw away and re-apply?
 *
 * Pure, and takes the records themselves rather than a document, so the
 * dangerous case can be unit-tested against a hand-built array with a
 * `modify.filletRim` in it (`paramEdit.spec.js`) without a kernel anywhere near
 * it.
 *
 * @param {readonly OpRecord[]} lineage Root first, terminal last — the shape
 *   {@link WarpDocument.lineageOf} returns.
 * @returns {ParamEditability}
 */
export function paramEditability(lineage) {
  const [root, ...rest] = lineage
  if (root === undefined) return { editable: false, blockedBy: null }

  // The root has to be a record that builds from its own params alone. A Union
  // or a Group is its own lineage root (`document.js`'s consumption note) and
  // its geometry *is* its operands — there is nothing to rebuild it from, and
  // the params a user would be editing do not exist.
  if (root.consumes !== undefined || root.operands !== undefined || root.target !== undefined) {
    return { editable: false, blockedBy: root.op }
  }

  // A composite recipe's params are a **catalogue choice**, not dimensions
  // (`TODO/ui-030`). A bolt's `spec` is a key into a size table and its `fit` is a
  // clearance class: both need a dropdown fed by the recipe's own valid values,
  // which is exactly the control `ui-029` scoped out when it made numeric params
  // editable, and a rebuild from a half-typed spec string throws inside the recipe
  // rather than resizing anything. Freezing the section is `ui-016`'s precedent
  // again — say so on screen rather than offer an edit that cannot work. This is
  // `ACCEPTANCE.md` scenario 2's remaining blocker, named here rather than left
  // as an empty field a user discovers by typing into it.
  if (registry[root.op]?.kind === 'composite') {
    return { editable: false, blockedBy: root.op }
  }

  for (const record of rest) {
    // A move or a turn: re-applied from the body's measured pose afterwards, so
    // nothing it did is lost.
    if (record.op.startsWith(TRANSFORM_OP_PREFIX)) continue
    // An **earlier param edit** — the root's own op, built from its own params
    // alone. Editing a parameter is not one-shot per body, and a rebuild that
    // refused to allow a second rebuild would freeze the field the instant it
    // was first used. Only a record that is itself a standalone creation record
    // qualifies; anything taking operands is a real operation, checked below.
    if (
      record.op === root.op &&
      record.consumes === undefined &&
      record.operands === undefined &&
      record.target === undefined
    ) {
      continue
    }
    return { editable: false, blockedBy: record.op }
  }
  return { editable: true, blockedBy: null }
}

/**
 * The same verdict, read off a live document by body id.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId Lineage root id — the body's stable identity.
 * @returns {ParamEditability}
 */
export function canEditParams(document, bodyId) {
  return paramEditability(document.lineageOf(bodyId))
}

/**
 * The record whose params say what a body currently **is** — the newest record
 * in the lineage carrying the root's own op.
 *
 * This is the root itself until a param edit supersedes it, which is why
 * `document.js` could read `Body.params` straight off the root for every task
 * before this one. A rebuilt creation record changes that: it carries the *same*
 * op and its params describe the same thing the root's did, only newer. A
 * `transform.*` in between is skipped, because a translate's `vector` is not a
 * dimension of the part — which is the original reason that field was pinned to
 * the root at all (`document.js`'s supersession note).
 *
 * Exported, and used by both `document.js`'s `bodies()` and
 * {@link paramEditRecord}, so the panel cannot show one set of numbers while the
 * next edit spreads from another — a second edit built on the root's stale
 * params would silently undo the first one.
 *
 * @param {readonly OpRecord[]} lineage Root first, terminal last.
 * @returns {OpRecord | undefined}
 */
export function currentParamsRecordOf(lineage) {
  const root = lineage[0]
  if (root === undefined) return undefined
  for (let index = lineage.length - 1; index > 0; index -= 1) {
    if (lineage[index].op === root.op) return lineage[index]
  }
  return root
}

/**
 * A body's current creation params — what the Inspector's Parameters section is
 * showing, and the base a param edit is spread from.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId
 * @returns {Record<string, any>}
 */
export function currentParamsOf(document, bodyId) {
  const record = currentParamsRecordOf(document.lineageOf(bodyId))
  if (record === undefined) throw new Error(`paramEdit: no body "${bodyId}" in this document`)
  return record.params ?? {}
}

/**
 * Replace one component of a vector param, leaving the others alone — what
 * editing a single Size X or Side B field means.
 *
 * `transform.js`'s `withAxis` does this for a fixed `Vec3`; a param vector is
 * not always three long (a triangle's `sides` is, a future profile's may not
 * be), so this one is length-generic and range-checked rather than assuming.
 *
 * @param {readonly number[]} vector
 * @param {number} index
 * @param {number} value
 * @returns {number[]}
 */
export function withComponent(vector, index, value) {
  if (!Array.isArray(vector)) {
    throw new Error(`paramEdit: expected a vector param, got ${JSON.stringify(vector)}`)
  }
  if (!Number.isInteger(index) || index < 0 || index >= vector.length) {
    throw new Error(
      `paramEdit: component ${index} is not in a ${vector.length}-component param`
    )
  }
  const next = vector.slice()
  next[index] = value
  return next
}

/**
 * Two param values, compared the way a no-op check needs: element-wise for a
 * vector, `Object.is` otherwise.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function sameValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => Object.is(entry, b[index]))
  }
  return Object.is(a, b)
}

/**
 * Every number in a param value is finite, or say which one is not.
 *
 * @param {string} key
 * @param {unknown} value
 * @returns {void}
 */
function requireFiniteParam(key, value) {
  const values = Array.isArray(value) ? value : [value]
  for (const entry of values) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      throw new Error(
        `paramEdit: ${key} must be a finite number, got ${JSON.stringify(entry)} — ` +
          'a NaN would reach the kernel as a silently malformed solid'
      )
    }
  }
}

/**
 * Build the record that gives a body new creation params.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId Lineage root id.
 * @param {Record<string, number | readonly number[]>} changes Param keys to
 *   override, with their complete new values (use {@link withComponent} to
 *   change one component of a vector).
 * @returns {OpRecord | null} `null` when nothing actually changes — the same
 *   "a no-op delta appends nothing" convention `useTransformCommands.js`'s
 *   `translateBy` already follows, so brushing a field and tabbing away does not
 *   put a do-nothing line in the document (and, later, a do-nothing step in the
 *   undo stack).
 * @throws {Error} When the body is unknown, when its lineage is not safe to
 *   rebuild (see {@link paramEditability}), or when a change is malformed.
 *   Nothing is appended here either way — the caller hands the result to the
 *   command layer.
 */
export function paramEditRecord(document, bodyId, changes) {
  const lineage = document.lineageOf(bodyId)
  if (lineage.length === 0) throw new Error(`paramEdit: no body "${bodyId}" in this document`)

  const { editable, blockedBy } = paramEditability(lineage)
  if (!editable) {
    throw new Error(
      `paramEdit: "${bodyId}" cannot be rebuilt from its parameters — its history carries ` +
        `a ${blockedBy}, and rebuilding the creation record would silently discard it`
    )
  }

  const root = lineage[0]
  const terminal = lineage[lineage.length - 1]
  // Spread from the body's *current* params, not the root's: after one edit the
  // root still says `diameter: 40` while the body is 10 across, and a second
  // edit built on the root would silently undo the first.
  const current = currentParamsRecordOf(lineage)?.params ?? {}

  /** @type {Record<string, any>} */
  const params = { ...current }
  let changed = false
  for (const [key, value] of Object.entries(changes)) {
    if (RESERVED_PARAMS.has(key)) {
      throw new Error(
        `paramEdit: "${key}" is a reserved param and is not editable here — ` +
          'position and rotation are the Transform section\'s, and segments is a ' +
          'tessellation detail rather than a dimension'
      )
    }
    requireFiniteParam(key, value)
    if (sameValue(current[key], value)) continue
    params[key] = Array.isArray(value) ? value.slice() : value
    changed = true
  }
  if (!changed) return null

  return {
    // Prefixed with the body's own id, matching `transform.js`'s `-move`/`-turn`
    // ids: an NDJSON document stays readable by a human and by the AI partner.
    id: document.nextId(`${bodyId}-param`),
    op: root.op,
    // Unnamed on purpose, and *against* this task's own Affected files note.
    // `src/core/transform.js`'s "Why transform records are unnamed" section gives
    // the checked reason: `Body.name` is read from a lineage's **root** record,
    // so a name here is inert at best, and a duplicate `group.js` does not
    // deduplicate at worst. `ui-027` made the same call one task earlier.
    params,
    supersedes: terminal.id,
  }
}
