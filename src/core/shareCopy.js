// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What a shared project's records say about which project they are, and how a recipient's
 * **Make my own copy to edit** becomes a new project (`TODO/io-016`, `TODO/data-013`).
 *
 * A project's id lives in the state line's merge section (`{"warpcad":"project-state", …,
 * "merge":{"project":"<id>", …}}`, `src/core/merge/section.js`). Two files with the same id are
 * copies of one project and can be merged; with different ids they are different projects. A
 * recipient's copy gets a **new** id so it is never mistaken for the sender's, while a link whose
 * id equals the project already open here is the sender re-sending an update, which is merged.
 *
 * A legacy project (no id) is left as it is: a document only mints an id for content it made
 * itself (`document.js`, `mintable`), and synthesising a merge section here would be a second,
 * unvalidated writer of that format.
 *
 * **A copy never inherits the sender's gist** (`TODO/io-017`). A published project carries the
 * gist it is published as (`merge.gist`, `src/core/gistField.js`); a recipient's copy is a new
 * project that does not own that gist, so {@link withProjectId} drops it ({@link withoutGist}),
 * legacy project or not. The sender's own text (Merge their changes, Open theirs instead) keeps it.
 *
 * Pure and framework-free: records in, records out. The input is never mutated.
 *
 * @module core/shareCopy
 */

const STATE_KIND = 'project-state'

/**
 * @param {unknown} record
 * @returns {record is { warpcad: string, merge?: unknown }}
 */
function isStateLine(record) {
  return record !== null && typeof record === 'object' && /** @type {any} */ (record).warpcad === STATE_KIND
}

/**
 * The project id a project's records carry, or `null` for a legacy project (or no state line).
 *
 * @param {readonly object[]} records The project's NDJSON records.
 * @returns {string | null}
 */
export function projectIdOfRecords(records) {
  const state = records.find(isStateLine)
  const merge = state === undefined ? undefined : /** @type {any} */ (state).merge
  const id = merge !== null && typeof merge === 'object' ? merge.project : undefined
  return typeof id === 'string' && id !== '' ? id : null
}

/**
 * The same records without the gist they are published as (`TODO/io-017`): the state line's
 * `merge.gist` removed, every other record the same object. Records with no gist come back as
 * they were. The input is never mutated.
 *
 * @param {readonly object[]} records
 * @returns {object[]}
 */
export function withoutGist(records) {
  return records.map((record) => {
    if (!isStateLine(record)) return record
    const merge = /** @type {any} */ (record).merge
    if (merge === null || typeof merge !== 'object' || !Object.hasOwn(merge, 'gist')) return record
    const { gist: _dropped, ...rest } = /** @type {Record<string, unknown>} */ (merge)
    return { ...record, merge: rest }
  })
}

/**
 * The same records with the project id replaced by `id` — a recipient's own copy — and without
 * the sender's gist ({@link withoutGist}). Records with no id (a legacy project) keep having
 * none, and every record but the state line is the same object.
 *
 * @param {readonly object[]} records
 * @param {string} id A fresh id (`createProjectId`, `src/core/replica.js`).
 * @returns {object[]}
 */
export function withProjectId(records, id) {
  const copy = withoutGist(records)
  if (projectIdOfRecords(copy) === null) return copy
  return copy.map((record) => {
    if (!isStateLine(record)) return record
    const merge = /** @type {Record<string, unknown>} */ (/** @type {any} */ (record).merge)
    return { ...record, merge: { ...merge, project: id } }
  })
}

/** The longest file name stem {@link shareFileName} produces, before `.ndjson`. */
const FILE_STEM_MAX = 80

/**
 * A project file name made from a shared project's title — what **Send the file** and **Save a
 * copy of the file** download as. The title arrives in a link, so it is hostile text: path
 * separators, characters no file system accepts, control characters and leading dots are
 * replaced, and it is cut to a sane length. Falls back to `warpcad-project`.
 *
 * @param {string} name
 * @returns {string} e.g. `Phone stand.ndjson`.
 */
export function shareFileName(name) {
  const stem = String(name)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s-]+/, '')
    .slice(0, FILE_STEM_MAX)
    .trim()
  return `${stem === '' ? 'warpcad-project' : stem}.ndjson`
}
