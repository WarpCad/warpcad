// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The project-variable tools (`TODO/ai-014`): `list_variables`, `define_variable`,
 * `set_variable`, `bind_param`, `unbind_param`, `rename_variable` and `delete_variable`.
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
 * `var.define` is not in the kernel registry (`docs/decisions/project-variables.md`), so
 * `create` and `apply_records` cannot write one and `list_ops` never offers it. These tools
 * are the only write path.
 *
 * ## Writes
 *
 * Every write runs inside `document.batch` with `ctx.origin` (`ai` or `mcp`, never `local`),
 * so none reaches the user's undo stack, and a refusal leaves the document exactly as it was.
 * `define_variable` appends one record and is charged one against the turn's record caps,
 * like any append. The others **revise** rows in place (a `reviseRecords`), append nothing,
 * and are bounded by the step cap: a rename that rewrites sixty bindings is one call, not
 * sixty records, and charging it as sixty would refuse a legitimate edit on a large project.
 *
 * `set_variable` runs `variableImpactOf` first. When the new value would break a dependent
 * (a Snap onto a part the new Pi model lacks), it writes **nothing** and returns the
 * breakages by name — the same decision the Variables panel makes before it opens the repair
 * dialog — so the model can tell the user, or fix the dependent first, rather than leave a
 * broken row behind.
 *
 * A write's optional `rationale` becomes design intent where the call appends a record
 * (`define_variable`). A revision keeps the row's existing intent: intent lives on the log
 * entry beside its origin, and `reviseRecords` changes the record, not the entry.
 *
 * ## Untrusted text
 *
 * Variable names, labels and option labels come from the project file. They are returned as
 * plain JSON values; both transports wrap every tool result in `document_data`
 * (`src/ai/documentData.js`) before a model reads it, so they arrive as data, never as
 * instructions.
 *
 * @module ai/tools/variables
 */

import { variableImpactOf } from '../../core/dependents.js'
import { ReplayRejection } from '../../core/document.js'
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
  defineVariable,
  deleteVariable,
  isBinding,
  readVariables,
  renameVariable,
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
      min: { type: 'number', description: 'Optional, kind number only: the smallest value allowed.' },
      max: { type: 'number', description: 'Optional, kind number only: the largest value allowed.' },
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
 * A variable as the model reads it, with what reads it.
 *
 * @param {WarpDocument} document
 * @param {Variable} variable
 * @returns {Record<string, any>}
 */
function variableSummary(document, variable) {
  const { id, ...definition } = variable
  return {
    ...definition,
    valueLabel: variableValueLabel(variable),
    recordId: id,
    usedBy: consumersOf(document.entries, variable.name),
  }
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
      'Then bind params to it with bind_param. Refused, by name, if the name is taken.',
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
      const parts = new Set(consumers.map((consumer) => document.rootOf(consumer.recordId) ?? consumer.recordId)).size
      const summary = summaryOf(variable, value, consumers.length, parts)
      const shape = { name, from: variable.value, to: value, changedParams: consumers.length, parts, summary }
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
 * The seven project-variable tools.
 *
 * @returns {Tool[]}
 */
export function createVariableTools() {
  return [
    createListVariablesTool(),
    createDefineVariableTool(),
    createSetVariableTool(),
    createBindParamTool(),
    createUnbindParamTool(),
    createRenameVariableTool(),
    createDeleteVariableTool(),
  ]
}
