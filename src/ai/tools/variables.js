// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The project-variable tools (`TODO/ai-014`): `list_variables`, `define_variable`,
 * `set_variable`, `bind_param`, `unbind_param`, `rename_variable` and `delete_variable`; and the
 * formula tools (`TODO/FIND-core-078`): `define_formula`, `set_formula` and `evaluate_formula`.
 *
 * Each is a **thin wrapper** over `src/core/variables.js` and `dependents.variableImpactOf`,
 * the same functions the Variables panel and the bind control use (`ui-059`'s
 * `useVariableCommands`), so a model and a person drive variables through one path. No rule
 * lives here: what may be bound is `bindableParams`'/`bindabilityError`'s, every refusal is
 * core's own sentence passed through unchanged, and a value change is judged by the impact
 * check before anything is written.
 *
 * ## Not a kernel op
 *
 * `var.define` and `var.derive` are not in the kernel registry (`docs/decisions/project-variables.md`),
 * so `create` and `apply_records` cannot write one and `list_ops` never offers either. These tools
 * are the only write path.
 *
 * ## Writes
 *
 * Every write runs inside `document.batch` with `ctx.origin` (`ai` or `mcp`, never `local`),
 * so none reaches the user's undo stack, and a refusal leaves the document exactly as it was.
 * `define_variable` and `define_formula` each append one record and are charged one against the
 * turn's record caps, like any append. The others **revise** rows in place (a `reviseRecords`), append nothing,
 * and are bounded by the step cap: a rename that rewrites sixty bindings is one call, not
 * sixty records, and charging it as sixty would refuse a legitimate edit on a large project.
 *
 * `set_variable` runs `variableImpactOf` first, and `set_formula` runs `formulaImpactOf`. When the new value would break a dependent
 * (a Snap onto a part the new Pi model lacks), it writes **nothing** and returns the
 * breakages by name — the same decision the Variables panel makes before it opens the repair
 * dialog — so the model can tell the user, or fix the dependent first, rather than leave a
 * broken row behind.
 *
 * A write's optional `rationale` becomes design intent where the call appends a record
 * (`define_variable`, `define_formula`). A revision keeps the row's existing intent: intent lives on the log
 * entry beside its origin, and `reviseRecords` changes the record, not the entry.
 *
 * `evaluate_formula` writes nothing: it is `evaluateFormulaIn`, so a model can check a sum before
 * committing to it. A formula's result reaches a param only through the same resolution and op
 * validation as a literal (`resolveRecord`); these tools add no path of their own.
 *
 * ## Untrusted text
 *
 * Variable names, labels, option labels, formulas and the body and part names inside them come
 * from the project file. They are returned as
 * plain JSON values; both transports wrap every tool result in `document_data`
 * (`src/ai/documentData.js`) before a model reads it, so they arrive as data, never as
 * instructions.
 *
 * @module ai/tools/variables
 */

import { formulaImpactOf, variableImpactOf } from '../../core/dependents.js'
import { ReplayRejection } from '../../core/document.js'
import { FORMULA_FUNCTIONS, FORMULA_LIMITS } from '../../core/formula.js'
import { composeIntent } from '../../core/intent.js'
import {
  VARIABLE_KINDS,
  VARIABLE_LIMITS,
  VARIABLE_UNITS,
  VariableError,
  VariableInUseError,
  bindParam,
  bindabilityError,
  bindableParams,
  consumersOf,
  defineFormula,
  defineVariable,
  deleteVariable,
  displayFormulaOf,
  evaluateFormulaIn,
  formulaInputsOf,
  isBinding,
  isFormula,
  readVariables,
  renameVariable,
  setFormula,
  setFormulaRevision,
  setVariable,
  setVariableRevision,
  unbindParam,
  variableValueLabel,
  variablesOf,
} from '../../core/variables.js'
import { assertWriteOrigin } from './limits.js'
import { sceneSummary } from './read.js'
import { objectSchema, withRationale } from './schema.js'

/** @typedef {import('./index.js').Tool} Tool */
/** @typedef {import('./index.js').ToolContext} ToolContext */
/** @typedef {import('./schema.js').JsonSchema} JsonSchema */
/** @typedef {import('../../core/document.js').WarpDocument} WarpDocument */
/** @typedef {import('../../core/variables.js').Variable} Variable */
/** @typedef {import('../../core/dependents.js').Breakage} Breakage */

// --- schemas ----------------------------------------------------------------

/** @type {JsonSchema} */
const NAME = {
  type: 'string',
  description: `A variable name: letters, digits and _, not starting with a digit, at most ${VARIABLE_LIMITS.maxNameLength} characters (e.g. "piModel", "wall").`,
}

/** @type {JsonSchema} */
const VALUE = {
  description: 'The value: a number (in the variable’s unit) for kind number, true/false for boolean, one option’s value for enum.',
  anyOf: [{ type: 'number' }, { type: 'boolean' }, { type: 'string' }],
}

/** @type {JsonSchema} */
const RECORD_ID = {
  type: 'string',
  description:
    'The step to bind: a body id from describe_scene binds that body’s creation step; any step id from get_timeline binds that step.',
}

/** @type {JsonSchema} */
const PATH = {
  type: 'string',
  description: 'The param slot: "model" for a whole param, "size.2" for one element of an array param. list_variables with this id lists the slots.',
}

/** @type {JsonSchema} */
const DEFINE_SCHEMA = withRationale(
  objectSchema(
    {
      name: NAME,
      kind: { type: 'string', enum: [...VARIABLE_KINDS], description: 'number, boolean, or enum (a choice from options).' },
      value: VALUE,
      label: { type: 'string', description: `Optional display name for the Variables panel, at most ${VARIABLE_LIMITS.maxLabelLength} characters.` },
      unit: { type: 'string', enum: [...VARIABLE_UNITS], description: 'Optional, kind number only: "mm" for a length, "deg" for an angle, "" for a plain count.' },
      min: { type: 'number', description: 'Kind number only: the smallest value allowed. Set it on every variable a person is meant to change.' },
      max: { type: 'number', description: 'Kind number only: the largest value allowed. Set it on every variable a person is meant to change.' },
      options: {
        type: 'array',
        description: 'Kind enum only: the choices, each a value and the label a person reads. To bind a param like a Pi’s model, use the values that param offers (see list_variables with its id).',
        items: objectSchema(
          { value: { anyOf: [{ type: 'number' }, { type: 'string' }] }, label: { type: 'string' } },
          ['value', 'label'],
        ),
      },
    },
    ['name', 'kind', 'value'],
  ),
)

/** @type {JsonSchema} */
const FORMULA = {
  type: 'string',
  description:
    `A formula, at most ${FORMULA_LIMITS.maxLength} characters: numbers, variables by name, + - * / and ( ), and part sizes read as body.part.quantity or body.quantity. ` +
    'A quantity is width, depth or height (the world X, Y and Z extent in mm), or size.x|y|z, min.x|y|z, max.x|y|z, center.x|y|z. ' +
    'Name a body by its name, in [brackets] when the name has spaces or hyphens ([Cube 1], [pi-mb]), or by its id from describe_scene as #id. ' +
    `Functions use call syntax, trig in degrees: ${FORMULA_FUNCTIONS.map((entry) => `${entry.name}()`).join(', ')}. ` +
    'e.g. "group1.part1.width - (group1.part2.width / 2)", "Base.max.z - Lid.min.z", "ceilTo(wall, 0.4)".',
}

/** @type {JsonSchema} */
const DEFINE_FORMULA_SCHEMA = withRationale(
  objectSchema(
    {
      name: NAME,
      formula: FORMULA,
      label: { type: 'string', description: `Optional display name for the Variables panel, at most ${VARIABLE_LIMITS.maxLabelLength} characters.` },
      unit: { type: 'string', enum: [...VARIABLE_UNITS], description: 'Optional label for the result: "mm" for a length, "deg" for an angle, "" for a plain count.' },
      min: { type: 'number', description: 'Optional: the smallest value the result may have. A result outside min/max is an error, never clamped.' },
      max: { type: 'number', description: 'Optional: the largest value the result may have.' },
    },
    ['name', 'formula'],
  ),
)

// --- helpers ------------------------------------------------------------------

/**
 * The transaction a variable write commits under: the transport's origin, and the design
 * intent where the write appends a record.
 *
 * @param {ToolContext} ctx
 * @param {string | undefined} rationale
 * @returns {{ origin: string, intent?: string }}
 */
function transactionOf(ctx, rationale) {
  assertWriteOrigin(ctx.origin)
  const intent = composeIntent(ctx.request ?? ctx.prompt?.text, rationale)
  return intent === undefined ? { origin: ctx.origin } : { origin: ctx.origin, intent }
}

/**
 * Run one core command atomically, turning core's refusals into a tool result. Anything else
 * is a bug and is rethrown.
 *
 * @template T
 * @param {WarpDocument} document
 * @param {() => T} command
 * @returns {{ ok: T } | { refused: Record<string, any> }}
 */
function attempt(document, command) {
  try {
    return { ok: document.batch(command) }
  } catch (error) {
    if (error instanceof VariableInUseError) return { refused: { error: error.message, usedBy: error.consumers } }
    if (error instanceof VariableError) return { refused: { error: error.message } }
    if (error instanceof ReplayRejection) return { refused: { error: error.message, step: error.step.step, reason: error.step.reason } }
    throw error
  }
}

/**
 * @param {WarpDocument} document
 * @returns {ReadonlyMap<string, Variable>}
 */
function tableOf(document) {
  return readVariables(document.entries, document.rollbackAt() ?? document.entries.length).variables
}

/**
 * A variable as the model reads it, with what reads it. A formula (`TODO/FIND-core-078`) also
 * carries its text as a person reads it (`formula`), the form the file stores (`stored`), what it
 * reads, and — from the last fold — its `error` or `varies`; one with no value has no `valueLabel`.
 *
 * @param {WarpDocument} document
 * @param {Variable} variable As {@link variablesOf} gives it, so a measuring formula has its value.
 * @returns {Record<string, any>}
 */
function variableSummary(document, variable) {
  const { id, ...definition } = variable
  const formula = isFormula(variable)
    ? {
        formula: displayFormulaOf(document, variable),
        stored: variable.formula,
        reads: formulaInputsOf(document, /** @type {string} */ (variable.formula)),
        varies: variable.varies ?? [],
      }
    : {}
  return {
    ...definition,
    ...formula,
    ...(variable.value === undefined ? {} : { valueLabel: variableValueLabel(variable) }),
    recordId: id,
    usedBy: consumersOf(document.entries, variable.name),
  }
}

/**
 * One variable as {@link variablesOf} gives it — a measuring formula with its end-of-log value.
 *
 * @param {WarpDocument} document
 * @param {string} name
 * @returns {Variable | undefined}
 */
function variableNamed(document, name) {
  return variablesOf(document).find((variable) => variable.name === name)
}

/**
 * How far a change reaches: the bound params that follow it (directly, or through a formula) and
 * the parts they sit on. The formulas in between are not params, so they are not counted.
 *
 * @param {WarpDocument} document
 * @param {readonly import('../../core/variables.js').VariableConsumer[]} consumers
 * @returns {{ params: number, parts: number }}
 */
function reachOf(document, consumers) {
  const params = consumers.filter((consumer) => consumer.kind !== 'formula')
  return { params: params.length, parts: new Set(params.map((consumer) => document.rootOf(consumer.recordId) ?? consumer.recordId)).size }
}

/**
 * A breakage, compactly: what no longer builds and why, without the repair dialog's lists.
 *
 * @param {Breakage} breakage
 * @returns {Record<string, any>}
 */
function breakageSummary(breakage) {
  return {
    step: breakage.step,
    recordId: breakage.dependentRecordId,
    bodyId: breakage.dependentBodyId,
    body: breakage.dependentName,
    relationship: breakage.relationship,
    reason: breakage.reason,
    ...(breakage.missingPieces.length > 0 ? { missingPieces: breakage.missingPieces } : {}),
  }
}

/**
 * The slots one record offers to bind, each with the variable it is bound to now — or, for a
 * record that can carry no binding, core's reason.
 *
 * @param {WarpDocument} document
 * @param {string} id
 * @returns {Record<string, any>}
 */
function bindableOf(document, id) {
  const record = document.entries.find((entry) => entry.record.id === id)?.record
  if (record === undefined) return { error: `There is no step "${id}" in this document. Body ids come from describe_scene, step ids from get_timeline.` }
  const reason = bindabilityError(record)
  if (reason !== null) return { bindable: { id, slots: [], reason } }
  const params = record.params ?? {}
  const slots = bindableParams(record.op, params, undefined, tableOf(document)).map((slot) => {
    const current = slot.index === undefined ? params[slot.key] : params[slot.key]?.[slot.index]
    return isBinding(current) ? { ...slot, boundTo: String(current.$var) } : slot
  })
  return { bindable: { id, slots } }
}

/**
 * The literal now in one slot (`key` or `key.index`).
 *
 * @param {Record<string, any>} params
 * @param {string} path
 * @returns {unknown}
 */
function valueAt(params, path) {
  const [key, index] = path.split('.')
  return index === undefined ? params[key] : params[key]?.[Number(index)]
}

/**
 * `piModel Pi 4 → Pi 5 — 1 parameter on 1 part changed`: the blast radius, as the Variables
 * panel announces it, with a choice named by its label.
 *
 * @param {Variable} variable
 * @param {unknown} next
 * @param {number} parameters
 * @param {number} parts
 * @returns {string}
 */
function summaryOf(variable, next, parameters, parts) {
  const noun = (/** @type {number} */ n, /** @type {string} */ word) => `${n} ${word}${n === 1 ? '' : 's'}`
  const tail = parameters === 0 ? 'nothing reads it yet' : `${noun(parameters, 'parameter')} on ${noun(parts, 'part')} changed`
  return `${variable.name} ${variableValueLabel(variable)} → ${variableValueLabel(variable, next)} — ${tail}`
}

// --- the tools ------------------------------------------------------------------

/** @returns {Tool} */
function createListVariablesTool() {
  return {
    name: 'list_variables',
    description:
      'List the project variables: each one’s name, kind, value (and that value in words), unit or options, and every step that reads it (usedBy). ' +
      'A calculated variable also lists its formula, the stored form, what it reads, any error, and varies: steps that read it before a later step changed what it measures. ' +
      'Pass id (a body or step id) to also list the param slots that step can bind, with what each is bound to now — or why it cannot be bound.',
    inputSchema: objectSchema({ id: { type: 'string', description: 'Optional: a body id from describe_scene or a step id from get_timeline.' } }),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      const variables = variablesOf(ctx.document).map((variable) => variableSummary(ctx.document, variable))
      if (input.id === undefined) return { count: variables.length, variables }
      const bindable = bindableOf(ctx.document, input.id)
      if (bindable.error !== undefined) return bindable
      return { count: variables.length, variables, ...bindable }
    },
  }
}

/** @returns {Tool} */
function createDefineVariableTool() {
  return {
    name: 'define_variable',
    description:
      'Define a new project variable: a named value (number, boolean, or a choice) that params on any body can be bound to, so one change updates them all — ' +
      'e.g. { "name": "piModel", "kind": "enum", "value": 4, "options": [{ "value": 4, "label": "Pi 4" }, { "value": 5, "label": "Pi 5" }] }. ' +
      'Then bind params to it with bind_param. For a number a person is meant to change, set min and max: the range readers see as safe to change. Refused, by name, if the name is taken.',
    inputSchema: DEFINE_SCHEMA,
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      const { rationale, ...definition } = input
      const hit = ctx.turn.canAppend(1)
      if (hit) return hit
      const tx = transactionOf(ctx, rationale)
      const done = attempt(ctx.document, () => defineVariable(ctx.document, definition, tx))
      if ('refused' in done) return done.refused
      ctx.turn.commitRecords(1)
      const variable = /** @type {Variable} */ (tableOf(ctx.document).get(definition.name))
      return { variable: variableSummary(ctx.document, variable), recordId: variable.id }
    },
  }
}

/** @returns {Tool} */
function createSetVariableTool() {
  return {
    name: 'set_variable',
    description:
      'Change a variable’s value; every param bound to it follows in one change. Checked first: if the new value would break a step that depends on a bound body ' +
      '(e.g. a Snap onto a part the new model does not have), nothing is changed and the result lists the breakages by name. ' +
      'Returns how many params on how many parts changed, and the scene.',
    inputSchema: withRationale(objectSchema({ name: NAME, value: VALUE }, ['name', 'value'])),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      const { document } = ctx
      const { name, value } = input
      if (isFormula(tableOf(document).get(name))) {
        return { error: `"${name}" is a formula, not a value, so it has no value to set. Change its formula with set_formula.` }
      }
      let revision
      try {
        revision = setVariableRevision(document, name, value)
      } catch (error) {
        if (error instanceof VariableError) return { error: error.message }
        throw error
      }
      const variable = /** @type {Variable} */ (tableOf(document).get(name))
      if (revision === null) return { name, unchanged: true, value, valueLabel: variableValueLabel(variable) }
      const { breakages, consumers } = variableImpactOf(document, name, value)
      const reach = reachOf(document, consumers)
      const parts = reach.parts
      const summary = summaryOf(variable, value, reach.params, parts)
      const shape = { name, from: variable.value, to: value, changedParams: reach.params, parts, summary }
      if (breakages.length > 0) {
        const n = breakages.length
        return {
          error:
            `Setting ${name} to ${variableValueLabel(variable, value)} would break ${n} step${n === 1 ? '' : 's'} that depend on a bound body, so nothing was changed. ` +
            'Tell the user, or change those steps first.',
          ...shape,
          breakages: breakages.map(breakageSummary),
        }
      }
      const tx = transactionOf(ctx, input.rationale)
      const done = attempt(document, () => setVariable(document, name, value, tx))
      if ('refused' in done) return done.refused
      return { ...shape, breakages: [], scene: sceneSummary(document) }
    },
  }
}

/** @returns {Tool} */
function createDefineFormulaTool() {
  return {
    name: 'define_formula',
    description:
      'Define a calculated variable: a number worked out from other variables and from the measured size and position of bodies and their parts, ' +
      'e.g. { "name": "overhang", "formula": "group1.part1.width - (group1.part2.width / 2)", "unit": "mm" }. Bind params to it with bind_param, as to any variable, ' +
      'and they follow when the parts it reads change. A param reads the parts as they stand just above its own step. ' +
      'Returns its value, the stored form (bodies by #id) and what it reads. Check a formula first with evaluate_formula. Refused, by name, when it cannot be worked out.',
    inputSchema: DEFINE_FORMULA_SCHEMA,
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      const { rationale, ...definition } = input
      const hit = ctx.turn.canAppend(1)
      if (hit) return hit
      const tx = transactionOf(ctx, rationale)
      const done = attempt(ctx.document, () => defineFormula(ctx.document, definition, tx))
      if ('refused' in done) return done.refused
      ctx.turn.commitRecords(1)
      const variable = /** @type {Variable} */ (variableNamed(ctx.document, definition.name))
      return { variable: variableSummary(ctx.document, variable), recordId: variable.id }
    },
  }
}

/** @returns {Tool} */
function createSetFormulaTool() {
  return {
    name: 'set_formula',
    description:
      'Change a calculated variable’s formula; every param bound to it follows in one change. Checked first: if the new value would break a step that depends on a bound body, ' +
      'nothing is changed and the result lists the breakages by name. Returns the formula and value before and after, how many params on how many parts changed, and the scene.',
    inputSchema: withRationale(objectSchema({ name: NAME, formula: FORMULA }, ['name', 'formula'])),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      const { document } = ctx
      const { name, formula } = input
      const variable = variableNamed(document, name)
      if (variable !== undefined && !isFormula(variable)) {
        return { error: `"${name}" is a value, not a formula. Change its value with set_variable.` }
      }
      let revision
      try {
        revision = setFormulaRevision(document, name, formula)
      } catch (error) {
        if (error instanceof VariableError) return { error: error.message }
        throw error
      }
      const current = /** @type {Variable} */ (variable)
      const from = displayFormulaOf(document, current)
      if (revision === null) return { name, unchanged: true, formula: from, value: current.value }
      const { breakages, consumers, preview } = formulaImpactOf(document, name, formula)
      const next = variableNamed(preview, name)
      const reach = reachOf(document, consumers)
      const shape = {
        name,
        from,
        to: displayFormulaOf(preview, { formula: revision.record?.params?.formula }),
        valueFrom: current.value,
        valueTo: next?.value,
        changedParams: reach.params,
        parts: reach.parts,
        summary: summaryOf(current, next?.value, reach.params, reach.parts),
      }
      if (breakages.length > 0) {
        const n = breakages.length
        return {
          error:
            `Changing ${name}'s formula would break ${n} step${n === 1 ? '' : 's'} that depend on a bound body, so nothing was changed. ` +
            'Tell the user, or change those steps first.',
          ...shape,
          breakages: breakages.map(breakageSummary),
        }
      }
      const tx = transactionOf(ctx, input.rationale)
      const done = attempt(document, () => setFormula(document, name, formula, tx))
      if ('refused' in done) return done.refused
      return { ...shape, breakages: [], scene: sceneSummary(document) }
    },
  }
}

/** @returns {Tool} */
function createEvaluateFormulaTool() {
  return {
    name: 'evaluate_formula',
    description:
      'Work a formula out without writing anything, so you can check a sum before you define or bind it: returns its value, the stored form and what it reads, or the error by name. ' +
      'at (optional) is a step id from get_timeline, or a body id from describe_scene for the step that made it: the parts are read as they stand just above that step, ' +
      'which is what a param on that step would get. Without at, the parts as they are now.',
    inputSchema: objectSchema(
      {
        formula: FORMULA,
        at: { type: 'string', description: 'Optional: read the parts as they stand just above this step.' },
      },
      ['formula'],
    ),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      try {
        const options = input.at === undefined ? {} : { at: input.at }
        const { value, stored, reads } = evaluateFormulaIn(ctx.document, input.formula, options)
        return { value, formula: displayFormulaOf(ctx.document, { formula: stored }), stored, reads, ...options }
      } catch (error) {
        if (error instanceof VariableError) return { error: error.message }
        throw error
      }
    },
  }
}

/** @returns {Tool} */
function createBindParamTool() {
  return {
    name: 'bind_param',
    description:
      'Bind one param slot of a step to a variable, so the param follows the variable from now on — e.g. { "id": "pi-1", "path": "model", "name": "piModel" }. ' +
      'The slot must be one list_variables with that id offers, and the variable’s kind must fit it. Rotations, booleans and groups have no bindable params.',
    inputSchema: withRationale(objectSchema({ id: RECORD_ID, path: PATH, name: NAME }, ['id', 'path', 'name'])),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      const tx = transactionOf(ctx, input.rationale)
      const done = attempt(ctx.document, () => bindParam(ctx.document, input.id, input.path, input.name, tx))
      if ('refused' in done) return done.refused
      return { bound: { id: input.id, path: input.path, name: input.name }, scene: sceneSummary(ctx.document) }
    },
  }
}

/** @returns {Tool} */
function createUnbindParamTool() {
  return {
    name: 'unbind_param',
    description:
      'Stop a param following its variable: the slot keeps the value it has now, as a plain number or choice, and the geometry does not change. ' +
      'e.g. { "id": "pi-1", "path": "model" }.',
    inputSchema: withRationale(objectSchema({ id: RECORD_ID, path: PATH }, ['id', 'path'])),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      const tx = transactionOf(ctx, input.rationale)
      const done = attempt(ctx.document, () => unbindParam(ctx.document, input.id, input.path, tx))
      if ('refused' in done) return done.refused
      const value = valueAt(ctx.document.entries.find((entry) => entry.record.id === input.id)?.record.params ?? {}, input.path)
      return { unbound: { id: input.id, path: input.path, value }, scene: sceneSummary(ctx.document) }
    },
  }
}

/** @returns {Tool} */
function createRenameVariableTool() {
  return {
    name: 'rename_variable',
    description:
      'Rename a variable, and every binding and condition that names it, in one change — e.g. { "from": "piModel", "to": "boardModel" }. Refused if the new name is taken.',
    inputSchema: withRationale(objectSchema({ from: NAME, to: NAME }, ['from', 'to'])),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      const rewritten = consumersOf(ctx.document.entries, input.from).length
      const tx = transactionOf(ctx, input.rationale)
      const done = attempt(ctx.document, () => renameVariable(ctx.document, input.from, input.to, tx))
      if ('refused' in done) return done.refused
      return { renamed: { from: input.from, to: input.to }, rewritten }
    },
  }
}

/** @returns {Tool} */
function createDeleteVariableTool() {
  return {
    name: 'delete_variable',
    description:
      'Delete a variable. While anything reads it, it is refused and the result lists usedBy — unless keepValues is true, which first rewrites every binding to the value it has now, ' +
      'so no geometry changes. A variable read by a step’s condition cannot be deleted either way: remove the condition first.',
    inputSchema: withRationale(
      objectSchema(
        {
          name: NAME,
          keepValues: { type: 'boolean', description: 'Rewrite every binding to its current value, then delete. Default false.' },
        },
        ['name'],
      ),
    ),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      const keptValues = consumersOf(ctx.document.entries, input.name).filter((consumer) => consumer.kind === 'binding').length
      const tx = transactionOf(ctx, input.rationale)
      const done = attempt(ctx.document, () => deleteVariable(ctx.document, input.name, tx, { keepValues: input.keepValues === true }))
      if ('refused' in done) return done.refused
      return { deleted: input.name, keptValues }
    },
  }
}

/**
 * The ten project-variable tools: the seven of `TODO/ai-014` and the three formula tools of
 * `TODO/FIND-core-078`.
 *
 * @returns {Tool[]}
 */
export function createVariableTools() {
  return [
    createListVariablesTool(),
    createDefineVariableTool(),
    createSetVariableTool(),
    createDefineFormulaTool(),
    createSetFormulaTool(),
    createEvaluateFormulaTool(),
    createBindParamTool(),
    createUnbindParamTool(),
    createRenameVariableTool(),
    createDeleteVariableTool(),
  ]
}
