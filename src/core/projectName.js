// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The project's **name** (`TODO/io-040`): the title a person sees on a published gist and the name
 * Save suggests, set by an agent with `set_project_name` so a project built in the chat or over
 * WebMCP is ready to publish without anything typed. It is a suggestion, never a file: it renames
 * nothing on disk (`docs/decisions/gist-storage.md`, the task's open question 1).
 *
 * Distinct from the persistence store's `projectName`, which is the **file name** the project was
 * last opened or saved under — UI state, not document state. The document's name is a
 * last-writer-wins register merged like the description (`src/core/document.js`).
 *
 * The name is data, never markup and never instructions: one line, with control and bidi
 * characters removed, whitespace runs collapsed, trimmed, and capped at the README title's length
 * (`gistReadme.js` reads {@link PROJECT_NAME_LIMITS}). The README escapes it again when it writes
 * it.
 *
 * Pure and framework-free.
 *
 * @module core/projectName
 */

/** Caps for the name, enforced on store, on load and on merge. */
export const PROJECT_NAME_LIMITS = Object.freeze({
  /** Longest name kept, in code points; a longer one is cut with `…`. The README title's cap. */
  maxLength: 120,
  /** Longest text `set_project_name` accepts at all; more is refused rather than cut. */
  maxInputLength: 2000,
})

/** Bidi embedding, override, isolate and mark characters: they reorder what a reader sees. */
const BIDI = /[\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069]/g
/** C0 and C1 controls, line breaks and tabs included, and the Unicode line and paragraph breaks. */
const CONTROLS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g

/**
 * The name as stored: one line, no controls or bidi characters, whitespace runs as one space,
 * trimmed, at most {@link PROJECT_NAME_LIMITS.maxLength} code points (a cut one ending in `…`).
 * Idempotent, so a stored name validates as clean.
 *
 * @param {unknown} value Anything; a non-string is no name at all.
 * @returns {string}
 */
export function cleanProjectName(value) {
  if (typeof value !== 'string') return ''
  const text = value.replace(BIDI, '').replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim()
  const points = Array.from(text)
  if (points.length <= PROJECT_NAME_LIMITS.maxLength) return text
  return points.slice(0, PROJECT_NAME_LIMITS.maxLength - 1).join('').trimEnd() + '…'
}

/**
 * What `set_project_name` stores, or why it refuses. Empty text is accepted: it clears the name.
 *
 * @param {unknown} value
 * @returns {{ ok: true, text: string, truncated: boolean } | { ok: false, reason: string }}
 */
export function prepareProjectName(value) {
  if (typeof value !== 'string') return { ok: false, reason: 'the name must be text' }
  if (value.length > PROJECT_NAME_LIMITS.maxInputLength) {
    return {
      ok: false,
      reason: `the name is ${value.length} characters; at most ${PROJECT_NAME_LIMITS.maxInputLength} are accepted, and ${PROJECT_NAME_LIMITS.maxLength} kept`,
    }
  }
  const text = cleanProjectName(value)
  const uncut = value.replace(BIDI, '').replace(CONTROLS, ' ').replace(/\s+/g, ' ').trim()
  return { ok: true, text, truncated: text !== uncut }
}
