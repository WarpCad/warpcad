// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Project variables (`TODO/core-050`): a named value any param of any record can be bound
 * to instead of holding a literal — the jscad1 `const piVersion = 4` at the top of a case
 * design, which every part that cares reads.
 *
 * ## The record, and the binding
 *
 * A variable is a **log record**, `{ id, op: 'var.define', params: { name, kind, value,
 * label?, unit?, min?, max?, options? } }`. It builds nothing: `document.js` routes it past
 * the kernel exactly as it does a reference photo (`asset.image`) — validated, indexed,
 * never folded. Being in the log is what gives it undo/redo, a transaction origin, the
 * NDJSON round trip and the AI's view of the document for free
 * (`docs/decisions/project-variables.md`).
 *
 * A **binding** is plain JSON in a param's own slot, `{ "$var": "piModel" }`, standing for
 * the whole value or for one element of an array param (`"size": [{ "$var": "wall" }, 20,
 * 10]`). Never a function, a code string or an expression. An object carrying `$var` and any
 * other key is refused, so nothing that merely *contains* a `$var` key is ever read as one.
 *
 * ## One resolution point
 *
 * {@link resolveRecord} runs in exactly one place: `document.js`'s fold, where a record's
 * params are handed to the kernel (and `condition.js`, where a ref's param is read). Every
 * op, composite and user part therefore gets variables without knowing they exist, and
 * resolution happens **before** composite expansion. The record kept in the log is never
 * the resolved one — the binding is what the user wrote.
 *
 * ## Read from the log, not from the fold position
 *
 * {@link readVariables} reads every active, unsuppressed definition in the log, wherever it
 * sits — the same decision `condition.js` makes, for the same reason: a person who places
 * the enclosure first and defines `piModel` second must still be able to bind to it. A
 * variable never depends on a record, so reading one can never make a cycle.
 *
 * ## A binding that cannot be resolved is reported, never guessed
 *
 * A missing variable, a wrong kind, a value outside the param's own limits, an enum value
 * the param no longer offers: each is an error naming the variable, the record and the
 * param, which the fold shows as a broken row. Substituting the literal, or `0`, would
 * change geometry with no explanation.
 *
 * Framework-free, per CLAUDE.md's Project Structure: no Vue, no DOM, no three.js.
 *
 * @module core/variables
 */

import { lookupEntry, paramOptions } from './kernel/registry.js'
import { isReservedStepParam, stepParamEditability } from './paramEdit.js'

/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */
/** @typedef {import('./kernel/registry.js').ParamSchema} ParamSchema */
/** @typedef {import('./kernel/registry.js').ParamTables} ParamTables */
/** @typedef {import('./document.js').DocumentEntry} DocumentEntry */
/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {import('./document.js').TransactionOptions} TransactionOptions */
/** @typedef {import('./document.js').RecordRevision} RecordRevision */

/** The op of a variable definition record. */
export const VARIABLE_OP = 'var.define'

/** Every op in the variable family starts with this; a newer one is skipped on load. */
export const VARIABLE_OP_PREFIX = 'var.'

/** The one key a binding object carries. */
export const BINDING_KEY = '$var'

/** The kinds a variable may be (v1). No `string`: no op has a free-text geometry param. */
export const VARIABLE_KINDS = Object.freeze(/** @type {const} */ (['number', 'boolean', 'enum']))

/** The units a `number` variable may carry. */
export const VARIABLE_UNITS = Object.freeze(/** @type {const} */ (['mm', 'deg', '']))

/**
 * Caps enforced on load and in the fold, so a hostile file costs a warning, never a hang.
 */
export const VARIABLE_LIMITS = Object.freeze({
  maxNameLength: 40,
  maxLabelLength: 80,
  maxOptions: 100,
  maxOptionLabelLength: 80,
  maxVariables: 500,
  maxBindingsPerDocument: 10000,
})

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** How deep a params walk looks for a binding before it gives up — JSON is never this deep. */
const MAX_WALK_DEPTH = 32

/**
 * @typedef {object} VariableOption
 * @property {string | number} value
 * @property {string} label
 */

/**
 * A variable as the fold reads it — the definition record's params, plus its record id.
 *
 * @typedef {object} Variable
 * @property {string} id The `var.define` record's id.
 * @property {string} name
 * @property {'number' | 'boolean' | 'enum'} kind
 * @property {number | boolean | string} value
 * @property {string} [label]
 * @property {'mm' | 'deg' | ''} [unit]
 * @property {number} [min]
 * @property {number} [max]
 * @property {readonly VariableOption[]} [options]
 */

/**
 * @typedef {object} BindingError
 * @property {string} path `size.0`, `height`.
 * @property {string} name The variable it names, `''` when it names none.
 * @property {string} reason
 */

/**
 * One slot the bind control may offer.
 *
 * @typedef {object} BindableSlot
 * @property {string} path `key` for the whole value, `key.index` for an array element.
 * @property {string} key
 * @property {number} [index]
 * @property {'number' | 'boolean' | 'enum'} kind
 * @property {string} [label]
 * @property {'mm' | 'deg' | ''} [unit]
 * @property {number} [exclusiveMin]
 * @property {number} [min]
 * @property {number} [max]
 * @property {readonly VariableOption[]} [options]
 * @property {string[]} [dependsOn] An enum whose options follow other params (a bolt's
 *   `fit` follows `spec`): validated after those are resolved.
 */

/**
 * One record that reads a variable.
 *
 * @typedef {object} VariableConsumer
 * @property {string} recordId
 * @property {string} name The record's display name — its own, else its id.
 * @property {'binding' | 'condition'} kind
 * @property {string} [path] For a binding, the slot it fills.
 */

/** A refused variable command, safe to show as-is. */
export class VariableError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'VariableError'
  }
}

/** Deleting a variable something still reads — carries the list the UI offers to rewrite. */
export class VariableInUseError extends VariableError {
  /**
   * @param {string} name
   * @param {VariableConsumer[]} consumers
   * @param {string} [extra]
   */
  constructor(name, consumers, extra = '') {
    const names = [...new Set(consumers.map((consumer) => consumer.name))].join(', ')
    super(`"${name}" is used by ${names}${extra} — delete and keep current values, or unbind them first`)
    this.name = 'VariableInUseError'
    /** @type {VariableConsumer[]} */
    this.consumers = consumers
  }
}

// --- small helpers -------------------------------------------------------------

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Does this value **claim** to be a binding — an object with a `$var` key? Whether the
 * claim is well formed is {@link bindingShapeError}'s question.
 *
 * @param {unknown} value
 * @returns {value is { $var: unknown }}
 */
export function isBinding(value) {
  return isPlainObject(value) && Object.hasOwn(value, BINDING_KEY)
}

/**
 * Is this binding well formed? Exactly one key, naming a variable.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function bindingShapeError(value) {
  if (!isBinding(value)) return 'not a binding'
  const keys = Object.keys(value)
  if (keys.length !== 1) {
    return `a binding is only { "$var": name } — this one also carries ${keys.filter((key) => key !== BINDING_KEY).map((key) => JSON.stringify(key)).join(', ')}`
  }
  if (typeof value.$var !== 'string' || value.$var.length === 0) {
    return `a binding must name a variable, got ${JSON.stringify(value.$var)}`
  }
  return null
}

/**
 * Why `name` cannot name a variable, or `null`.
 *
 * Identifier-shaped and at most {@link VARIABLE_LIMITS}.maxNameLength characters, and never
 * a name `Object.prototype` already answers to (`__proto__`, `constructor`, …) — the table
 * is a `Map` anyway, but a name like that is a sign of a hostile file, not a design.
 *
 * @param {unknown} name
 * @returns {string | null}
 */
export function variableNameError(name) {
  if (typeof name !== 'string' || name.length === 0) return 'a variable needs a name'
  if (name.length > VARIABLE_LIMITS.maxNameLength) {
    return `a variable name is at most ${VARIABLE_LIMITS.maxNameLength} characters long (this one is ${name.length})`
  }
  if (!NAME_PATTERN.test(name)) {
    return `variable name ${JSON.stringify(name)} must start with a letter or _ and use only letters, digits and _`
  }
  if (name in Object.prototype || name === 'prototype') return `variable name ${JSON.stringify(name)} is reserved`
  return null
}

/**
 * Why a variable definition (a `var.define` record's params) is not usable, or `null`.
 *
 * @param {unknown} definition
 * @returns {string | null}
 */
export function variableDefinitionError(definition) {
  if (!isPlainObject(definition)) return 'a variable definition must be an object'
  const nameError = variableNameError(definition.name)
  if (nameError !== null) return nameError
  const { kind, value } = definition
  if (!VARIABLE_KINDS.includes(/** @type {any} */ (kind))) {
    return `variable "${definition.name}" has kind ${JSON.stringify(kind)} — expected one of ${VARIABLE_KINDS.join(', ')}`
  }
  if (definition.label !== undefined) {
    if (typeof definition.label !== 'string') return `variable "${definition.name}": its label must be text`
    if (definition.label.length > VARIABLE_LIMITS.maxLabelLength) {
      return `variable "${definition.name}": its label is longer than ${VARIABLE_LIMITS.maxLabelLength} characters`
    }
  }
  const allowed = new Set(['name', 'kind', 'value', 'label'])
  if (kind === 'number') {
    for (const key of ['unit', 'min', 'max']) allowed.add(key)
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `variable "${definition.name}" is a number, but its value is ${JSON.stringify(value)}`
    }
    if (definition.unit !== undefined && !VARIABLE_UNITS.includes(definition.unit)) {
      return `variable "${definition.name}": unit ${JSON.stringify(definition.unit)} is not one of mm, deg or none`
    }
    for (const key of /** @type {const} */ (['min', 'max'])) {
      const limit = definition[key]
      if (limit !== undefined && (typeof limit !== 'number' || !Number.isFinite(limit))) {
        return `variable "${definition.name}": ${key} must be a finite number`
      }
    }
    const { min, max } = definition
    if (min !== undefined && max !== undefined && min > max) {
      return `variable "${definition.name}": min ${min} is above max ${max}`
    }
    if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
      return `variable "${definition.name}" must be between ${min ?? '-∞'} and ${max ?? '∞'}, got ${value}`
    }
  } else if (kind === 'boolean') {
    if (typeof value !== 'boolean') {
      return `variable "${definition.name}" is a yes/no, but its value is ${JSON.stringify(value)}`
    }
  } else {
    allowed.add('options')
    const { options } = definition
    if (!Array.isArray(options) || options.length === 0) {
      return `variable "${definition.name}" is a choice, and needs at least one option`
    }
    if (options.length > VARIABLE_LIMITS.maxOptions) {
      return `variable "${definition.name}" has ${options.length} options — at most ${VARIABLE_LIMITS.maxOptions}`
    }
    /** @type {any[]} */
    const seen = []
    for (const option of options) {
      if (!isPlainObject(option) || Object.keys(option).some((key) => key !== 'value' && key !== 'label')) {
        return `variable "${definition.name}": each option is { value, label }`
      }
      const optionValue = option.value
      if (!(typeof optionValue === 'string' || (typeof optionValue === 'number' && Number.isFinite(optionValue)))) {
        return `variable "${definition.name}": option value ${JSON.stringify(optionValue)} must be text or a number`
      }
      if (typeof option.label !== 'string' || option.label.length > VARIABLE_LIMITS.maxOptionLabelLength) {
        return `variable "${definition.name}": option ${JSON.stringify(optionValue)} needs a label of at most ${VARIABLE_LIMITS.maxOptionLabelLength} characters`
      }
      if (seen.some((other) => Object.is(other, optionValue))) {
        return `variable "${definition.name}": option ${JSON.stringify(optionValue)} appears twice`
      }
      seen.push(optionValue)
    }
    if (!seen.some((option) => Object.is(option, value))) {
      return `variable "${definition.name}" is ${JSON.stringify(value)}, which is not one of its options`
    }
  }
  const stranger = Object.keys(definition).find((key) => !allowed.has(key))
  if (stranger !== undefined) return `variable "${definition.name}" has an unknown field ${JSON.stringify(stranger)}`
  return null
}

/**
 * Why a whole `var.define` record is malformed, or `null` — its params, plus the record
 * fields a definition may never carry (it builds nothing, continues no lineage, reads
 * nothing, and is never conditional).
 *
 * @param {OpRecord} record
 * @returns {string | null}
 */
export function variableRecordError(record) {
  if (typeof record.id !== 'string' || record.id.length === 0) return 'a variable definition needs an id'
  for (const field of ['supersedes', 'consumes', 'target', 'operands', 'when', 'name']) {
    if (/** @type {any} */ (record)[field] !== undefined) {
      return `a variable definition may not carry \`${field}\` — it builds nothing and reads nothing`
    }
  }
  return variableDefinitionError(record.params)
}

/**
 * Where a binding sits: the top-level param `key`, and the array `index` for an element.
 * Carried structurally — never re-parsed out of `path` — so a hostile param key with a `.`
 * in it cannot be mistaken for an element address.
 *
 * @typedef {object} Slot
 * @property {string} key
 * @property {number} [index]
 */

/**
 * Walk a params value for binding claims, calling `visit` with each one's path (for
 * messages), whether it sits somewhere a binding may stand (a whole value or one array
 * element), and its {@link Slot}.
 *
 * @param {Record<string, any>} params
 * @param {(path: string, binding: { $var: unknown }, placement: 'whole' | 'element' | 'nested', slot: Slot) => void} visit
 * @returns {void}
 */
function walkBindings(params, visit) {
  /**
   * @param {unknown} value
   * @param {string} path
   * @param {number} depth
   * @param {'whole' | 'element' | 'nested'} placement
   * @param {Slot} slot
   */
  const walk = (value, path, depth, placement, slot) => {
    if (depth > MAX_WALK_DEPTH || value === null || typeof value !== 'object') return
    if (isBinding(value)) {
      visit(path, value, placement, slot)
      return
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) =>
        walk(entry, `${path}.${index}`, depth + 1, placement === 'whole' ? 'element' : 'nested', placement === 'whole' ? { key: slot.key, index } : slot),
      )
      return
    }
    for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`, depth + 1, 'nested', slot)
  }
  if (!isPlainObject(params)) return
  for (const [key, value] of Object.entries(params)) walk(value, key, 0, 'whole', { key })
}

/**
 * Params with one slot replaced — a copy, never the original. Written with
 * `defineProperty`, so a param key like `__proto__` from a hostile file is an own field like
 * any other, never the prototype.
 *
 * @param {Record<string, any>} params
 * @param {Slot} slot
 * @param {unknown} value
 * @returns {Record<string, any>}
 */
function withSlotValue(params, slot, value) {
  const next = { ...params }
  /** @type {unknown} */
  let field = value
  if (slot.index !== undefined) {
    const list = Array.isArray(params[slot.key]) ? params[slot.key].slice() : []
    list[slot.index] = value
    field = list
  }
  Object.defineProperty(next, slot.key, { value: field, enumerable: true, writable: true, configurable: true })
  return next
}

/** @type {WeakMap<object, number>} Record → how many binding claims its params carry. */
const bindingCountMemo = new WeakMap()

/**
 * How many binding claims a record's params carry — `0` for nearly every record. Memoised
 * per record object: records are immutable once in the log, and the fold asks every time.
 *
 * @param {OpRecord} record
 * @returns {number}
 */
export function bindingCountOf(record) {
  if (record === null || typeof record !== 'object') return 0
  const memo = bindingCountMemo.get(record)
  if (memo !== undefined) return memo
  let count = 0
  walkBindings(record.params ?? {}, () => {
    count += 1
  })
  bindingCountMemo.set(record, count)
  return count
}

/**
 * Does a record carry any binding claim?
 *
 * @param {OpRecord} record
 * @returns {boolean}
 */
export function hasBindings(record) {
  return bindingCountOf(record) > 0
}

/**
 * Does a record take part in variables at all — a definition, a binding, or a condition
 * that reads one? `document.js` re-folds the whole log on an append when the answer is yes
 * anywhere, exactly as it does for conditions.
 *
 * @param {OpRecord} record
 * @returns {boolean}
 */
export function usesVariables(record) {
  if (record === null || typeof record !== 'object') return false
  if (typeof record.op === 'string' && record.op.startsWith(VARIABLE_OP_PREFIX)) return true
  if (isPlainObject(record.when) && Object.hasOwn(record.when, 'var')) return true
  return hasBindings(record)
}

// --- reading the table ------------------------------------------------------------

/**
 * Every usable variable in a log, by name, and why each unusable definition is not.
 *
 * Only the **active** part counts — before the rollback marker, not suppressed — the same
 * rows the fold reads. The first definition of a name wins; a later one is a problem
 * (`problems` is keyed by record id, or `#<step>` for a record with none).
 *
 * @param {readonly DocumentEntry[]} entries
 * @param {number} [activeCount]
 * @returns {{ variables: Map<string, Variable>, problems: Map<string, string> }}
 */
export function readVariables(entries, activeCount = entries.length) {
  /** @type {Map<string, Variable>} */
  const variables = new Map()
  /** @type {Map<string, string>} */
  const problems = new Map()
  for (let index = 0; index < activeCount && index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry.suppressed === true || entry.record?.op !== VARIABLE_OP) continue
    const { record } = entry
    const key = record.id ?? `#${index + 1}`
    const problem = variableRecordError(record)
    if (problem !== null) {
      problems.set(key, problem)
      continue
    }
    const params = /** @type {Record<string, any>} */ (record.params)
    if (variables.has(params.name)) {
      problems.set(key, `a variable named "${params.name}" is already defined`)
      continue
    }
    if (variables.size >= VARIABLE_LIMITS.maxVariables) {
      problems.set(key, `a project holds at most ${VARIABLE_LIMITS.maxVariables} variables`)
      continue
    }
    variables.set(params.name, /** @type {Variable} */ (Object.freeze({ id: /** @type {string} */ (record.id), ...params })))
  }
  return { variables, problems }
}

/**
 * The variables a document currently has, in log order — what a Variables panel lists.
 *
 * @param {Pick<WarpDocument, 'entries' | 'rollbackAt'>} document
 * @returns {Variable[]}
 */
export function variablesOf(document) {
  return [...readVariables(document.entries, document.rollbackAt() ?? document.entries.length).variables.values()]
}

/**
 * A variable's value, in words: the option's label for a choice, else the value itself.
 *
 * @param {Variable} variable
 * @param {unknown} [value] Defaults to the variable's own.
 * @returns {string}
 */
export function variableValueLabel(variable, value = variable.value) {
  if (variable.kind === 'enum') {
    const option = variable.options?.find((candidate) => Object.is(candidate.value, value))
    if (option !== undefined) return option.label
  }
  if (variable.kind === 'boolean') return value === true ? 'yes' : 'no'
  return `${String(value)}${variable.kind === 'number' && variable.unit ? ` ${variable.unit}` : ''}`
}

// --- resolution ----------------------------------------------------------------------

/**
 * Replace every binding in `params` with its variable's value.
 *
 * Pure. Knows nothing about ops: it checks only that each binding is well formed, sits
 * where a binding may (a whole value, or one element of an array), and names a variable
 * that exists. Kind and range against the op's own schema are {@link resolveRecord}'s.
 * Returns the **same** object when nothing is bound, so a caller can compare by identity.
 *
 * @param {Record<string, any>} params
 * @param {ReadonlyMap<string, Variable>} variables
 * @returns {{ params: Record<string, any>, errors: BindingError[] }}
 */
export function resolveParams(params, variables) {
  /** @type {BindingError[]} */
  const errors = []
  /** @type {Array<{ slot: Slot, value: unknown }>} */
  const replacements = []
  walkBindings(params, (path, binding, placement, slot) => {
    const name = typeof binding.$var === 'string' ? binding.$var : ''
    const shape = bindingShapeError(binding)
    if (shape !== null) {
      errors.push({ path, name, reason: shape })
      return
    }
    if (placement === 'nested') {
      errors.push({ path, name, reason: 'a binding may stand for a whole param or one element of an array param, nothing deeper' })
      return
    }
    const variable = variables.get(name)
    if (variable === undefined) {
      errors.push({ path, name, reason: `"${name}" is not defined in this project` })
      return
    }
    replacements.push({ slot, value: variable.value })
  })
  if (replacements.length === 0) return { params, errors }
  let resolved = params
  for (const { slot, value } of replacements) resolved = withSlotValue(resolved, slot, value)
  return { params: resolved, errors }
}

/**
 * Why a record cannot carry bindings at all, or `null` — the refusals inherited from
 * `paramEdit.js` rather than invented: a record with no params of its own (a boolean, a
 * group, a reference photo, an undescribed composite), a variable definition (a binding
 * there would be a variable defined by itself), and a `transform.rotate` row, whose angles
 * produce the absolute rotation every later transform record carries forward — a bound
 * value there would be silently overwritten by the next transform.
 *
 * @param {Pick<OpRecord, 'op' | 'params'> & Partial<OpRecord>} record
 * @returns {string | null}
 */
export function bindabilityError(record) {
  if (record.op === VARIABLE_OP || record.op?.startsWith(VARIABLE_OP_PREFIX)) {
    return 'a variable definition cannot itself read a variable'
  }
  if (record.op === 'transform.rotate') {
    return 'a rotate step\'s angles become the absolute rotation every later move carries, so a bound value would be silently overwritten — rotations are not bindable'
  }
  if (record.consumes !== undefined) {
    return `a ${record.op} step has no params of its own — its geometry is its operands`
  }
  const verdict = stepParamEditability(/** @type {OpRecord} */ (record))
  if (!verdict.editable) {
    return lookupEntry(record.op)?.kind === 'composite'
      ? `${record.op} does not describe its params, so none of them can be bound`
      : `a ${record.op} step has no params that can be bound`
  }
  return null
}

/**
 * The schema field for a param after resolution, or `undefined` for one the registry does
 * not describe.
 *
 * @param {string} op
 * @param {Record<string, any>} params
 * @param {ParamTables | undefined} tables
 * @returns {Readonly<Record<string, ParamSchema>>}
 */
function schemaOf(op, params, tables) {
  return tables === undefined ? paramOptions(op, params) : paramOptions(op, params, tables)
}

/**
 * Check one resolved binding against what its slot accepts. Returns the problem, or `null`.
 *
 * @param {Variable} variable
 * @param {ParamSchema | undefined} field The slot's schema, if the registry describes it.
 * @param {'whole' | 'element'} placement
 * @returns {string | null}
 */
function slotProblem(variable, field, placement) {
  const kindWord = { number: 'a number', boolean: 'a yes/no', enum: 'a choice' }[variable.kind]
  if (field !== undefined) {
    if (placement === 'element') return `which is ${kindWord}, but this param is not a list`
    if (field.kind === 'number') {
      if (variable.kind !== 'number') return `which is ${kindWord}, but this param takes a number`
      const value = /** @type {number} */ (variable.value)
      if (field.exclusiveMin !== undefined && !(value > field.exclusiveMin)) {
        return `which is ${value}, and this param must be greater than ${field.exclusiveMin}${field.unit ? ` ${field.unit}` : ''}`
      }
      if ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) {
        return `which is ${value}, and this param must be between ${field.min ?? '-∞'} and ${field.max ?? '∞'}${field.unit ? ` ${field.unit}` : ''}`
      }
      return null
    }
    if (variable.kind !== 'enum') return `which is ${kindWord}, but this param is a choice`
    if (!field.options.some((option) => Object.is(option.value, variable.value))) {
      return `which is ${JSON.stringify(variable.value)}, and that is not one of this param's choices`
    }
    return null
  }
  if (placement === 'element') {
    if (variable.kind !== 'number') return `which is ${kindWord}, but an element of this list takes a number`
    return null
  }
  return null
}

/** @type {WeakMap<object, { key: string, result: { record: OpRecord, errors: string[] } }>} */
const resolveMemo = new WeakMap()

/**
 * Resolve one record's bindings against the variable table, checked against the record's
 * own op schema — the one function the fold calls before a record reaches the kernel.
 *
 * Returns the **same record object** when it carries no binding, and the same resolved
 * object as last time while the variables it reads are unchanged — so the kernel's per-
 * record fold cache (`TODO/core-031`, keyed by record identity) still hits.
 *
 * @param {OpRecord} record
 * @param {ReadonlyMap<string, Variable>} variables
 * @param {{ tables?: ParamTables, recordName?: string }} [options] `tables` replaces the
 *   real size tables (a spec's fake); `recordName` is how the errors name the record.
 * @returns {{ record: OpRecord, errors: string[] }}
 */
export function resolveRecord(record, variables, options = {}) {
  if (!hasBindings(record)) return { record, errors: [] }

  /** @type {string[]} */
  const used = []
  walkBindings(record.params ?? {}, (_path, binding) => {
    used.push(typeof binding.$var === 'string' ? binding.$var : '')
  })
  const memoable = options.tables === undefined
  const key = memoable ? JSON.stringify([options.recordName ?? null, used.map((name) => variables.get(name) ?? null)]) : ''
  const memo = memoable ? resolveMemo.get(record) : undefined
  if (memo !== undefined && memo.key === key) return memo.result

  const result = resolveUncached(record, variables, options)
  if (memoable) resolveMemo.set(record, { key, result })
  return result
}

/**
 * @param {OpRecord} record
 * @param {ReadonlyMap<string, Variable>} variables
 * @param {{ tables?: ParamTables, recordName?: string }} options
 * @returns {{ record: OpRecord, errors: string[] }}
 */
function resolveUncached(record, variables, options) {
  const subject = options.recordName ?? (typeof record.name === 'string' && record.name.length > 0 ? record.name : record.id ?? record.op)
  /** @param {Slot} slot */
  const paramWords = (slot) => (slot.index === undefined ? slot.key : `${slot.key}[${slot.index}]`)

  const structural = bindabilityError(record)
  if (structural !== null) return { record, errors: [`${subject}: ${structural}`] }

  const params = record.params ?? {}
  /** @type {string[]} */
  const errors = []
  walkBindings(params, (_path, _binding, _placement, { key }) => {
    if (isReservedStepParam(key)) {
      errors.push(
        `${subject}'s ${key} cannot be bound — ${key === 'rotation' ? 'it is the absolute rotation every later move carries forward, so a bound value would be silently overwritten' : 'it is a tessellation detail, not a dimension'}`,
      )
    }
  })
  if (errors.length > 0) return { record, errors }

  const resolved = resolveParams(params, variables)
  for (const error of resolved.errors) {
    errors.push(`${subject}'s ${error.path} is bound to ${error.name ? `"${error.name}"` : 'nothing'}: ${error.reason}`)
  }
  if (errors.length > 0) return { record, errors }

  // Kind and range, against the registry's own schema for the params *after* resolution —
  // so a dependent option list (a bolt's `fit`) is the one for the resolved `spec`.
  const schema = schemaOf(record.op, resolved.params, options.tables)
  walkBindings(params, (_path, binding, placement, slot) => {
    const variable = /** @type {Variable} */ (variables.get(/** @type {string} */ (binding.$var)))
    const field = Object.hasOwn(schema, slot.key) ? schema[slot.key] : undefined
    const problem = slotProblem(variable, field, /** @type {'whole' | 'element'} */ (placement))
    if (problem !== null) errors.push(`${subject}'s ${paramWords(slot)} is bound to "${variable.name}", ${problem}`)
  })
  if (errors.length > 0) return { record, errors }

  // A dependent enum the record holds as a literal — or bound to a variable that is fine on
  // its own — may have been stranded by another binding (a spec change leaves the old fit).
  // Re-checked here, after everything it depends on resolved, and reported, never coerced.
  for (const [key, field] of Object.entries(schema)) {
    if (field.kind !== 'enum') continue
    const value = resolved.params[key]
    if (value === undefined) continue
    if (!field.options.some((option) => Object.is(option.value, value))) {
      const via = isBinding(params[key]) ? ` (from "${params[key].$var}")` : ''
      const choices = field.options.map((option) => JSON.stringify(option.value)).join(', ') || 'none'
      errors.push(`${subject}'s ${key} is ${JSON.stringify(value)}${via}, which is not one of its choices after its bound params resolved — expected one of ${choices}`)
    }
  }
  if (errors.length > 0) return { record, errors }

  return { record: { ...record, params: resolved.params }, errors: [] }
}

// --- what may be bound ----------------------------------------------------------------

/**
 * Every slot of a record's params the bind control may offer — data-driven from the
 * registry's schema (`paramOptions`) and `paramEdit.js`'s editability, never a hand list.
 *
 * - A **described composite** (`paramOptions` has entries) offers its schema params —
 *   enum and number, with their limits — plus any boolean it currently holds as a literal.
 * - Any **other** op offers each finite-number literal (whole, or each element of a number
 *   array) and each boolean literal. A slot already bound is offered with the kind its
 *   variable has, when `variables` is given.
 * - Never: `rotation`/`segments` (`paramEdit.js`'s reserved step params), or anything on a
 *   record {@link bindabilityError} refuses.
 *
 * @param {string} op
 * @param {Record<string, any>} params
 * @param {ParamTables} [tables] Size tables; the real ones by default.
 * @param {ReadonlyMap<string, Variable>} [variables] To type a slot that is already bound.
 * @returns {BindableSlot[]}
 */
export function bindableParams(op, params, tables = undefined, variables = undefined) {
  const source = isPlainObject(params) ? params : {}
  if (bindabilityError({ op, params: source }) !== null) return []
  const resolved = variables === undefined ? source : resolveParams(source, variables).params
  const schema = schemaOf(op, resolved, tables)
  /** @type {BindableSlot[]} */
  const slots = []
  const described = Object.keys(schema).length > 0

  /**
   * @param {unknown} value A literal, or a binding.
   * @returns {'number' | 'boolean' | null}
   */
  const literalKind = (value) => {
    const actual = isBinding(value) ? variables?.get(String(value.$var))?.value : value
    if (typeof actual === 'number' && Number.isFinite(actual)) return 'number'
    if (typeof actual === 'boolean') return 'boolean'
    return null
  }

  if (described) {
    for (const [key, field] of Object.entries(schema)) {
      if (field.kind === 'enum') {
        const dependsOn = op === 'hardware.bolt' && key === 'fit' ? ['spec'] : undefined
        slots.push({ path: key, key, kind: 'enum', label: field.label, options: field.options, ...(dependsOn ? { dependsOn } : {}) })
      } else {
        slots.push({
          path: key,
          key,
          kind: 'number',
          label: field.label,
          unit: field.unit,
          ...(field.exclusiveMin !== undefined ? { exclusiveMin: field.exclusiveMin } : {}),
          ...(field.min !== undefined ? { min: field.min } : {}),
          ...(field.max !== undefined ? { max: field.max } : {}),
        })
      }
    }
  }
  for (const [key, value] of Object.entries(source)) {
    if (isReservedStepParam(key) || schema[key] !== undefined) continue
    if (described) {
      if (literalKind(value) === 'boolean') slots.push({ path: key, key, kind: 'boolean' })
      continue
    }
    if (Array.isArray(value)) {
      if (value.length === 0 || !value.every((entry) => literalKind(entry) === 'number')) continue
      value.forEach((_entry, index) => slots.push({ path: `${key}.${index}`, key, index, kind: 'number' }))
      continue
    }
    const kind = literalKind(value)
    if (kind !== null) slots.push({ path: key, key, kind })
  }
  return slots
}

// --- who reads a variable ---------------------------------------------------------------

/**
 * Every record that reads a variable — its bindings, by slot, and its conditions — in log
 * order, across the whole log (suppressed and rolled-back rows included: a rename or a
 * delete has to rewrite those too, or they would dangle when brought back).
 *
 * @param {readonly DocumentEntry[]} entries
 * @param {string} name
 * @returns {VariableConsumer[]}
 */
export function consumersOf(entries, name) {
  /** @type {VariableConsumer[]} */
  const consumers = []
  for (const { record } of entries) {
    if (record.op === VARIABLE_OP) continue
    const display = typeof record.name === 'string' && record.name.length > 0 ? record.name : record.id ?? record.op
    const recordId = record.id ?? ''
    if (hasBindings(record)) {
      walkBindings(record.params ?? {}, (path, binding) => {
        if (binding.$var === name) consumers.push({ recordId, name: display, kind: 'binding', path })
      })
    }
    if (isPlainObject(record.when) && record.when.var === name) consumers.push({ recordId, name: display, kind: 'condition' })
  }
  return consumers
}

// --- the commands -------------------------------------------------------------------------

/**
 * @param {WarpDocument} document
 * @returns {ReadonlyMap<string, Variable>}
 */
function tableOf(document) {
  return readVariables(document.entries, document.rollbackAt() ?? document.entries.length).variables
}

/**
 * @param {WarpDocument} document
 * @param {string} name
 * @returns {Variable}
 */
function requireVariable(document, name) {
  const variable = tableOf(document).get(name)
  if (variable === undefined) throw new VariableError(`there is no variable named ${JSON.stringify(name)} in this project`)
  return variable
}

/**
 * @param {WarpDocument} document
 * @param {string} id
 * @returns {OpRecord}
 */
function requireRecord(document, id) {
  const record = document.entries.find((entry) => entry.record.id === id)?.record
  if (record === undefined) throw new VariableError(`there is no step "${id}" in this document`)
  return record
}

/**
 * A record's display name, the way the History names it — the lineage root's name for a
 * transform that carries none of its own.
 *
 * @param {WarpDocument} document
 * @param {OpRecord} record
 * @returns {string}
 */
function displayNameOf(document, record) {
  if (typeof record.name === 'string' && record.name.length > 0) return record.name
  const root = record.id === undefined ? undefined : document.rootOf(record.id)
  const rootName = root === undefined ? undefined : document.recordOf(root)?.name
  return rootName ?? record.id ?? record.op
}

/**
 * Params with every binding to `name` replaced by `replace(binding)`.
 *
 * @param {Record<string, any>} params
 * @param {string} name
 * @param {() => unknown} replace
 * @returns {Record<string, any>}
 */
function rewriteBindings(params, name, replace) {
  /** @type {Slot[]} */
  const slots = []
  walkBindings(params, (_path, binding, placement, slot) => {
    if (binding.$var === name && placement !== 'nested') slots.push(slot)
  })
  let next = params
  for (const slot of slots) next = withSlotValue(next, slot, replace())
  return next
}

/**
 * @param {TransactionOptions} transaction
 * @param {string} label
 * @returns {TransactionOptions}
 */
function labelled(transaction, label) {
  return { label, ...transaction }
}

/**
 * Define a new variable — one appended `var.define` record, one Undo step.
 *
 * @param {WarpDocument} document
 * @param {{ name: string, kind: 'number' | 'boolean' | 'enum', value: number | boolean | string, label?: string, unit?: 'mm' | 'deg' | '', min?: number, max?: number, options?: readonly VariableOption[] }} definition
 * @param {TransactionOptions} transaction
 * @returns {{ record: OpRecord, scene: import('./replay.js').Scene }}
 * @throws {VariableError} For a malformed definition or a name already taken.
 */
export function defineVariable(document, definition, transaction) {
  const problem = variableDefinitionError(definition)
  if (problem !== null) throw new VariableError(problem)
  const table = tableOf(document)
  if (table.has(definition.name)) throw new VariableError(`a variable named "${definition.name}" is already defined`)
  if (table.size >= VARIABLE_LIMITS.maxVariables) {
    throw new VariableError(`a project holds at most ${VARIABLE_LIMITS.maxVariables} variables`)
  }
  /** @type {Record<string, any>} */
  const params = JSON.parse(JSON.stringify(definition))
  const record = { id: document.nextId('var'), op: VARIABLE_OP, params }
  return document.append(record, labelled(transaction, `Define ${definition.name}`))
}

/**
 * Change a variable's value — a `reviseRecords` on its one definition record, so every
 * bound param on every body takes the new value in **one** re-fold and **one** Undo step.
 * Run `dependents.js`'s `variableImpactOf` first to show what it would break.
 *
 * @param {WarpDocument} document
 * @param {string} name
 * @param {number | boolean | string} value
 * @param {TransactionOptions} transaction
 * @returns {{ scene: import('./replay.js').Scene }}
 * @throws {VariableError} For an unknown variable or a value outside its own kind/range/options.
 */
export function setVariable(document, name, value, transaction) {
  const revision = setVariableRevision(document, name, value)
  if (revision === null) return { scene: document.scene }
  const variable = requireVariable(document, name)
  return document.reviseRecords([revision], labelled(transaction, `Set ${name} to ${variableValueLabel(variable, value)}`))
}

/**
 * The revision {@link setVariable} commits — what an impact check previews.
 *
 * @param {WarpDocument} document
 * @param {string} name
 * @param {unknown} value
 * @returns {RecordRevision | null} `null` when the value is unchanged.
 * @throws {VariableError}
 */
export function setVariableRevision(document, name, value) {
  const variable = requireVariable(document, name)
  const record = requireRecord(document, variable.id)
  const params = { ...record.params, value }
  const problem = variableDefinitionError(params)
  if (problem !== null) throw new VariableError(problem)
  if (Object.is(record.params?.value, value)) return null
  return { id: variable.id, record: { ...record, params } }
}

/**
 * Bind one param slot (`size.0`, `length`) of a record to a variable. The slot must be one
 * {@link bindableParams} offers, and the variable's kind and value must fit it.
 *
 * @param {WarpDocument} document
 * @param {string} recordId
 * @param {string} path
 * @param {string} name
 * @param {TransactionOptions} transaction
 * @returns {{ scene: import('./replay.js').Scene }}
 * @throws {VariableError}
 */
export function bindParam(document, recordId, path, name, transaction) {
  const record = requireRecord(document, recordId)
  const variable = requireVariable(document, name)
  const subject = displayNameOf(document, record)
  const structural = bindabilityError(record)
  if (structural !== null) throw new VariableError(`${subject}: ${structural}`)
  const key = path.split('.')[0]
  if (isReservedStepParam(key) || isReservedStepParam(path)) {
    throw new VariableError(`${subject}'s ${key} cannot be bound — ${key === 'rotation' ? 'it is carried forward as an absolute rotation by every later move' : 'it is a tessellation detail'}`)
  }
  const slots = bindableParams(record.op, record.params ?? {}, undefined, tableOf(document))
  const slot = slots.find((candidate) => candidate.path === path)
  if (slot === undefined) {
    throw new VariableError(
      `${subject} has no bindable param "${path}" — bindable: ${slots.map((candidate) => candidate.path).join(', ') || 'none'}`,
    )
  }
  const kindFits = slot.kind === variable.kind
  if (!kindFits) {
    throw new VariableError(`${subject}'s ${path} takes ${slot.kind === 'enum' ? 'a choice' : slot.kind === 'boolean' ? 'a yes/no' : 'a number'}, and "${name}" is ${variable.kind === 'enum' ? 'a choice' : variable.kind === 'boolean' ? 'a yes/no' : 'a number'}`)
  }
  const params = withSlotValue(record.params ?? {}, slot, { [BINDING_KEY]: name })
  const check = resolveRecord({ ...record, params }, tableOf(document), { recordName: subject })
  if (check.errors.length > 0) throw new VariableError(check.errors[0])
  return document.reviseRecords([{ id: recordId, record: { ...record, params } }], labelled(transaction, `Bind ${subject} ${path} to ${name}`))
}

/**
 * Replace a binding with the value it currently resolves to — the record keeps its
 * geometry, and stops following the variable.
 *
 * @param {WarpDocument} document
 * @param {string} recordId
 * @param {string} path
 * @param {TransactionOptions} transaction
 * @returns {{ scene: import('./replay.js').Scene }}
 * @throws {VariableError}
 */
export function unbindParam(document, recordId, path, transaction) {
  const record = requireRecord(document, recordId)
  const subject = displayNameOf(document, record)
  /** @type {{ slot: Slot, binding: { $var: unknown } } | undefined} */
  let found
  walkBindings(record.params ?? {}, (candidate, binding, placement, slot) => {
    if (candidate === path && placement !== 'nested') found = { slot, binding }
  })
  if (found === undefined) throw new VariableError(`${subject}'s ${path} is not bound to a variable`)
  const { slot, binding: current } = found
  const variable = tableOf(document).get(String(current.$var))
  if (variable === undefined) {
    throw new VariableError(`${subject}'s ${path} is bound to "${String(current.$var)}", which is not defined — there is no current value to keep; type one in instead`)
  }
  const params = withSlotValue(record.params ?? {}, slot, variable.value)
  return document.reviseRecords([{ id: recordId, record: { ...record, params } }], labelled(transaction, `Unbind ${subject} ${path}`))
}

/**
 * Rename a variable: its definition and every binding and condition that names it, in one
 * `reviseRecords` batch — one Undo step. Bindings are by name, so this is the whole cost of
 * a readable log.
 *
 * @param {WarpDocument} document
 * @param {string} from
 * @param {string} to
 * @param {TransactionOptions} transaction
 * @returns {{ scene: import('./replay.js').Scene }}
 * @throws {VariableError}
 */
export function renameVariable(document, from, to, transaction) {
  const variable = requireVariable(document, from)
  const nameError = variableNameError(to)
  if (nameError !== null) throw new VariableError(nameError)
  if (from === to) return { scene: document.scene }
  if (tableOf(document).has(to) || document.entries.some((entry) => entry.record.op === VARIABLE_OP && entry.record.params?.name === to)) {
    throw new VariableError(`a variable named "${to}" is already defined`)
  }
  /** @type {RecordRevision[]} */
  const changes = []
  for (const { record } of document.entries) {
    if (record.id === undefined) continue
    if (record.id === variable.id) {
      changes.push({ id: record.id, record: { ...record, params: { ...record.params, name: to } } })
      continue
    }
    let next = record
    if (hasBindings(record)) {
      const params = rewriteBindings(record.params ?? {}, from, () => ({ [BINDING_KEY]: to }))
      if (params !== record.params) next = { ...next, params }
    }
    if (isPlainObject(record.when) && record.when.var === from) next = { ...next, when: { ...record.when, var: to } }
    if (next !== record) changes.push({ id: record.id, record: next })
  }
  return document.reviseRecords(changes, labelled(transaction, `Rename ${from} to ${to}`))
}

/**
 * Delete a variable. Refused, with the list of consumers, while anything reads it — unless
 * `keepValues`, which rewrites every binding to the literal it currently resolves to in the
 * same transaction (one Undo step), so nothing is left dangling. A **condition** that reads
 * the variable has no literal to keep and still refuses the delete: edit or remove it first.
 *
 * @param {WarpDocument} document
 * @param {string} name
 * @param {TransactionOptions} transaction
 * @param {{ keepValues?: boolean }} [options]
 * @returns {{ scene: import('./replay.js').Scene }}
 * @throws {VariableInUseError | VariableError}
 */
export function deleteVariable(document, name, transaction, options = {}) {
  const variable = requireVariable(document, name)
  const consumers = consumersOf(document.entries, name).map((consumer) => {
    const record = document.entries.find((entry) => entry.record.id === consumer.recordId)?.record
    return record === undefined ? consumer : { ...consumer, name: displayNameOf(document, record) }
  })
  if (consumers.length > 0 && options.keepValues !== true) throw new VariableInUseError(name, consumers)
  const conditions = consumers.filter((consumer) => consumer.kind === 'condition')
  if (conditions.length > 0) {
    throw new VariableInUseError(name, conditions, ' as a condition, which has no value to keep')
  }
  /** @type {RecordRevision[]} */
  const changes = []
  for (const { record } of document.entries) {
    if (record.id === undefined || record.op === VARIABLE_OP || !hasBindings(record)) continue
    const params = rewriteBindings(record.params ?? {}, name, () => variable.value)
    if (params !== record.params) changes.push({ id: record.id, record: { ...record, params } })
  }
  return document.reviseRecords(changes, labelled(transaction, `Delete variable ${name}`), { remove: [variable.id] })
}
