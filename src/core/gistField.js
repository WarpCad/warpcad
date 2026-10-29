// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The project's `gist` field (`TODO/io-017`): which GitHub gist this project is published as.
 *
 * `{ id, public, lastRevision, owner }`:
 *
 * - `id` — the gist id, the short link's capability (`gistLink.js`'s {@link isGistId});
 * - `public` — whether it was created public (GitHub cannot change this afterwards);
 * - `lastRevision` — the gist revision this project last wrote or merged in, so **Update gist**
 *   knows when someone else's write came in between and merges it first (`TODO/io-019`,
 *   `docs/decisions/gist-storage.md`);
 * - `owner` — the GitHub login that published it. A project file can be opened by someone who
 *   is not that account (a file sent by hand, not a link), and only the owner can update or
 *   delete the gist, so the screens treat a field whose owner is not the connected account as
 *   "not published from here" rather than offering an Update that GitHub would refuse.
 *
 * It records an **external fact**, not a modelling step, so it lives outside both undo stacks
 * (`document.js`'s `setGist`) and merges last-writer-wins as one register. In the file it is the
 * state line's `merge.gist` (`merge/section.js`), beside `merge.project`.
 *
 * Untrusted when read from a file: {@link normalizeGistField} validates every field and keeps
 * only these four, so nothing else that arrives with a project is carried along.
 *
 * Framework-free.
 *
 * @module core/gistField
 */

import { isGistId, isGitHubLogin } from './gistLink.js'

/** A gist revision: the commit sha GitHub reports as `history[0].version`. */
const REVISION_PATTERN = /^[0-9a-f]{40,64}$/

/**
 * @typedef {object} GistField
 * @property {string} id
 * @property {boolean} public
 * @property {string} lastRevision
 * @property {string} owner
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * A validated copy of a gist field: exactly the four fields, in a fixed order.
 *
 * @param {unknown} value
 * @returns {GistField}
 * @throws {Error} Naming the field that is wrong; the message never quotes the value.
 */
export function normalizeGistField(value) {
  if (!isRecord(value)) throw new Error('gist must be an object')
  if (!isGistId(value.id)) throw new Error('gist id is not a GitHub gist id')
  if (typeof value.public !== 'boolean') throw new Error('gist public must be true or false')
  if (typeof value.lastRevision !== 'string' || !REVISION_PATTERN.test(value.lastRevision)) {
    throw new Error('gist lastRevision is not a gist revision')
  }
  if (!isGitHubLogin(value.owner)) throw new Error('gist owner is not a GitHub login')
  return { id: value.id, public: value.public, lastRevision: value.lastRevision, owner: value.owner }
}

/**
 * @param {GistField | null} a
 * @param {GistField | null} b
 * @returns {boolean}
 */
export function sameGistField(a, b) {
  if (a === null || b === null) return a === b
  return a.id === b.id && a.public === b.public && a.lastRevision === b.lastRevision && a.owner === b.owner
}
