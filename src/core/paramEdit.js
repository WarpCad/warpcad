/**
 * Editing a body's **own** parameters — a cylinder's diameter, a cube's size.
 *
 * ## A resize swaps the creation record in place (`TODO/data-007`)
 *
 * `TODO/ui-029` first did this by **appending**: a fresh creation record that
 * `supersedes` the terminal, then a rotate-back and a move-back to restore the pose. A
 * `primitive.*` op builds from its params alone, so that rebuild ignored every record
 * before it, which forced a read-only guard (a fillet under it would silently vanish) and
 * left anything *snapped* to the body evaluated against the old size: a cube snapped onto
 * a 40 mm cube's top stayed 20 mm inside it after the big one grew to 60.
 *
 * `data-004`'s replace path (`document.reviseRecords`) has neither problem, and
 * `TODO/ui-052` already moved composites onto it. The creation record is swapped in
 * place and the whole log re-folds, so a transform, a Snap, an Align and a fillet all
 * re-evaluate against the new solid. Nothing is discarded, so there is nothing to freeze
 * and no pose to re-apply: a later `transform.translate` is a relative vector, and the
 * absolute rotation each transform carries replays against the new solid. A rim op that
 * no longer fits is *reported by name* by `core/dependents.js`'s impact check, which
 * `useParamCommands.js` runs before committing, instead of being dropped.
 *
 * What {@link paramEditability} still refuses is a root that has no params of its own: a
 * boolean or a group, whose geometry *is* its operands, and a composite nobody has
 * described. Both are checked twice on purpose, once by the UI to decide whether to offer
 * an edit and once inside {@link paramEditRecord}, so a caller that skips the first check
 * cannot build a record that would not build.
 *
 * ## Editing a *past* step (`TODO/data-004`)
 *
 * {@link stepParamEditability} guards the same replace path for any History row, and
 * what it refuses is about the row itself:
 *
 * - a row that **has no params of its own** — a boolean or a group, whose
 *   geometry *is* its operands (section 15: "Boolean/Group rows have no params:
 *   `Edit` is disabled");
 * - a **composite recipe** row, for the reason {@link paramEditability} already
 *   gives: a bolt's `spec` is a catalogue choice needing a dropdown, not a
 *   number. `ui-032` may lift this the day it builds that control;
 * - `rotation`, on any row. `src/core/transform.js` carries a body's
 *   **absolute** rotation forward on every later transform record, so editing
 *   one row's value is silently overwritten by the next one — the "wrong
 *   geometry, no error" class this milestone exists to catch. A consequence
 *   worth stating plainly: a `transform.rotate` row's *only* param is that
 *   value, so such a row is not editable at all today.
 *
 * Framework-free, per CLAUDE.md's Project Structure: no Vue, no DOM, no three.js.
 *
 * @module core/paramEdit
 */

import { hasEditableParams, paramOptions, registry } from './kernel/registry.js'

/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */

/**
 * @typedef {object} ParamEditability
 * @property {boolean} editable
 * @property {string | null} blockedBy The op of the record that makes a rebuild
 *   unsafe, for a note the user can actually act on. `null` when the lineage is
 *   editable, and also when there is simply no such body.
 * @property {'replace'} [path] `'replace'` for every editable body (`TODO/ui-052` for a
 *   composite, `TODO/data-007` for a primitive): the edit swaps the creation record in
 *   place and re-folds, so later records follow. Absent only on a verdict that is not editable.
 */

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
  const [root] = lineage
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
  //
  // `TODO/ui-052` lifts that — but only for a recipe whose params the registry now
  // describes (`paramOptions`), and only on the **replace** path. Swapping the creation
  // record in place re-folds every later record against the new variant, so a snap onto
  // a part follows it (or is reported broken), a fillet above a bolt re-runs (or is
  // reported by name), and the pose survives because the transforms are still in the
  // log. Nothing is discarded, so the rest of the lineage is not a reason to freeze —
  // which is why this returns before the loop below. A composite nobody has described
  // stays frozen: the fail-safe default.
  if (registry[root.op]?.kind === 'composite') {
    return hasEditableParams(root.op)
      ? { editable: true, blockedBy: null, path: 'replace' }
      : { editable: false, blockedBy: root.op }
  }

  // A primitive (or any standalone creation record): the **replace** path, exactly as for
  // a composite above (`TODO/data-007`). Swapping the creation record in place and
  // re-folding keeps every later record in the log, so a transform, a colour override, a
  // fillet and a Snap onto the body all re-evaluate against the new solid — nothing is
  // discarded, so nothing has to freeze. A rim op that no longer fits is reported by name
  // by the impact check rather than dropped.
  return { editable: true, blockedBy: null, path: 'replace' }
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
 * Build the replacement for the record that gives a body its creation params —
 * `TODO/data-007`'s replace path for a primitive, the counterpart of
 * {@link compositeParamEditRecord}.
 *
 * Same id, same op, same `supersedes`, new `params`: the caller swaps it in with
 * `document.reviseRecords` and every later record re-folds against the new solid. The
 * record replaced is the newest one carrying the root's own op
 * ({@link currentParamsRecordOf}), which is the root itself unless a document written
 * before `data-007` holds an appended rebuild, so the panel and the next edit always
 * agree about which numbers are current.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId Lineage root id.
 * @param {Record<string, number | readonly number[]>} changes Param keys to
 *   override, with their complete new values (use {@link withComponent} to
 *   change one component of a vector).
 * @returns {OpRecord | null} `null` when nothing actually changes, so brushing a field
 *   and tabbing away does not put a do-nothing step in the undo stack.
 * @throws {Error} When the body is unknown, when it is not built from its own params
 *   (see {@link paramEditability}), or when a change is malformed. Nothing is written
 *   here either way.
 */
export function paramEditRecord(document, bodyId, changes) {
  const lineage = document.lineageOf(bodyId)
  if (lineage.length === 0) throw new Error(`paramEdit: no body "${bodyId}" in this document`)

  const { editable, blockedBy } = paramEditability(lineage)
  if (!editable) {
    throw new Error(
      `paramEdit: "${bodyId}" cannot be rebuilt from its parameters — it is a ${blockedBy}, ` +
        'which is built from its operands or from a catalogue choice, not from numbers'
    )
  }

  const target = currentParamsRecordOf(lineage)
  if (target === undefined) throw new Error(`paramEdit: no body "${bodyId}" in this document`)
  const current = target.params ?? {}

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
  return { ...target, params }
}

/**
 * Params no **past step** edit may write, whatever a caller asks for.
 *
 * Shorter than {@link RESERVED_PARAMS} on purpose. `center` is reserved on the
 * append path because writing it there fights `useParamCommands.js`'s
 * pose-restore step; on the replace path there is no pose restore — a later
 * `transform.translate` is a *relative* vector that replays on top of wherever
 * the creation record now puts the solid — so editing a placement's own centre
 * is exactly the "position" section 15 lists as editable. `rotation` stays
 * reserved for the reason the module note gives: it is carried absolutely.
 */
const RESERVED_STEP_PARAMS = Object.freeze(new Set(['rotation', 'segments']))

/**
 * May this row's parameters be edited in place (`data-004`, section 15)?
 *
 * Takes the **record**, not a lineage: the replace path re-folds the whole log,
 * so what a row's lineage happens to contain is no longer the question — see
 * the module note. Pure, so `ui-032` can call it per row while rendering.
 *
 * @param {OpRecord | undefined} record
 * @returns {ParamEditability} `blockedBy` is the op to name in the disabled
 *   `Edit` button's reason, `null` when there is simply no such row.
 */
export function stepParamEditability(record) {
  if (!record || typeof record.op !== 'string') return { editable: false, blockedBy: null }
  // A boolean or a group: its geometry *is* its operands, and the params a user
  // would be editing do not exist. Section 15: "This step has no parameters".
  if (record.consumes !== undefined) return { editable: false, blockedBy: record.op }
  // A catalogue choice, not a dimension — editable only where the registry says which
  // values each param may take (`TODO/ui-052`'s `paramOptions`), and validated against
  // that schema in `stepParamEditRecord`.
  if (registry[record.op]?.kind === 'composite') {
    return hasEditableParams(record.op)
      ? { editable: true, blockedBy: null }
      : { editable: false, blockedBy: record.op }
  }
  const editable = Object.keys(record.params ?? {}).filter(
    (key) => !RESERVED_STEP_PARAMS.has(key)
  )
  if (editable.length === 0) return { editable: false, blockedBy: record.op }
  return { editable: true, blockedBy: null }
}

/**
 * Every value a param may take: a finite number, a vector of them, or one of
 * the string/boolean choices a real op already uses (`modify.filletRim`'s
 * `face`, a future `mode` flag).
 *
 * Deliberately wider than {@link requireFiniteParam}, which guards the append
 * path's numeric-dimension edits only. Still narrow enough that a `NaN` or an
 * arbitrary object can never reach the kernel as a silently malformed solid.
 *
 * @param {string} key
 * @param {unknown} value
 * @returns {void}
 */
function requireStepParam(key, value) {
  if (typeof value === 'string' || typeof value === 'boolean') return
  const values = Array.isArray(value) ? value : [value]
  for (const entry of values) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      throw new Error(
        `paramEdit: ${key} must be a finite number, a vector of them, a string or a boolean — ` +
          `got ${JSON.stringify(entry)}, and a NaN would reach the kernel as a silently ` +
          'malformed solid'
      )
    }
  }
}

/**
 * Build the replacement for a **past step**, with some of its params changed.
 *
 * The result is the same record with a new `params` — same `id`, same `op`,
 * same `supersedes`/`consumes`/`target`/`operands`. That is not incidental:
 * `document.replaceRecord` refuses a replacement that changes any of those,
 * because every later record in the log was resolved against them, and keeping
 * them is what makes the re-fold "the same fold, one input changed" rather than
 * a re-parenting with a correctness argument of its own.
 *
 * Spread from the row's **own** params, not the body's current ones: this edits
 * one point in history, and the rows after it still carry whatever they carry.
 *
 * @param {WarpDocument} document
 * @param {string} recordId The row's record id — from `document.timeline()`.
 * @param {Record<string, number | readonly number[] | string | boolean>} changes
 * @returns {OpRecord | null} `null` when nothing actually changes, the same
 *   "a no-op delta appends nothing" convention {@link paramEditRecord} follows.
 * @throws {Error} When there is no such row, when the row has no editable
 *   params (see {@link stepParamEditability}), or when a change is malformed.
 *   Nothing is written here either way — the caller hands the result to
 *   `document.replaceRecord`.
 */
export function stepParamEditRecord(document, recordId, changes) {
  const record = document.recordOf(recordId)
  if (record === undefined) throw new Error(`paramEdit: no step "${recordId}" in this document`)

  const { editable, blockedBy } = stepParamEditability(record)
  if (!editable) {
    throw new Error(
      `paramEdit: step "${recordId}" has no editable parameters — a ${blockedBy ?? 'record'} ` +
        'is built from its operands or from a catalogue choice, not from numbers this path ' +
        'can rewrite'
    )
  }

  const current = record.params ?? {}
  /** @type {Record<string, any>} */
  const params = { ...current }
  let changed = false
  for (const [key, value] of Object.entries(changes)) {
    if (RESERVED_STEP_PARAMS.has(key)) {
      throw new Error(
        `paramEdit: "${key}" is not editable on a past step — rotation is carried as an ` +
          'absolute value on every later transform record, so editing one row\'s copy would ' +
          'be silently overwritten by the next, and segments is a tessellation detail rather ' +
          'than a dimension'
      )
    }
    requireStepParam(key, value)
    if (sameValue(current[key], value)) continue
    params[key] = Array.isArray(value) ? value.slice() : value
    changed = true
  }
  if (!changed) return null

  // A composite row is a catalogue choice: every value has to be one the recipe
  // accepts, or the replay throws inside the recipe instead of saying which field is
  // wrong (`TODO/ui-052`).
  if (registry[record.op]?.kind === 'composite') requireSchemaParams(record.op, params, Object.keys(changes))

  return { ...record, params }
}

/**
 * Check every changed param — and every enum the change could have invalidated — against
 * the op's registry schema (`TODO/ui-052`), naming the field and the values it accepts.
 *
 * Checked against the params **after** the change, so a bolt's `fit` is judged against the
 * new `spec`'s fits; and every enum present is re-checked, not just the edited ones, so a
 * `spec` change that strands the old `fit` is caught here rather than inside the recipe.
 *
 * @param {string} op
 * @param {Record<string, any>} params The complete params after the change.
 * @param {readonly string[]} changedKeys
 * @returns {void}
 */
function requireSchemaParams(op, params, changedKeys) {
  const schema = paramOptions(op, params)
  for (const key of changedKeys) {
    if (RESERVED_PARAMS.has(key)) {
      throw new Error(
        `paramEdit: "${key}" is a reserved param and is not editable here — position and ` +
          "rotation are the Transform section's, and segments is a tessellation detail"
      )
    }
    if (schema[key] === undefined) {
      throw new Error(
        `paramEdit: ${op} has no editable param "${key}" — editable: ${Object.keys(schema).join(', ') || 'none'}`
      )
    }
  }
  for (const [key, field] of Object.entries(schema)) {
    const value = params[key]
    if (field.kind === 'enum') {
      if (value === undefined && !changedKeys.includes(key)) continue
      if (!field.options.some((option) => Object.is(option.value, value))) {
        throw new Error(
          `paramEdit: ${key} ${JSON.stringify(value)} is not one of ${op}'s choices — expected one of ` +
            field.options.map((option) => JSON.stringify(option.value)).join(', ')
        )
      }
    } else if (changedKeys.includes(key)) {
      const min = field.exclusiveMin
      if (typeof value !== 'number' || !Number.isFinite(value) || (min !== undefined && !(value > min))) {
        throw new Error(
          `paramEdit: ${key} must be a number${min !== undefined ? ` greater than ${min}` : ''}` +
            `${field.unit ? ` ${field.unit}` : ''}, got ${JSON.stringify(value)}`
        )
      }
    }
  }
}

/**
 * Build the replacement **creation record** for a composite whose params the registry
 * describes — `TODO/ui-052`'s replace path, the composite counterpart of
 * {@link paramEditRecord}.
 *
 * Same id, same op, same everything but `params`: the caller swaps it in with
 * `document.reviseRecords`, and every later record — the drop translate, a snap onto one
 * of its parts, a sub-part Subtract — re-folds against the new variant. See
 * {@link paramEditability}'s note on why that makes the pose re-apply `useParamCommands`
 * does on the append path unnecessary here.
 *
 * Every value is checked against `paramOptions` (see `requireSchemaParams`), so the MCP
 * surface and any other caller that skips the Inspector's dropdown still cannot write a
 * model the recipe does not have.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId Lineage root id — the composite's own creation record.
 * @param {Record<string, unknown>} changes
 * @returns {OpRecord | null} `null` when nothing actually changes.
 * @throws {Error} When the body is unknown, is not a described composite, or a change is
 *   outside the schema — naming the param and what it accepts.
 */
export function compositeParamEditRecord(document, bodyId, changes) {
  const lineage = document.lineageOf(bodyId)
  const root = lineage[0]
  if (root === undefined) throw new Error(`paramEdit: no body "${bodyId}" in this document`)
  if (registry[root.op]?.kind !== 'composite' || !hasEditableParams(root.op)) {
    throw new Error(
      `paramEdit: "${bodyId}" is a ${root.op}, which has no editable-param schema — ` +
        'only a described composite is edited in place'
    )
  }
  const current = root.params ?? {}
  /** @type {Record<string, any>} */
  const params = { ...current }
  let changed = false
  for (const [key, value] of Object.entries(changes)) {
    if (sameValue(current[key], value)) continue
    params[key] = Array.isArray(value) ? value.slice() : value
    changed = true
  }
  requireSchemaParams(root.op, params, Object.keys(changes))
  if (!changed) return null
  return { ...root, params }
}
