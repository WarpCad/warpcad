// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The hard limits on what one AI turn may do (`docs/decisions/ai-partner.md`,
 * decision 7), enforced here in code and not in the prompt.
 *
 * Both transports use this module and these constants: the browser agent (`ai-005`,
 * origin `ai`) and the MCP server (`ai-009`, origin `mcp`). Every cap **stops the turn
 * and says so**. None of them truncates silently, because a model that thinks it built
 * 60 records when 50 landed would go on to reason about bodies that do not exist.
 *
 * ## What is not here, and why
 *
 * - **Sketch points.** The sketch model already caps slices, outlines per slice, points
 *   per polyline and polygon sides for hostile input (`src/sketch/profile.js`'s
 *   `validateSketchParams`), and every record the tools build goes through the
 *   document's trial fold, which calls it. A second copy of those numbers here would
 *   drift from the first. `create.spec.js` proves a 4,097-point outline is refused by
 *   the sketch model's own words.
 * - **A separate cap for variable writes** (`TODO/ai-014`). `define_variable` appends one
 *   record and is charged one against {@link Limits.recordsPerCall}/{@link Limits.recordsPerTurn},
 *   like any append. The other variable writes (`set_variable`, `bind_param`, `unbind_param`,
 *   `rename_variable`, `delete_variable`) revise rows in place and append nothing, so they are
 *   bounded by {@link Limits.stepsPerTurn} only: a rename that rewrites sixty bindings is one
 *   change, and charging it as sixty records would refuse a legitimate edit.
 * - **Network, keys, writes outside the document.** Those are guaranteed by what a tool
 *   is *given*, not by a counter: a tool receives a {@link import('./index.js').ToolContext}
 *   holding the document and nothing else. `limits.spec.js` checks statically that no
 *   tool module references a network API or imports a framework.
 *
 * @module ai/tools/limits
 */

/**
 * The starting caps (decision 7), to be tuned by `ai-011`'s evals rather than by
 * guesswork.
 *
 * @typedef {object} Limits
 * @property {number} recordsPerCall Records one write call may append.
 * @property {number} recordsPerTurn Records one turn may append across all its calls.
 * @property {number} stepsPerTurn Tool calls one turn may make, reads included.
 * @property {number} consecutiveFailures Failures of the same tool in a row before
 *   the turn stops and the user is asked.
 * @property {number} turnMs Wall-clock time one turn may take, in milliseconds.
 */

/** @type {Readonly<Limits>} */
export const LIMITS = Object.freeze({
  recordsPerCall: 50,
  recordsPerTurn: 200,
  stepsPerTurn: 40,
  consecutiveFailures: 3,
  turnMs: 10 * 60 * 1000,
})

/**
 * The only origins a tool write may carry: `ai` (the browser agent) and `mcp` (the
 * MCP server). **Never `local`**: only `local` steps go on the user's undo stack
 * (`src/core/document.js`), and an AI record there would let one press of Undo take
 * back the model's work instead of the user's own.
 */
export const WRITE_ORIGINS = Object.freeze(['ai', 'mcp'])

/**
 * Throw unless `origin` is one of {@link WRITE_ORIGINS}.
 *
 * Thrown rather than returned, because a transport passing the wrong origin is a bug
 * in the transport, not a mistake the model can correct.
 *
 * @param {unknown} origin
 * @returns {void}
 */
export function assertWriteOrigin(origin) {
  if (typeof origin === 'string' && WRITE_ORIGINS.includes(origin)) return
  throw new Error(
    `ai tools: origin must be one of ${WRITE_ORIGINS.join(', ')}, got ${JSON.stringify(origin)}` +
      (origin === 'local' ? " — local is the user's own undo stack, and an AI write never goes there" : '')
  )
}

/**
 * A cap that stopped the turn. `error` is the sentence the model (and the chat panel,
 * `ai-006`) reads.
 *
 * @typedef {object} LimitHit
 * @property {string} error
 * @property {keyof Limits} limit Which cap.
 * @property {true} stop The turn is over.
 */

/**
 * @typedef {object} TurnStats
 * @property {number} steps Tool calls begun.
 * @property {number} records Records that actually landed.
 * @property {number} consecutiveFailures The current failure streak of {@link TurnStats.failingTool}.
 * @property {string | null} failingTool
 * @property {number} elapsedMs
 * @property {boolean} stopped
 */

/**
 * One turn's budget.
 *
 * @typedef {object} Turn
 * @property {(toolName: string) => LimitHit | null} beginStep Count a tool call;
 *   `null` to go ahead, or the cap that stops the turn.
 * @property {(toolName: string, ok: boolean) => LimitHit | null} endStep Record how the
 *   call went; returns the failure cap when this failure reached it.
 * @property {(count: number) => LimitHit | null} canAppend Whether `count` more records
 *   may land in this call. Refusing stops the turn.
 * @property {(count: number) => void} commitRecords Charge records that landed.
 * @property {TurnStats} stats A snapshot, read-only.
 */

/**
 * Start a turn's budget.
 *
 * @param {object} [options]
 * @param {() => number} [options.now] Milliseconds; a spec passes its own clock.
 * @param {Limits} [options.limits] Caps; {@link LIMITS} by default.
 * @returns {Turn}
 */
export function createTurn(options = {}) {
  const now = options.now ?? Date.now
  const limits = options.limits ?? LIMITS
  const startedAt = now()
  let steps = 0
  let records = 0
  let streak = 0
  /** @type {string | null} */
  let failingTool = null
  /** @type {LimitHit | null} */
  let stoppedBy = null

  /**
   * @param {keyof Limits} limit
   * @param {string} error
   * @returns {LimitHit}
   */
  function stop(limit, error) {
    stoppedBy = { error, limit, stop: true }
    return stoppedBy
  }

  return {
    beginStep(toolName) {
      if (stoppedBy !== null) return stoppedBy
      if (now() - startedAt > limits.turnMs) {
        return stop('turnMs', `This turn has run for more than ${Math.round(limits.turnMs / 60000)} minutes, so it has stopped.`)
      }
      if (steps >= limits.stepsPerTurn) {
        return stop('stepsPerTurn', `This turn has made ${limits.stepsPerTurn} tool calls, the most one turn may make, so it has stopped before ${toolName}.`)
      }
      steps += 1
      return null
    },

    endStep(toolName, ok) {
      if (ok) {
        streak = 0
        failingTool = null
        return null
      }
      streak = failingTool === toolName ? streak + 1 : 1
      failingTool = toolName
      if (streak >= limits.consecutiveFailures) {
        return stop(
          'consecutiveFailures',
          `${toolName} has failed ${streak} times in a row, so this turn has stopped to ask the user how to proceed.`
        )
      }
      return null
    },

    canAppend(count) {
      if (stoppedBy !== null) return stoppedBy
      if (count > limits.recordsPerCall) {
        return stop('recordsPerCall', `One call may append at most ${limits.recordsPerCall} records; this one needed ${count}. Nothing was appended, and the turn has stopped.`)
      }
      if (records + count > limits.recordsPerTurn) {
        return stop(
          'recordsPerTurn',
          `One turn may append at most ${limits.recordsPerTurn} records; ${records} have landed and this call needed ${count} more. Nothing from this call was appended, and the turn has stopped.`
        )
      }
      return null
    },

    commitRecords(count) {
      records += count
    },

    get stats() {
      return {
        steps,
        records,
        consecutiveFailures: streak,
        failingTool,
        elapsedMs: now() - startedAt,
        stopped: stoppedBy !== null,
      }
    },
  }
}
