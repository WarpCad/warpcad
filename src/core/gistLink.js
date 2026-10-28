// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The short link to a project published as a GitHub gist (`TODO/io-017`):
 * `<host>/#/gist/<id>`. The **only** place that builds or parses a `#/gist/` route, as
 * `shareLink.js` is for `#/share/v1/…`.
 *
 * The id is a **bearer capability**: anyone holding it can read a secret gist. So it is
 * validated strictly — lowercase hex, 20 to 32 characters, the two shapes GitHub issues — and
 * anything else is refused rather than normalised, trimmed or guessed at. `gistBackend.js`
 * validates with {@link isGistId} before it builds any API URL, so a hostile hash can never
 * become a path on `api.github.com`.
 *
 * The link lives in the fragment, which never reaches a server (`CLAUDE.md`: no client-side
 * router, shareable state in the hash). The host is `io-016`'s {@link SHARE_HOST}, never
 * `location.origin` (the native shell and the dev host have other origins).
 *
 * @module core/gistLink
 */

import { SHARE_HOST } from './shareLink.js'

/** The route prefix, as it appears in `location.hash`. */
export const GIST_ROUTE = '#/gist/'
/** The only host a gist file's `raw_url` may point at (`docs/decisions/gist-storage.md`). */
export const GIST_RAW_HOST = 'gist.githubusercontent.com'

const ID_PATTERN = /^[0-9a-f]{20,32}$/
/** The whole hash: the route, a valid id, at most one trailing slash, nothing else. */
const HASH_PATTERN = /^#\/gist\/([0-9a-f]{20,32})\/?$/
/** The route at the start of a hash, whatever follows — for "this link looks incomplete". */
const ROUTE_AT_START = /^#\/gist\//

/**
 * Whether `value` is exactly a GitHub gist id.
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export function isGistId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

/**
 * @typedef {object} GistLinkOptions
 * @property {string} [host] Override of {@link SHARE_HOST}, for tests and the dev host.
 */

/**
 * Build the short link for a gist.
 *
 * @param {string} id A gist id ({@link isGistId}).
 * @param {GistLinkOptions} [options]
 * @returns {string} `<host>/#/gist/<id>`.
 * @throws {Error} When `id` is not a gist id. The message does not quote the value.
 */
export function gistLink(id, options = {}) {
  if (!isGistId(id)) throw new Error('Not a GitHub gist id')
  return `${options.host ?? SHARE_HOST}/${GIST_ROUTE}${id}`
}

/**
 * The hash part of `text` if it is a bare hash, a relative `/#…`, or a full URL on `host`
 * with path `/`, no query and no credentials; otherwise null.
 *
 * @param {string} text
 * @param {string} host
 * @returns {string | null}
 */
function hashOf(text, host) {
  if (text.startsWith('#')) return text
  if (text.startsWith('/#')) return text.slice(1)
  /** @type {URL} */
  let url
  /** @type {URL} */
  let expected
  try {
    url = new URL(text)
    expected = new URL(host)
  } catch {
    return null
  }
  if (url.origin !== expected.origin || url.username !== '' || url.password !== '') return null
  if (url.pathname !== '/' || url.search !== '') return null
  // `url.hash` is percent-encoded by the parser; take the raw text so nothing is normalised.
  const at = text.indexOf('#')
  return at === -1 ? null : text.slice(at)
}

/**
 * Read a gist id from a hash (`#/gist/<id>`), a relative `/#/gist/<id>`, or the full link on
 * `host`. Strict: surrounding whitespace, a query, an extra segment, an encoded character or a
 * bad id all give null. Never throws.
 *
 * @param {string} text
 * @param {GistLinkOptions} [options]
 * @returns {string | null} The id, or null.
 */
export function parseGistHash(text, options = {}) {
  if (typeof text !== 'string') return null
  const hash = hashOf(text, options.host ?? SHARE_HOST)
  if (hash === null) return null
  const match = HASH_PATTERN.exec(hash)
  return match ? match[1] : null
}

/**
 * Whether `text` is a `#/gist/…` route at all, valid id or not — what boot uses to choose the
 * gist branch (and its "this link looks incomplete" screen) over the editor.
 *
 * @param {string} text A hash, a relative `/#/gist/…` or a full URL.
 * @returns {boolean}
 */
export function isGistLink(text) {
  if (typeof text !== 'string') return false
  const at = text.indexOf('#')
  return at !== -1 && ROUTE_AT_START.test(text.slice(at))
}

/** A GitHub login: what `GET /user` returns (the same rule `gistBackend.js` checks). */
const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/

/**
 * Whether `value` is shaped like a GitHub login (an account name).
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export function isGitHubLogin(value) {
  return typeof value === 'string' && LOGIN_PATTERN.test(value)
}

/** Longest slug {@link gistFileName} produces, before `.ndjson`. */
export const MAX_GIST_SLUG_CHARS = 60
/** The file name when a project's name leaves nothing usable. */
const FALLBACK_SLUG = 'project'
/** A file name {@link gistRawFileUrl} accepts: ASCII that no URL needs to encode, no path. */
const RAW_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)+$/

/**
 * The project file's name inside a published gist, `<project-slug>.ndjson` (`TODO/io-017`).
 *
 * The project's name is the user's own text — emoji, right-to-left scripts, slashes, anything —
 * and a gist file name ends up in a URL path, so the slug keeps only what needs no encoding:
 * accents are folded (`Café` → `cafe`), everything that is not `a-z` or `0-9` becomes a single
 * hyphen, and the result is trimmed of hyphens and capped at {@link MAX_GIST_SLUG_CHARS}. A name
 * that leaves nothing (only emoji, only Hebrew, only punctuation) falls back to `project`. Never a
 * path, never a dot file, never `..`.
 *
 * @param {string} name The project's name.
 * @returns {string} e.g. `phone-stand.ndjson`.
 */
export function gistFileName(name) {
  const text = typeof name === 'string' ? name : ''
  const slug = text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    // Runs collapse to one hyphen, so trimming one from each end is enough.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_GIST_SLUG_CHARS)
    .replace(/-$/, '')
  return `${slug === '' ? FALLBACK_SLUG : slug}.ndjson`
}

/**
 * The README's link to the project file: `https://gist.githubusercontent.com/<login>/<id>/raw/<file>`.
 * **Revision-free on purpose** — the `raw_url` GitHub returns pins a commit sha, so a README built
 * from it would keep pointing at the first publish forever; this form always serves the latest.
 *
 * @param {string} login The gist owner's GitHub login.
 * @param {string} id The gist id.
 * @param {string} fileName The project file's name ({@link gistFileName}).
 * @returns {string} A URL {@link isGistRawUrl} accepts.
 * @throws {Error} When any part is not what it should be. The message quotes none of them.
 */
export function gistRawFileUrl(login, id, fileName) {
  if (!isGitHubLogin(login)) throw new Error('Not a GitHub login')
  if (!isGistId(id)) throw new Error('Not a GitHub gist id')
  if (typeof fileName !== 'string' || fileName.length > 255 || !RAW_FILE_PATTERN.test(fileName)) {
    throw new Error('Not a gist file name a link can carry')
  }
  const url = `https://${GIST_RAW_HOST}/${login}/${id}/raw/${fileName}`
  if (!isGistRawUrl(url)) throw new Error('Not a gist raw link')
  return url
}

/**
 * Whether `value` is exactly an https URL on {@link GIST_RAW_HOST} — no port, no credentials,
 * and nothing the URL parser had to re-encode (spaces, `<`, `>`). The README links to it and
 * the reader follows it only when this holds.
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export function isGistRawUrl(value) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname === GIST_RAW_HOST &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      url.href === value
    )
  } catch {
    return false
  }
}
