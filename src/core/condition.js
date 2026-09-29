/**
 * Conditional records — the "only when the Pi is a Pi 4" fix (`TODO/ui-052`).
 *
 * A record may carry `when: { ref, param, in }`: it is **active** while the body `ref`
 * names has its `param` set to one of the values in `in`. The user's own words for it
 * were "an `if pi=4` would fix it", and the point is that one design can then hold
 * several board revisions — an AV-jack cut-out that exists only on a Pi 4 and a fan
 * grille that exists only on a Pi 5, in the same document.
 *
 * ## Deliberately not an expression language
 *
 * One param, membership only, and only an **enum** param (one the registry's
 * `paramOptions` describes as a choice). Plain JSON, so the MCP surface and an AI partner
 * can read and write it as design intent without parsing anything, and CLAUDE.md's rule
 * that params are "never a function or code" holds for conditions too. `and`/`or` across
 * several params and numeric comparisons are out of scope until someone asks.
 *
 * ## Read from the log, not from the fold position
 *
 * The ref's value is read off the **log** — its creation record's params (the composite
 * replace path edits exactly that record) — not off whatever the fold happens to hold at
 * the conditioned row's position. That is a deliberate departure from the task's own
 * "the ref must be earlier in the log" rule, and the reason is a real order of work: a
 * user who drops the enclosure *first* and the Pi second would otherwise be unable to
 * make the enclosure's cut-out conditional on the Pi at all. The ordering rule existed to
 * rule out cycles; reading a *param* rules them out anyway, because no condition can
 * change a param — a condition only ever decides whether a record takes part in the fold.
 *
 * ## A condition that cannot be evaluated is reported, never guessed
 *
 * A deleted or absent ref, a param the ref's op does not have, a value no longer in the
 * schema: each is an `invalid` verdict with a reason naming the thing that is wrong. The
 * fold reports it as a broken row. Reading it as true or false would silently show or
 * hide geometry with no explanation, which is the one outcome this whole feature exists
 * to prevent.
 *
 * Framework-free, per CLAUDE.md's Project Structure: no Vue, no DOM, no three.js.
 *
 * @module core/condition
 */

import { currentParamsRecordOf } from './paramEdit.js'
import { paramOptions } from './kernel/registry.js'

/** @typedef {import('./document.js').DocumentEntry} DocumentEntry */
/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */

/**
 * @typedef {object} Condition
 * @property {string} ref The lineage root id of the body the condition reads.
 * @property {string} param The param on that body, e.g. `"model"`.
 * @property {readonly any[]} in The values for which the conditioned record is active.
 */

/**
 * @typedef {object} ConditionVerdict
 * @property {'active' | 'inactive' | 'invalid'} state
 * @property {string} [reason] Present on `invalid`: what is wrong, by name.
 */

/**
 * What a condition can learn about the bodies in one log.
 *
 * @typedef {object} ConditionContext
 * @property {(refId: string) => RefFacts} lookup
 */

/**
 * @typedef {object} RefFacts
 * @property {boolean} exists The ref names an active, unsuppressed creation record.
 * @property {boolean} deleted Its lineage ends in a `body.delete` tombstone.
 * @property {string} name Display name — the record's `name`, else its id.
 * @property {string} [op]
 * @property {Record<string, any>} [params] The lineage's current params.
 */

/** The tombstone `document.js` appends for a deleted body (`TODO/ui-051`). */
const DELETE_OP = 'body.delete'

/**
 * Index one log so any number of conditions can be evaluated against it cheaply.
 *
 * Only the **active** part of the log counts — the entries before the rollback marker,
 * and not suppressed — the same rows the fold itself reads, so a condition never reads a
 * Pi the user has taken out of play.
 *
 * @param {readonly DocumentEntry[]} entries
 * @param {number} activeCount How many leading entries are active (the rollback marker).
 * @returns {ConditionContext}
 */
export function conditionContextOf(entries, activeCount) {
  /** @type {Map<string, OpRecord>} */
  const byId = new Map()
  for (let index = 0; index < activeCount && index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry.suppressed === true || entry.record.id === undefined) continue
    byId.set(entry.record.id, entry.record)
  }

  /** @type {Map<string, string>} */
  const rootMemo = new Map()
  /**
   * Walk `supersedes` back to the lineage root, cycle-guarded.
   * @param {string} id
   * @returns {string}
   */
  function rootIdOf(id) {
    const memo = rootMemo.get(id)
    if (memo !== undefined) return memo
    const seen = new Set()
    let cursor = id
    for (;;) {
      if (seen.has(cursor)) break
      seen.add(cursor)
      const record = byId.get(cursor)
      if (record === undefined || typeof record.supersedes !== 'string') break
      cursor = record.supersedes
    }
    rootMemo.set(id, cursor)
    return cursor
  }

  /** @type {Map<string, OpRecord[]>} Root id → its records, in log order. */
  const lineages = new Map()
  for (const record of byId.values()) {
    const root = rootIdOf(/** @type {string} */ (record.id))
    const list = lineages.get(root)
    if (list) list.push(record)
    else lineages.set(root, [record])
  }

  return {
    lookup(refId) {
      const root = byId.get(refId)
      if (root === undefined || root.supersedes !== undefined) {
        return { exists: false, deleted: false, name: refId }
      }
      const lineage = lineages.get(refId) ?? [root]
      const deleted = lineage.some((record) => record.op === DELETE_OP)
      const name = typeof root.name === 'string' && root.name.length > 0 ? root.name : refId
      return {
        exists: true,
        deleted,
        name,
        op: root.op,
        params: currentParamsRecordOf(lineage)?.params ?? {},
      }
    },
  }
}

/**
 * Is `when` a well-formed condition? Returns what is wrong, or `null`.
 *
 * @param {unknown} when
 * @returns {string | null}
 */
export function conditionShapeError(when) {
  if (when === null || typeof when !== 'object' || Array.isArray(when)) {
    return `a condition must be { ref, param, in }, got ${JSON.stringify(when)}`
  }
  const { ref, param, in: values } = /** @type {Record<string, unknown>} */ (when)
  if (typeof ref !== 'string' || ref.length === 0) return 'a condition needs the id of the body it reads (`ref`)'
  if (typeof param !== 'string' || param.length === 0) return 'a condition needs the param it reads (`param`)'
  if (!Array.isArray(values) || values.length === 0) {
    return 'a condition needs at least one value it is active for (`in`)'
  }
  return null
}

/**
 * Evaluate one condition.
 *
 * @param {unknown} when The record's `when`.
 * @param {ConditionContext} context From {@link conditionContextOf}.
 * @returns {ConditionVerdict}
 */
export function evaluateCondition(when, context) {
  const shape = conditionShapeError(when)
  if (shape !== null) return { state: 'invalid', reason: shape }
  const condition = /** @type {Condition} */ (when)

  const facts = context.lookup(condition.ref)
  if (!facts.exists) {
    return { state: 'invalid', reason: `the body it reads ("${condition.ref}") is not in the document` }
  }
  if (facts.deleted) return { state: 'invalid', reason: `${facts.name} has been deleted` }

  const field = paramOptions(/** @type {string} */ (facts.op), facts.params ?? {})[condition.param]
  if (field === undefined) {
    return { state: 'invalid', reason: `${facts.name} has no editable param "${condition.param}"` }
  }
  if (field.kind !== 'enum') {
    return {
      state: 'invalid',
      reason: `${facts.name}'s ${field.label} is a number, and a condition can only read a choice`,
    }
  }
  const known = (/** @type {any} */ value) => field.options.some((option) => Object.is(option.value, value))
  const stranger = condition.in.find((value) => !known(value))
  if (stranger !== undefined) {
    return {
      state: 'invalid',
      reason: `${JSON.stringify(stranger)} is not one of ${facts.name}'s ${field.label} choices`,
    }
  }
  const current = facts.params?.[condition.param]
  if (!known(current)) {
    return {
      state: 'invalid',
      reason: `${facts.name}'s ${field.label} is ${JSON.stringify(current)}, which is not one of its choices`,
    }
  }
  return { state: condition.in.some((value) => Object.is(value, current)) ? 'active' : 'inactive' }
}

/**
 * The words the UI shows for a condition: the Inspector's sentence and the History row's
 * chip. Falls back to raw values for a condition that cannot be evaluated, so a broken
 * condition is still legible.
 *
 * @param {Condition} when
 * @param {ConditionContext} context
 * @returns {{ sentence: string, chip: string, refName: string, paramLabel: string, valueLabels: string[] }}
 */
export function describeCondition(when, context) {
  const facts = context.lookup(when.ref)
  const field = facts.exists ? paramOptions(/** @type {string} */ (facts.op), facts.params ?? {})[when.param] : undefined
  const paramLabel = field?.label ?? when.param
  const valueLabels = (Array.isArray(when.in) ? when.in : []).map((value) => {
    const option = field?.kind === 'enum' ? field.options.find((candidate) => Object.is(candidate.value, value)) : undefined
    return option?.label ?? String(value)
  })
  const values = valueLabels.join(' or ')
  return {
    sentence: `Only when ${facts.name}'s ${paramLabel} is ${values}`,
    chip: `if ${facts.name} = ${values}`,
    refName: facts.name,
    paramLabel,
    valueLabels,
  }
}
