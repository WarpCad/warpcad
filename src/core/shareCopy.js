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
 * The same records with the project id replaced by `id` — a recipient's own copy. Records with
 * no id (a legacy project) come back unchanged, and so does every record but the state line.
 *
 * @param {readonly object[]} records
 * @param {string} id A fresh id (`createProjectId`, `src/core/replica.js`).
 * @returns {object[]}
 */
export function withProjectId(records, id) {
  if (projectIdOfRecords(records) === null) return [...records]
  return records.map((record) => {
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
