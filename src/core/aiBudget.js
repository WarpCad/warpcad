// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * How many steps one AI turn may append (`TODO/ai-033`): the project's **AI step limit**.
 *
 * Project metadata, like the build volume and the standing instructions: kept on the document
 * (`WarpDocument.aiRecordsPerTurn`), outside the fold and both undo stacks, written to the file
 * only once a person has changed it, and set only by a person in the Assistant panel — never by
 * an agent (`document.setAiRecordsPerTurn` refuses every origin but `local`).
 *
 * The range is the bound decision 7 relies on (`docs/decisions/ai-partner.md`): whatever a
 * project file says, no turn appends more than {@link AI_STEP_LIMIT}.max records. The value a
 * transport reads is the *effective* one (`src/ai/stepLimitApproval.js`), which a file cannot
 * raise above what this browser approved.
 *
 * Framework-free: plain numbers in, plain data out.
 *
 * @module core/aiBudget
 */

/**
 * The default, and the inclusive range a stored value must fall in (owner decision 2026-11-02;
 * the ceiling measured in `bench/results/2026-11-02-ai-033.md`).
 *
 * @type {Readonly<{ default: number, min: number, max: number }>}
 */
export const AI_STEP_LIMIT = Object.freeze({ default: 1000, min: 50, max: 5000 })

/**
 * A count of steps with thousands separators, the same in every locale (`1,000`).
 *
 * @param {number} count
 * @returns {string}
 */
export function formatSteps(count) {
  return count.toLocaleString('en-US')
}

/**
 * The sentence a refused value gets, naming the range.
 *
 * @returns {string}
 */
export function aiStepLimitRangeText() {
  return `Enter a whole number of steps from ${formatSteps(AI_STEP_LIMIT.min)} to ${formatSteps(AI_STEP_LIMIT.max)}.`
}

/**
 * Validate a step limit. Only a whole `number` in range is accepted: a numeric string, a
 * fraction, `NaN`, `Infinity` and `-0` are refused, never coerced — the sheet parses its own
 * text field first.
 *
 * @param {unknown} value
 * @returns {{ ok: true, value: number } | { ok: false, reason: string }}
 */
export function checkAiStepLimit(value) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    Object.is(value, -0) ||
    value < AI_STEP_LIMIT.min ||
    value > AI_STEP_LIMIT.max
  ) {
    return { ok: false, reason: aiStepLimitRangeText() }
  }
  return { ok: true, value }
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
export function isAiStepLimit(value) {
  return checkAiStepLimit(value).ok
}

/**
 * The value, or a throw with the range sentence.
 *
 * @param {unknown} value
 * @returns {number}
 * @throws {Error}
 */
export function normalizeAiStepLimit(value) {
  const verdict = checkAiStepLimit(value)
  if (!verdict.ok) throw new Error(verdict.reason)
  return verdict.value
}
