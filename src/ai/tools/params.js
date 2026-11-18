// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `set_params` tool (`TODO/FIND-ai-046`): a direct size edit of a placed body, or of one
 * part of a group — what typing in the Inspector's Parameters section does.
 *
 * Without it, resizing a body meant defining a variable and `bind_param`, or building a new
 * step. This goes through the Inspector's own core path, `paramEditRecord` then
 * `document.reviseRecords`, so the creation record is swapped in place and every later step
 * (a snap, a fillet, a colour) re-folds against the new solid. Four refusals, each in words a
 * model can act on, and none writes anything:
 *
 * - a parameter the body does not have (the message lists the ones it has);
 * - a value the op rejects (`paramEditRecord`'s and the kernel's own message);
 * - a parameter bound to a variable, with a pointer to `set_variable` and `unbind_param`;
 * - an edit a later step could not survive (`impactOf`), naming the step.
 *
 * @module ai/tools/params
 */

import { composeIntent } from '../../core/intent.js'
import { ReplayRejection } from '../../core/document.js'
import { impactOf } from '../../core/dependents.js'
import { registry as kernelRegistry } from '../../core/kernel/registry.js'
import { normalizedParams } from '../../core/kernel/registry.js'
import { RESERVED_PARAMS, canEditParams, paramEditRecord, partParamEditRecord } from '../../core/paramEdit.js'
import { isBinding } from '../../core/variables.js'
import { assertWriteOrigin } from './limits.js'
import { findBody, findStep, sceneSummary } from './read.js'
import { objectSchema, withRationale } from './schema.js'

/** @typedef {import('./index.js').Tool} Tool */

/**
 * The variable a param value is tied to, if any: the value itself, or an element of it.
 *
 * @param {unknown} value
 * @returns {string | undefined}
 */
function boundVariableOf(value) {
  if (isBinding(value)) return String(value.$var)
  if (Array.isArray(value)) {
    for (const element of value) {
      const name = boundVariableOf(element)
      if (name !== undefined) return name
    }
  }
  return undefined
}

/**
 * The parameter names a record of `op` has: what it holds now, and what a fresh one of the op
 * is created with.
 *
 * @param {import('../../core/kernel/registry.js').OpRecord} record
 * @returns {string[]}
 */
function parameterNamesOf(record) {
  const names = new Set(Object.keys(normalizedParams(record.op, record.params ?? {})))
  for (const key of Object.keys(kernelRegistry[record.op]?.ui?.defaults ?? {})) names.add(key)
  for (const key of RESERVED_PARAMS) names.delete(key)
  return [...names].sort()
}

/** @returns {Tool} */
export function createSetParamsTool() {
  return {
    name: 'set_params',
    description:
      'Change the size of a body on screen directly, e.g. { "id": "cuboid-abcdef-1", "params": [{ "name": "size", "value": [30, 20, 40] }] }, or several at once for a cylinder: [{ "name": "diameter", "value": 12 }, { "name": "height", "value": 8 }]. ' +
      'Each value replaces the whole parameter, so a vector is given in full ([x, y, z]). Pass part with a group’s id to edit one part of it. ' +
      'Millimetres. Steps built on the body (a snap, a fillet) follow it. Refused, changing nothing, for a parameter the body does not have (the reply lists its parameters), ' +
      'a value the op rejects, a body made from other bodies (a union or a group), a parameter tied to a variable (change it with set_variable instead), ' +
      'or a size a later step could not build at. Read the current parameters with describe_body or describe_step first.',
    inputSchema: withRationale(
      objectSchema(
        {
          id: { type: 'string', description: 'A body id from describe_scene.' },
          part: { type: 'string', description: 'A part name from describe_body, to edit one part of the group named by id.' },
          params: {
            type: 'array',
            description: 'The settings to change, each a name and its complete new value, e.g. [{ "name": "size", "value": [30, 20, 40] }].',
            items: objectSchema(
              {
                name: { type: 'string', description: 'A parameter name from describe_body, e.g. size, diameter, height.' },
                value: {
                  description: 'The whole new value: a number, a text choice, true or false, or a list of numbers such as [x, y, z].',
                  anyOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }, { type: 'array', items: { type: 'number' } }],
                },
              },
              ['name', 'value'],
            ),
          },
        },
        ['id', 'params'],
      ),
    ),
    transports: ['ai', 'mcp'],
    run: (ctx, input) => {
      assertWriteOrigin(ctx.origin)
      const { document } = ctx
      const { id, part } = input
      /** @type {Array<{ name: string, value: any }>} */
      const list = input.params
      if (list.length === 0) return { error: 'params must name at least one parameter and its new value, e.g. [{ "name": "size", "value": [30, 20, 40] }]' }
      const changes = Object.fromEntries(list.map(({ name: key, value }) => [key, value]))
      if (Object.keys(changes).length !== list.length) return { error: 'params names a parameter twice — give each once' }

      /** @type {import('../../core/kernel/registry.js').OpRecord} */
      let target
      /** @type {string} */
      let rootId
      /** @type {string} */
      let name
      if (part === undefined) {
        const found = findBody(document, id)
        if (found.reason !== undefined) return { error: found.reason }
        rootId = found.body.id
        name = found.body.name
        const step = findStep(document, id)
        if (step.reason !== undefined) return { error: step.reason }
        target = step.record
        const verdict = canEditParams(document, rootId)
        if (!verdict.editable) {
          return { error: `${name} cannot be rebuilt from its parameters: it is a ${verdict.blockedBy}, built from other bodies or a catalogue choice rather than from sizes. Edit the bodies it was made from.` }
        }
      } else {
        const step = findStep(document, id, part)
        if (step.reason !== undefined) return { error: step.reason }
        target = step.record
        rootId = step.bodyId
        name = `${part} of ${step.body?.name ?? id}`
      }

      const names = parameterNamesOf(target)
      for (const key of Object.keys(changes)) {
        if (!names.includes(key)) return { error: `${name} has no parameter "${key}". Its parameters are: ${names.join(', ')}.` }
        const variable = boundVariableOf(target.params?.[key])
        if (variable !== undefined) {
          return { error: `${name}'s ${key} is bound to "${variable}", so it follows that variable. Change it with set_variable, or call unbind_param first.` }
        }
      }

      try {
        const record = part === undefined ? paramEditRecord(document, rootId, changes) : partParamEditRecord(document, id, part, changes)
        if (record === null) return { edited: { id, ...(part === undefined ? {} : { part }), params: changes, unchanged: true }, scene: sceneSummary(document) }
        const revision = [{ id: /** @type {string} */ (record.id), record }]
        const { breakages } = impactOf(document, revision, { editedRootId: rootId })
        if (breakages.length > 0) {
          const first = breakages[0]
          return { error: `${first.relationship} on ${first.dependentName} (step ${first.step}) would no longer build at this size: ${first.reason}. Nothing was changed.` }
        }
        const intent = composeIntent(ctx.request ?? ctx.prompt?.text, input.rationale)
        document.reviseRecords(revision, { origin: ctx.origin, label: `Edit ${name}`, ...(intent === undefined ? {} : { intent }) })
        return { edited: { id, ...(part === undefined ? {} : { part }), params: changes }, scene: sceneSummary(document) }
      } catch (error) {
        if (error instanceof ReplayRejection) return { error: error.message, step: error.step.step, reason: error.step.reason }
        if (error instanceof Error) return { error: error.message.replace(/^paramEdit: /, '') }
        throw error
      }
    },
  }
}
