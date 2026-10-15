// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Validation for a user-chosen body name (`TODO/core-038`). Framework-free: the document's
 * `renameBody` and the Inspector's field (`ui-056`) share these rules so they cannot
 * disagree.
 *
 * Duplicates are **allowed** — two `Screw`s is legitimate — so {@link isDuplicateName}
 * exists for a UI to warn, never for the document to refuse.
 */

/** The longest name a body may carry, after trimming. */
export const MAX_NAME_LENGTH = 60

// C0 controls, DEL and the C1 range: nothing a one-line label should hold.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/

/**
 * @typedef {{ ok: true, name: string | null } | { ok: false, reason: string }} NameCheck
 */

/**
 * Trim and validate a name. `null`, empty and whitespace-only all mean "clear the
 * override" and come back as `{ ok: true, name: null }`.
 *
 * @param {unknown} raw
 * @returns {NameCheck}
 */
export function normalizeBodyName(raw) {
  if (raw === null) return { ok: true, name: null }
  if (typeof raw !== 'string') return { ok: false, reason: 'a name must be text' }
  const name = raw.trim()
  if (name.length === 0) return { ok: true, name: null }
  if (CONTROL_CHARS.test(name)) return { ok: false, reason: 'a name cannot contain control characters' }
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, reason: `a name is at most ${MAX_NAME_LENGTH} characters` }
  }
  return { ok: true, name }
}

/**
 * Whether `name` (trimmed) is already some other body's displayed name.
 *
 * @param {string} name
 * @param {readonly { id: string, name: string }[]} bodies `document.bodies()`.
 * @param {string} [exceptId] The body being renamed, so keeping its own name is not a clash.
 * @returns {boolean}
 */
export function isDuplicateName(name, bodies, exceptId) {
  const wanted = typeof name === 'string' ? name.trim() : ''
  if (wanted.length === 0) return false
  return bodies.some((body) => body.id !== exceptId && body.name === wanted)
}

/**
 * The op `document.renameBody` appends (`TODO/core-038`). Mirrors `style.recolor`: metadata
 * that supersedes the lineage's terminal and applies to the whole lineage, newest wins,
 * `null` clears; the kernel fold passes the operand through untouched.
 *
 * The new name rides in `params.name`, **not** `record.name`: a named record joins the scene
 * group as a second part (`kernel/index.js`) and is what `nextName` numbers.
 */
export const RENAME_OP = 'style.rename'

/**
 * The display-name override in force for a lineage: the newest `style.rename` whose
 * `params.name` is valid. A blank or `null` name clears it (the generated name returns); a
 * record with an invalid name (a hand-edited file) is ignored rather than trusted.
 *
 * @param {readonly { op: string, params?: Record<string, any> }[]} lineage Root-first.
 * @returns {string | undefined} `undefined` when none is in force.
 */
export function nameOverrideOf(lineage) {
  /** @type {string | undefined} */
  let override
  for (const record of lineage) {
    if (record.op !== RENAME_OP) continue
    const checked = normalizeBodyName(record.params?.name === undefined ? null : record.params.name)
    if (checked.ok) override = checked.name ?? undefined
  }
  return override
}
