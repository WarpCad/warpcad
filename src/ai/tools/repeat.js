// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `repeat` tool (`TODO/core-061` decision 11): put the same part, placed the same way, on
 * every matching part of another body — the AI's way to the user's "now the same screw on the
 * other three holes".
 *
 * One tool in the shared registry, so the MCP server and the BYOK chat both get it with no
 * transport code of their own (`docs/decisions/ai-partner.md`). It appends **one**
 * `pattern.repeat` record through `src/core/repeat.js`'s `appendRepeat` — the same command-layer
 * call `TODO/ui-069`'s Apply makes — under the turn's own origin (`ai`, `mcp` or `webmcp`), so it
 * lands in **Undo AI turn** and never on the user's own undo stack. The record is **linked**:
 * an edit to the source's existing steps later moves or resizes every repeat.
 *
 * Every refusal is core's own sentence (`repeatRefusal`), returned as a tool error with nothing
 * written. The target count is capped in code at {@link LIMITS}`.repeatTargets`, the same number
 * the document enforces.
 *
 * @module ai/tools/repeat
 */

import { ReplayRejection } from '../../core/document.js'
import { composeIntent } from '../../core/intent.js'
import { appendRepeat, repeatRefusal } from '../../core/repeat.js'
import { LIMITS, assertWriteOrigin } from './limits.js'
import { findBody, sceneSummary } from './read.js'
import { RATIONALE_PROPERTY, objectSchema } from './schema.js'

/** @typedef {import('./index.js').Tool} Tool */

/**
 * @typedef {object} RepeatInput
 * @property {string} source The body whose steps are repeated (e.g. Bolt 1's id).
 * @property {string} seedBody The body the source was placed against (e.g. the Pi's id).
 * @property {string} seedPart The part of `seedBody` the source's steps name (e.g. `hole1`).
 * @property {string[]} targets The other parts of `seedBody` to repeat on.
 * @property {string} [rationale]
 */

/** @type {import('./schema.js').JsonSchema} */
const inputSchema = objectSchema(
  {
    source: {
      type: 'string',
      description: 'Id of the finished body to repeat (from describe_scene), e.g. the bolt already placed on hole1.',
    },
    seedBody: {
      type: 'string',
      description: 'Id of the body the source was aligned or snapped to, e.g. the Raspberry Pi.',
    },
    seedPart: {
      type: 'string',
      description: 'The part of seedBody the source was placed against, exactly as describe_body lists it, e.g. "hole1".',
    },
    targets: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: LIMITS.repeatTargets,
      description: 'The other parts of seedBody to put a copy on, e.g. ["hole2", "hole3", "hole4"]. Not seedPart itself.',
    },
    rationale: RATIONALE_PROPERTY,
  },
  ['source', 'seedBody', 'seedPart', 'targets']
)

/**
 * @returns {Tool}
 */
export function createRepeatTool() {
  return {
    name: 'repeat',
    description:
      'Repeat a finished part on other matching parts of the body it was placed against: one call puts the same part, ' +
      'turned, aligned and snapped exactly the same way, on each target part — e.g. the bolt you placed on a board\'s hole1 ' +
      'onto hole2, hole3 and hole4. Call describe_body on seedBody first to read its part names. The copies are linked, ' +
      'not copied: editing the source\'s existing steps (its size, its Align or Snap) later moves or resizes every copy, ' +
      'while a new move of the source made after this call moves the source alone. The result is one new body holding one ' +
      'member per target, each addressable as { id, pieces: "<target>" }. It is refused, with the reason, when the source\'s ' +
      'steps never name seedPart, or a target is not a part of seedBody.',
    inputSchema,
    transports: ['ai', 'mcp'],
    run: (ctx, input) => runRepeat(ctx, /** @type {RepeatInput} */ (input)),
  }
}

/**
 * @param {import('./index.js').ToolContext} ctx
 * @param {RepeatInput} input
 * @returns {Record<string, any>}
 */
function runRepeat(ctx, input) {
  const { document, origin, turn } = ctx
  assertWriteOrigin(origin)
  for (const id of [input.source, input.seedBody]) {
    const found = findBody(document, id)
    if (found.reason !== undefined) return { error: found.reason }
  }
  const params = { source: input.source, seed: { id: input.seedBody, pieces: input.seedPart }, targets: [...input.targets] }
  const refusal = repeatRefusal(document, params)
  if (refusal !== null) return { error: refusal }

  const hit = turn.canAppend(1)
  if (hit) return hit

  const intent = composeIntent(ctx.request ?? ctx.prompt?.text, input.rationale)
  const transaction = intent === undefined ? { origin } : { origin, intent }
  /** @type {string} */
  let bodyId
  try {
    bodyId = document.batch(() => /** @type {string} */ (appendRepeat(document, params, transaction).record.id))
  } catch (error) {
    if (error instanceof ReplayRejection) return { error: error.message, step: error.step.step, reason: error.step.reason }
    return { error: error instanceof Error ? error.message.replace(/^document\.append: \S+ could not be applied — /, '') : String(error) }
  }
  turn.commitRecords(1)
  return { applied: [{ batchStep: 1, tool: 'repeat', bodyId, recordIds: [bodyId] }], scene: sceneSummary(document) }
}
