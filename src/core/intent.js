// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Design intent's caps and its one text rule (`TODO/ai-003`).
 *
 * `CLAUDE.md`: *"the document records design intent, not just geometry: each feature carries
 * the prompt or instruction that produced it, and the project carries its own standing
 * instructions."* Two free-text fields carry that:
 *
 * - a record's **intent** (on its {@link import('./document.js').DocumentEntry}, beside
 *   `origin`, never inside the record), set by the AI tools from the user's message that
 *   started the turn plus the model's one-line rationale for the call;
 * - the project's **standing instructions**, typed in File ▾ → Project settings….
 *
 * Both arrive from files and gists anyone can write, so both are **untrusted text**: bounded
 * here, stripped of control characters here, rendered as text (never markup) by the UI, and
 * given to a model only inside a labelled data block (`src/ai/documentData.js`). This module
 * is the one place the bound and the cleaning rule live, so the document, the loader and the
 * tools cannot disagree about them.
 *
 * Framework-free: string in, string out.
 *
 * @module core/intent
 */

/** The longest a record's intent may be, in UTF-16 code units (what `String#length` counts). */
export const INTENT_MAX_LENGTH = 500

/** The longest the model's own rationale part of an intent may be. */
export const RATIONALE_MAX_LENGTH = 200

/** The longest a project's standing instructions may be. */
export const INSTRUCTIONS_MAX_LENGTH = 2000

/** Every C0 control character except tab (`\t`) and newline (`\n`), plus DEL. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g

/**
 * Clean untrusted text and bound it: CRLF → LF, control characters other than tab and newline
 * removed, trimmed, then cut to `max` with a trailing `…` (the result never exceeds `max`).
 * Markup is left as literal characters — nothing here, or anywhere downstream, parses it.
 *
 * @param {unknown} value Anything; a non-string is treated as no text at all.
 * @param {number} max
 * @returns {string}
 */
export function cleanText(value, max) {
  if (typeof value !== 'string') return ''
  const text = value.replace(/\r\n?/g, '\n').replace(CONTROL, '').trim()
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`.slice(0, max)
}

/**
 * The intent an AI write records: the user's request, then the model's rationale on its own
 * line after an em dash. The rationale is folded onto one line and capped first, so a long
 * request cannot squeeze it out; the request takes what is left of {@link INTENT_MAX_LENGTH}.
 *
 * @param {unknown} request The user's message that started the turn.
 * @param {unknown} rationale The model's one-line reason for this call.
 * @returns {string | undefined} `undefined` when neither says anything.
 */
export function composeIntent(request, rationale) {
  const why = cleanText(typeof rationale === 'string' ? rationale.replace(/\s+/g, ' ') : rationale, RATIONALE_MAX_LENGTH)
  const whyLine = why === '' ? '' : `— ${why}`
  const room = whyLine === '' ? INTENT_MAX_LENGTH : INTENT_MAX_LENGTH - whyLine.length - 1
  const asked = cleanText(request, room)
  const intent = [asked, whyLine].filter((part) => part !== '').join('\n')
  return intent === '' ? undefined : intent
}

/**
 * A body's design intent as a reader wants it: the intent of the **latest** step in its
 * lineage that has one, so a body the AI moved after placing says why it was moved, and a body
 * a person edited afterwards still says why it was made.
 *
 * @param {Pick<import('./document.js').WarpDocument, 'lineageOf' | 'intentOf'>} document
 * @param {string} bodyId Any record id in the body's lineage, usually its root.
 * @returns {string | undefined}
 */
export function latestIntentOf(document, bodyId) {
  const lineage = document.lineageOf(bodyId)
  for (let index = lineage.length - 1; index >= 0; index -= 1) {
    const id = lineage[index].id
    const intent = id === undefined ? undefined : document.intentOf(id)
    if (intent !== undefined) return intent
  }
  return undefined
}
