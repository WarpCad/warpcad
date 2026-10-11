// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Conditional records — the "only when the Pi is a Pi 4" fix (`TODO/ui-052`).
 *
 * A record may carry `when: { ref, param, in }`: it is **active** while the body `ref`
 * names has its `param` set to one of the values in `in`. The user's own words for it
 * were "an `if pi=4` would fix it", and the point is that one design can then hold
 * several board revisions — an AV-jack cut-out that exists only on a Pi 4 and a fan
 * grille that exists only on a Pi 5, in the same document.
 *
 * ## Or a project variable (`TODO/core-050`)
 *
 * `when: { var, in }` reads a project variable instead of a body's param — "the AV-jack
 * cut-out only exists while `piModel` is 4" — with the same membership-only, plain-JSON
 * rule, for a choice or a yes/no variable. A body param that is itself bound to a variable
 * reads as that variable's value, so a `{ ref, param, in }` condition on a bound Pi still
 * means the board the Pi actually is.
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
import { readVariables, resolveParams, variableValueLabel } from './variables.js'

/** @typedef {import('./document.js').DocumentEntry} DocumentEntry */
/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */

/**
 * A condition reads either one body's enum param (`{ ref, param, in }`, `TODO/ui-052`) or
 * one project variable (`{ var, in }`, `TODO/core-050`) — never both. Same membership-only,
 * plain-JSON rule for each.
 *
 * @typedef {object} Condition
 * @property {string} [ref] The lineage root id of the body the condition reads.
 * @property {string} [param] The param on that body, e.g. `"model"`.
 * @property {string} [var] The project variable the condition reads (`core-050`), instead
 *   of `ref`/`param`. Must be a choice or a yes/no variable.
 * @property {readonly any[]} in The values for which the conditioned record is active.
 */

/**
 * @typedef {object} ConditionVerdict
 * @property {'active' | 'inactive' | 'invalid'} state
 * @property {string} [reason] Present on `invalid`: what is wrong, by name.
 */

/**
 * What a condition can learn about the bodies — and the variables — in one log.
 *
 * @typedef {object} ConditionContext
 * @property {(refId: string) => RefFacts} lookup
 * @property {(name: string) => import('./variables.js').Variable | undefined} variable
 *   `TODO/core-050`: a project variable by name, read from the whole active log.
 */

/**
 * @typedef {object} RefFacts
 * @property {boolean} exists The ref names an active, unsuppressed creation record.
 * @property {boolean} deleted Its lineage ends in a `body.delete` tombstone.
 * @property {string} name Display name — the record's `name`, else its id.
 * @property {string} [op]
 * @property {Record<string, any>} [params] The lineage's current params, with any
 *   project-variable binding resolved (`TODO/core-050`).
 * @property {string} [unresolved] Why a bound param could not be resolved, when one could
 *   not — the condition then cannot be evaluated either.
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
 * @param {ReadonlyMap<string, import('./variables.js').Variable>} [variables] The project
 *   variables (`TODO/core-050`), when the caller already read them; read from `entries`
 *   on first use otherwise.
 * @returns {ConditionContext}
 */
export function conditionContextOf(entries, activeCount, variables = undefined) {
  /** @type {ReadonlyMap<string, import('./variables.js').Variable> | undefined} */
  let table = variables
  const variablesOf = () => {
    if (table === undefined) table = readVariables(entries, activeCount).variables
    return table
  }

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
      // A param bound to a project variable reads as the variable's value (`TODO/core-050`):
      // "only on a Pi 4" still means the board the Pi actually is.
      const raw = currentParamsRecordOf(lineage)?.params ?? {}
      const { params, errors } = resolveParams(raw, variablesOf())
      return {
        exists: true,
        deleted,
        name,
        op: root.op,
        params,
        ...(errors.length > 0 ? { unresolved: `${name}'s ${errors[0].path} is bound to "${errors[0].name}": ${errors[0].reason}` } : {}),
      }
    },
    variable(name) {
      return variablesOf().get(name)
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
    return `a condition must be { ref, param, in } or { var, in }, got ${JSON.stringify(when)}`
  }
  const { ref, param, in: values } = /** @type {Record<string, unknown>} */ (when)
  if (Object.hasOwn(when, 'var')) {
    const name = /** @type {Record<string, unknown>} */ (when).var
    if (ref !== undefined || param !== undefined) {
      return 'a condition reads either a body (`ref`, `param`) or a variable (`var`), not both'
    }
    if (typeof name !== 'string' || name.length === 0) return 'a condition needs the name of the variable it reads (`var`)'
    if (!Array.isArray(values) || values.length === 0) {
      return 'a condition needs at least one value it is active for (`in`)'
    }
    return null
  }
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
  if (condition.var !== undefined) return evaluateVariableCondition(condition.var, condition.in, context)

  const facts = context.lookup(/** @type {string} */ (condition.ref))
  if (!facts.exists) {
    return { state: 'invalid', reason: `the body it reads ("${condition.ref}") is not in the document` }
  }
  if (facts.deleted) return { state: 'invalid', reason: `${facts.name} has been deleted` }
  if (facts.unresolved !== undefined) return { state: 'invalid', reason: facts.unresolved }

  const field = paramOptions(/** @type {string} */ (facts.op), facts.params ?? {})[/** @type {string} */ (condition.param)]
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
  const current = facts.params?.[/** @type {string} */ (condition.param)]
  if (!known(current)) {
    return {
      state: 'invalid',
      reason: `${facts.name}'s ${field.label} is ${JSON.stringify(current)}, which is not one of its choices`,
    }
  }
  return { state: condition.in.some((value) => Object.is(value, current)) ? 'active' : 'inactive' }
}

/**
 * `{ var, in }` (`TODO/core-050`): the same membership rule as a ref condition, against a
 * project variable. Only a choice or a yes/no can be read; every `in` value has to be one
 * the variable can hold.
 *
 * @param {string} name
 * @param {readonly any[]} values
 * @param {ConditionContext} context
 * @returns {ConditionVerdict}
 */
function evaluateVariableCondition(name, values, context) {
  const variable = context.variable(name)
  if (variable === undefined) return { state: 'invalid', reason: `the variable "${name}" is not defined in this project` }
  if (variable.kind === 'number') {
    return { state: 'invalid', reason: `"${name}" is a number, and a condition can only read a choice or a yes/no` }
  }
  const known =
    variable.kind === 'boolean'
      ? (/** @type {any} */ value) => typeof value === 'boolean'
      : (/** @type {any} */ value) => (variable.options ?? []).some((option) => Object.is(option.value, value))
  const stranger = values.find((value) => !known(value))
  if (stranger !== undefined) {
    return { state: 'invalid', reason: `${JSON.stringify(stranger)} is not one of "${name}"'s choices` }
  }
  return { state: values.some((value) => Object.is(value, variable.value)) ? 'active' : 'inactive' }
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
  if (when.var !== undefined) {
    const variable = context.variable(when.var)
    const valueLabels = (Array.isArray(when.in) ? when.in : []).map((value) =>
      variable === undefined ? String(value) : variableValueLabel(variable, value),
    )
    const paramLabel = variable?.label ?? when.var
    const values = valueLabels.join(' or ')
    return {
      sentence: `Only when ${paramLabel} is ${values}`,
      chip: `if ${when.var} = ${values}`,
      refName: when.var,
      paramLabel,
      valueLabels,
    }
  }
  const facts = context.lookup(/** @type {string} */ (when.ref))
  const field = facts.exists ? paramOptions(/** @type {string} */ (facts.op), facts.params ?? {})[/** @type {string} */ (when.param)] : undefined
  const paramLabel = field?.label ?? /** @type {string} */ (when.param)
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
