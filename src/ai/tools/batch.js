// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The one write path (`TODO/ai-002`): `create`, `operate` and `apply_records` all land
 * through {@link applySteps}, so every AI write gets the same atomicity, origin, caps
 * and error wording.
 *
 * ## `apply_records` takes steps, not raw records
 *
 * The spec names the batch tool `apply_records(records[])`. It takes a list of
 * **steps**, each one `{ create: … }` or `{ operate: … }` with the same input the
 * single tools take, rather than raw op records. Raw records would be the
 * `add_feature(op, params)` catch-all the spec forbids: a record can name any op, skip
 * the placement step, forget the `consumes` a boolean needs, or invent ids. Every record
 * a step produces is still built by `create.js`/`operate.js`, so it is the same record
 * the UI would have appended. A step names a body an earlier step of the same call made
 * as `@1`, `@2`, …, since its real id is only issued when the step is built.
 *
 * ## Atomic: all or none
 *
 * `document.appendAll`'s fast path is *not* atomic across a batch (its own doc comment
 * says so: a failure part-way leaves the earlier records in). So each step is inserted
 * with `document.insertAt` at the marker (where `appendAll` would put it, rolled back
 * or not), which re-folds atomically and refuses with a row-named `ReplayRejection`.
 * The whole call runs inside `document.batch`, which puts the captured state back if
 * any step throws. A rejected call therefore leaves the entries, the marker and both
 * undo stacks exactly as they were. No new public hook in `src/core/document.js` was
 * needed.
 *
 * ## Origin
 *
 * Every record is appended with `ctx.origin`, `ai` or `mcp`, never `local`, so none of it
 * reaches the user's undo stack. One AI *turn* becoming one undo unit is the agent's
 * branch-and-land (`ai-005`, decision 5), which builds on a forked document and lands it
 * with one append. This module is what runs against that fork.
 *
 * @module ai/tools/batch
 */

import { ReplayRejection } from '../../core/document.js'
import { buildCreateRecords, createInputSchema, validateCreateInput } from './create.js'
import { buildOperateRecords, operateInputSchema, validateOperateInput } from './operate.js'
import { assertWriteOrigin } from './limits.js'
import { sceneSummary } from './read.js'
import { checkInput, objectSchema } from './schema.js'

/** @typedef {import('./index.js').ToolContext} ToolContext */
/** @typedef {import('../../core/kernel/registry.js').RegistryEntry} RegistryEntry */
/** @typedef {Readonly<Record<string, RegistryEntry>>} Registry */

/**
 * @typedef {{ create: import('./create.js').CreateInput } | { operate: import('./operate.js').OperateInput }} Step
 */

/**
 * @typedef {object} AppliedStep
 * @property {number} batchStep 1-based position in the call.
 * @property {'create' | 'operate'} tool
 * @property {string} bodyId The body this step made or changed.
 * @property {string[]} recordIds What it appended, in order.
 */

/** A step that could not be built or would not fold. */
class StepFailure extends Error {
  /**
   * @param {number} batchStep
   * @param {number} step The 1-based History row it would have been.
   * @param {unknown} cause
   */
  constructor(batchStep, step, cause) {
    const rejection = cause instanceof ReplayRejection ? cause : null
    const message = cause instanceof Error ? cause.message : String(cause)
    super(message)
    this.batchStep = batchStep
    this.step = rejection ? rejection.step.step : step
    this.reason = rejection ? rejection.step.reason : message
  }
}

/** A cap that stopped the turn part-way through building. */
class LimitFailure extends Error {
  /** @param {import('./limits.js').LimitHit} hit */
  constructor(hit) {
    super(hit.error)
    this.hit = hit
  }
}

/**
 * A batch reference (`@n`) to the body an earlier step of this call made.
 *
 * @param {string} id
 * @param {AppliedStep[]} applied
 * @param {number} batchStep
 * @returns {string}
 */
function resolveBatchRef(id, applied, batchStep) {
  if (!id.startsWith('@')) return id
  const n = Number(id.slice(1))
  if (!Number.isInteger(n) || n < 1 || n >= batchStep) {
    const range = batchStep === 1 ? 'the first step has no earlier step to name' : `step ${batchStep} can name @1 to @${batchStep - 1}`
    throw new Error(`"${id}" does not name an earlier step of this call — ${range}`)
  }
  return applied[n - 1].bodyId
}

/**
 * Build and land a list of steps as one atomic append.
 *
 * @param {ToolContext} ctx
 * @param {Step[]} steps
 * @param {Registry} ops
 * @returns {Record<string, any>} `{ applied, scene }` on success; `{ error, step, reason,
 *   batchStep }` for a step that would not build; a {@link import('./limits.js').LimitHit}
 *   for a cap.
 */
export function applySteps(ctx, steps, ops) {
  const { document, origin, turn } = ctx
  assertWriteOrigin(origin)
  if (steps.length === 0) return { error: 'There are no steps to apply.' }
  // Every step appends at least one record, so this refuses an oversized call before
  // building anything.
  const early = turn.canAppend(steps.length)
  if (early) return early

  /** @type {AppliedStep[]} */
  const applied = []
  let total = 0
  try {
    document.batch(() => {
      steps.forEach((step, index) => {
        const batchStep = index + 1
        const at = document.rollbackAt() ?? document.entries.length
        const tool = 'create' in step ? 'create' : 'operate'
        let built
        try {
          built =
            'create' in step
              ? buildCreateRecords(document, step.create, ops)
              : buildOperateRecords(document, step.operate, ops, (id) => resolveBatchRef(id, applied, batchStep))
        } catch (error) {
          throw new StepFailure(batchStep, at + 1, error)
        }
        const hit = turn.canAppend(total + built.records.length)
        if (hit) throw new LimitFailure(hit)
        try {
          document.insertAt(at, built.records, { origin })
        } catch (error) {
          throw new StepFailure(batchStep, at + 1, error)
        }
        total += built.records.length
        applied.push({
          batchStep,
          tool,
          bodyId: built.bodyId,
          recordIds: built.records.map((record) => /** @type {string} */ (record.id)),
        })
      })
    })
  } catch (failure) {
    if (failure instanceof LimitFailure) return failure.hit
    if (failure instanceof StepFailure) {
      return { error: failure.message, step: failure.step, reason: failure.reason, batchStep: failure.batchStep }
    }
    throw failure
  }
  turn.commitRecords(total)
  return { applied, scene: sceneSummary(document) }
}

/**
 * @param {Registry} ops
 * @returns {import('./index.js').Tool}
 */
export function createApplyRecordsTool(ops) {
  const createSchema = createInputSchema(ops)
  const operateSchema = operateInputSchema(ops)
  const inputSchema = objectSchema(
    {
      steps: {
        type: 'array',
        description: 'The steps, in order. A later step names a body an earlier step made as "@1", "@2", … (1-based).',
        items: {
          anyOf: [objectSchema({ create: createSchema }, ['create']), objectSchema({ operate: operateSchema }, ['operate'])],
        },
      },
    },
    ['steps']
  )
  return {
    name: 'apply_records',
    description:
      'Apply several create and operate steps as one atomic change: every step lands, or none does and the document is unchanged. ' +
      'Use it for anything that only makes sense whole, e.g. a part and the cut that shapes it. Returns each step’s body id and the scene afterwards.',
    inputSchema,
    validate: (input) => {
      // Anything that is not even `{ steps: [...] }` gets the generic checker's words.
      if (typeof input !== 'object' || input === null || !Array.isArray(/** @type {any} */ (input).steps)) {
        return checkInput(inputSchema, input)
      }
      const extra = Object.keys(input).filter((key) => key !== 'steps')
      if (extra.length > 0) return [`input has unknown field ${JSON.stringify(extra[0])}`]
      /** @type {any[]} */
      const steps = /** @type {any} */ (input).steps
      /** @type {string[]} */
      const errors = []
      steps.forEach((step, index) => {
        const path = `input.steps[${index}]`
        const keys = step && typeof step === 'object' && !Array.isArray(step) ? Object.keys(step) : []
        if (keys.length !== 1 || (keys[0] !== 'create' && keys[0] !== 'operate')) {
          errors.push(`${path} must have exactly one of "create", "operate"`)
        } else if (keys[0] === 'create') {
          errors.push(...validateCreateInput(ops, createSchema, step.create, `${path}.create`))
        } else {
          errors.push(...validateOperateInput(operateSchema, step.operate, `${path}.operate`))
        }
      })
      return errors.slice(0, 5)
    },
    transports: ['ai', 'mcp'],
    run: (ctx, input) => applySteps(ctx, input.steps, ops),
  }
}
