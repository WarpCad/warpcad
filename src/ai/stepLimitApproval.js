// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * How far this browser lets a project raise its own AI step limit (`TODO/ai-033`, owner
 * decision 2026-11-02: a shared project may not raise its own limit).
 *
 * Decision 7 (`docs/decisions/ai-partner.md`) says the caps bound what a prompt injection can
 * achieve, and a project file can come from anyone — a gist, a share link. So a value that
 * arrived with a file must not silently raise the limit:
 *
 * 1. a value at or below the default always applies (lowering is always safe);
 * 2. a value the person **saves in this browser** applies, and raises the approved number to it;
 * 3. a value above the default that **arrived with a file** applies only up to the approved
 *    number, until the person taps **Use N**;
 * 4. so the effective limit is `min(stored, max(default, approved))` ({@link effectiveStepLimit}),
 *    the only number the transports read.
 *
 * One number per browser, not `instructionTrust.js`'s per-exact-text list: text can hide
 * anything, a number only means "how much". Approving 3,000 once covers any later project asking
 * for 3,000 or less, which the person has already accepted.
 *
 * Kept in `localStorage` under {@link APPROVAL_STORAGE_KEY}. Every read and write is guarded: a
 * private window or blocked storage degrades to "approved for this session only", never to an
 * exception — as `instructionTrust.js` does.
 *
 * Framework-free: the storage is injected (`CLAUDE.md`: mock at the boundary).
 *
 * @module ai/stepLimitApproval
 */

import { AI_STEP_LIMIT, isAiStepLimit } from '../core/aiBudget.js'

/** The `localStorage` key. */
export const APPROVAL_STORAGE_KEY = 'warpcad:ai-step-limit-approved'

/**
 * @typedef {object} ApprovalStorage The slice of `Storage` this needs.
 * @property {(key: string) => string | null} getItem
 * @property {(key: string, value: string) => void} setItem
 */

/**
 * @typedef {object} StepLimitApproval
 * @property {() => number} approved The highest limit this browser approved; the default when none.
 * @property {(limit: number) => void} approve Raise it to `limit` when that is higher and a valid
 *   limit. Never throws.
 */

/**
 * The limit the transports use.
 *
 * @param {number} stored The project's value (the default when it never set one).
 * @param {number} approved {@link StepLimitApproval.approved}.
 * @returns {number}
 */
export function effectiveStepLimit(stored, approved) {
  return Math.min(stored, Math.max(AI_STEP_LIMIT.default, approved))
}

/**
 * @param {object} options
 * @param {ApprovalStorage | null} options.storage `window.localStorage`, a fake, or `null` for
 *   in-memory only.
 * @returns {StepLimitApproval}
 */
export function createStepLimitApproval({ storage }) {
  /** What this session approved, kept even when storage refuses it. */
  let session = AI_STEP_LIMIT.default

  /** @returns {number} */
  function read() {
    if (!storage) return AI_STEP_LIMIT.default
    try {
      const raw = storage.getItem(APPROVAL_STORAGE_KEY)
      if (raw === null || !/^\d+$/.test(raw)) return AI_STEP_LIMIT.default
      const value = Number(raw)
      return isAiStepLimit(value) ? value : AI_STEP_LIMIT.default
    } catch {
      return AI_STEP_LIMIT.default
    }
  }

  return {
    approved() {
      return Math.max(session, read())
    },
    approve(limit) {
      if (!isAiStepLimit(limit)) return
      // Re-read first, so two tabs never lower each other's approval.
      const current = Math.max(session, read())
      if (limit <= current) return
      session = limit
      if (!storage) return
      try {
        storage.setItem(APPROVAL_STORAGE_KEY, String(limit))
      } catch {
        /* storage blocked or full: approved for this session only */
      }
    },
  }
}
