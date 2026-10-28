// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The gist client (`TODO/io-017`): publish a project as a GitHub gist, update it, delete it,
 * and read it back **with no token**. Behaviour follows the real calls measured in
 * `docs/decisions/gist-storage.md` (2026-10-28).
 *
 * Framework-free: no Vue, no DOM beyond `fetch`/`TextEncoder`/`TextDecoder`, no storage. The
 * credential lives in `tokenStorage.js` under `GIST_CREDENTIAL_KEY`; the screens are Stage 2.
 *
 * ## What is shared with `hostedBackend.js`, and what is not
 *
 * Shared (imported, not copied): {@link HostedError} (`GistError` extends it, so `instanceof`
 * and `isTransient` hold), `GITHUB_API_ORIGIN`, the token shape check (`isWellFormedToken`), the
 * header set (`githubHeaders`) and status classification (`classifyGitHubFailure`).
 * Not shared: `createHostedClient`'s configurable origin (this client has exactly one, a
 * constant), base64 (gists take plain text), and every message — "nothing was written" is
 * wrong for a read, and a missing gist is not a missing repository.
 *
 * ## The credential rules, enforced here
 *
 * 1. **One origin for authenticated calls**, `https://api.github.com`, a constant. The token
 *    goes in `Authorization` and nowhere else. The only other host this module ever fetches is
 *    `gist.githubusercontent.com`, unauthenticated, for a truncated file.
 * 2. **No server text in any error.** Every message is fixed wording from this module; a
 *    response body is read for classification only. A thrown `fetch` (whose text can quote
 *    the request) becomes `offline` with no cause attached. Nothing here logs anything.
 * 3. **Fields are validated before a URL is built**: the token's shape, the gist id
 *    (`isGistId`, the same rule as the short link), every file name.
 *
 * ## Reading
 *
 * `readGist` returns the project file's **text** and nothing parsed: Stage 2 runs it through
 * the same load path as **Open…**, so every existing validator applies. The file is chosen by a
 * fixed rule — the single `*.ndjson`, else `project.ndjson`, else refuse — and every other
 * file, the README included, is ignored, never interpreted. The size is capped at `io-016`'s
 * decompressed cap before anything is returned, on the reported size and again on the bytes.
 *
 * @module storage/gistBackend
 */

import { GIST_RAW_HOST, isGistId, isGistRawUrl } from '../core/gistLink.js'
import { MAX_DECOMPRESSED_BYTES } from '../core/shareLink.js'
import { GITHUB_API_ORIGIN, HostedError, classifyGitHubFailure, githubHeaders, isWellFormedToken } from './hostedBackend.js'

export { GIST_RAW_HOST }

/**
 * The id the token probe PATCHes. No gist has it, so a token with Gists: write gets 404 and
 * nothing is written; a token without the permission gets 403.
 */
export const PROBE_GIST_ID = '0'.repeat(32)

/** Largest project file read from a gist, in bytes (`io-016`'s decompressed cap). */
export const MAX_GIST_PROJECT_BYTES = MAX_DECOMPRESSED_BYTES

/** The file chosen when a gist holds several `.ndjson` files. */
export const GIST_PROJECT_FILE = 'project.ndjson'

const MAX_FILES = 10
const MAX_DESCRIPTION_CHARS = 1000
const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const REVISION_PATTERN = /^[0-9a-f]{40,64}$/

/**
 * `invalid`: refused before any request. `empty`, `no-project-file`, `ambiguous`,
 * `too-large`, `untrusted-host`: a readable gist that does not hold one readable project.
 * The rest are `hostedBackend.js`'s kinds with the same meaning.
 *
 * @typedef {'unauthorized' | 'forbidden' | 'rate-limited' | 'not-found' | 'conflict' | 'offline'
 *   | 'server' | 'malformed' | 'invalid' | 'empty' | 'no-project-file' | 'ambiguous' | 'too-large'
 *   | 'untrusted-host'} GistFailureKind
 */

/** @type {Record<GistFailureKind, string>} Fixed wording; never the server's, never a token or an id. */
const MESSAGES = {
  unauthorized: 'GitHub rejected this token. It may have expired or been revoked',
  forbidden: 'This token lacks the Gists permission (it needs Gists: read and write)',
  'rate-limited': 'GitHub is limiting requests right now',
  'not-found': 'That gist was not found. It may have been deleted',
  conflict: 'The gist changed while it was being updated',
  offline: 'No network',
  server: 'GitHub is having trouble right now',
  malformed: "GitHub's answer could not be read",
  invalid: 'That request is not valid',
  empty: 'That gist is empty',
  'no-project-file': 'That gist has no WarpCad project file',
  ambiguous: 'That gist has more than one project file and none is named project.ndjson',
  'too-large': 'That project is too large to open',
  'untrusted-host': 'That gist points somewhere WarpCad will not read from',
}

/**
 * A gist failure, normalised. `message` is this module's own wording, safe to show as-is; the
 * UI layer turns `kind` into its own prose ("GitHub is busy. Try again in a few minutes.").
 *
 * @extends {HostedError<GistFailureKind>}
 */
export class GistError extends HostedError {
  /**
   * @param {GistFailureKind} kind
   * @param {string} message
   * @param {{ status?: number, retryAfterMs?: number }} [details]
   */
  constructor(kind, message, details) {
    super(kind, message, details)
    this.name = 'GistError'
  }
}

/**
 * @param {GistFailureKind} kind
 * @param {{ status?: number, retryAfterMs?: number, message?: string }} [details]
 * @returns {GistError}
 */
function fail(kind, { message, ...details } = {}) {
  return new GistError(kind, message ?? MESSAGES[kind], details)
}

/** @param {unknown} value @returns {value is Record<string, any>} */
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/* -------------------------------------------------------------- validation */

/**
 * @param {unknown} token
 * @returns {string}
 */
function checkToken(token) {
  if (!isWellFormedToken(token)) throw fail('invalid', { message: 'That does not look like an access token' })
  return token
}

/**
 * @param {unknown} id
 * @returns {string}
 */
function checkId(id) {
  if (!isGistId(id)) throw fail('invalid', { message: 'That is not a GitHub gist id' })
  return id
}

/**
 * A gist file name: a plain name, no path, no controls.
 *
 * @param {unknown} name
 * @returns {boolean}
 */
function isFileName(name) {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 255 &&
    name !== '.' &&
    name !== '..' &&
    !/[/\\\u0000-\u001f\u007f]/.test(name)
  )
}

/**
 * @param {unknown} files
 * @param {boolean} allowDelete Whether `null` (remove the file, `PATCH` only) is allowed.
 * @returns {Record<string, { content: string } | null>}
 */
function checkFiles(files, allowDelete) {
  if (!isRecord(files)) throw fail('invalid', { message: 'There are no files to publish' })
  const entries = Object.entries(files)
  if (entries.length === 0 || entries.length > MAX_FILES) throw fail('invalid', { message: 'There are no files to publish' })
  /** @type {Record<string, { content: string } | null>} */
  const out = {}
  for (const [name, content] of entries) {
    if (!isFileName(name)) throw fail('invalid', { message: 'A file name is not valid for a gist' })
    if (content === null && allowDelete) out[name] = null
    else if (typeof content === 'string' && content.length > 0) out[name] = { content }
    else throw fail('invalid', { message: 'A gist file cannot be empty' })
  }
  return out
}

/**
 * @param {unknown} description
 * @returns {string}
 */
function checkDescription(description) {
  if (description === undefined) return ''
  if (typeof description !== 'string' || description.length > MAX_DESCRIPTION_CHARS) {
    throw fail('invalid', { message: 'The gist description is not valid' })
  }
  return description
}

/* --------------------------------------------------------------- transport */

/**
 * @param {typeof globalThis.fetch | undefined} injected
 * @returns {typeof globalThis.fetch}
 */
function fetchOf(injected) {
  const fetchImpl = injected ?? globalThis.fetch?.bind(globalThis)
  if (typeof fetchImpl !== 'function') throw new Error('gist storage needs a fetch implementation')
  return fetchImpl
}

/**
 * @param {typeof globalThis.fetch} fetchImpl
 * @param {string} url
 * @param {RequestInit} init
 * @returns {Promise<any>}
 */
async function request(fetchImpl, url, init) {
  try {
    return await fetchImpl(url, { cache: 'no-store', credentials: 'omit', ...init })
  } catch {
    // A thrown `fetch` is a transport failure. Its text can quote the request; never kept.
    throw fail('offline')
  }
}

/**
 * Turn a non-OK response into a `GistError`, through the shared classifier.
 *
 * @param {any} response
 * @param {{ read?: boolean }} [context]
 * @returns {Promise<GistError>}
 */
async function failureOf(response, { read = false } = {}) {
  const { kind, status, retryAfterMs } = await classifyGitHubFailure(response)
  if (kind === 'rate-limited') return fail('rate-limited', { status, retryAfterMs })
  if (kind === 'conflict') return status === 422 ? fail('invalid', { status }) : fail('conflict', { status })
  if (kind === 'forbidden' && read) return fail('forbidden', { status, message: 'GitHub refused to show that gist' })
  return fail(kind, { status })
}

/**
 * @param {any} response
 * @returns {Promise<any>}
 */
async function readJson(response) {
  try {
    return await response.json()
  } catch {
    throw fail('malformed')
  }
}

/**
 * The publish result from a gist body, trusting nothing in it: the id must be a gist id (and
 * the expected one), the revision a commit sha, and the page URL is built, not taken.
 *
 * @param {unknown} body
 * @param {string | null} expectedId
 * @returns {GistPublished}
 */
function publishedOf(body, expectedId) {
  if (!isRecord(body) || !isGistId(body.id) || (expectedId !== null && body.id !== expectedId)) throw fail('malformed')
  const revision = Array.isArray(body.history) ? body.history[0]?.version : undefined
  if (typeof revision !== 'string' || !REVISION_PATTERN.test(revision)) throw fail('malformed')
  /** @type {Record<string, string>} */
  const rawUrls = {}
  if (isRecord(body.files)) {
    for (const [name, file] of Object.entries(body.files)) {
      if (isFileName(name) && isRecord(file) && isGistRawUrl(file.raw_url)) rawUrls[name] = file.raw_url
    }
  }
  return { id: body.id, revision, url: `https://gist.github.com/${body.id}`, rawUrls }
}

/* ------------------------------------------------------------------ public */

/**
 * @typedef {object} GistTokenInfo
 * @property {string} login The GitHub account the token belongs to.
 * @property {string | null} expiresAt ISO time the token expires, when GitHub says.
 * @property {boolean} broaderThanNeeded A classic token with scopes beyond `gist`.
 * @property {'classic' | 'fine-grained'} tokenKind Classic tokens report their scopes; fine-grained do not.
 */

/**
 * @typedef {object} GistPublished
 * @property {string} id The gist id (the short link's capability).
 * @property {string} revision The new revision (`history[0].version`).
 * @property {string} url The gist's page, `https://gist.github.com/<id>`.
 * @property {Record<string, string>} rawUrls Each file's `gist.githubusercontent.com` link, by name.
 */

/**
 * @typedef {object} GistRead
 * @property {string} id
 * @property {string} description The gist's description ('' when none).
 * @property {string} text The project file's text, unparsed.
 * @property {string | null} revision
 * @property {string | null} updatedAt
 * @property {string} fileName The file that was chosen.
 */

/**
 * `github-authentication-token-expiration` (`2026-11-27 14:05:00 UTC`) as an ISO time.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
function expiryOf(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) (UTC|[+-]\d{4})$/.exec(value.trim())
  if (!match) return null
  const zone = match[3] === 'UTC' ? 'Z' : `${match[3].slice(0, 3)}:${match[3].slice(3)}`
  const date = new Date(`${match[1]}T${match[2]}${zone}`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Check a token can write gists, and whose it is. Uses the write probe from the decision record
 * — `PATCH /gists/<all-zero id>`: 404 means Gists: write is granted (and nothing is written),
 * 403 that it is missing, 401 that the token is rejected or expired — **not**
 * `GET /gists?per_page=1`, which answers 200 for a token with no gist permission at all. A
 * classic token's `X-OAuth-Scopes` must include `gist`; anything beyond it sets
 * `broaderThanNeeded` (the header itself is never returned or logged).
 *
 * @param {{ token: string, fetch?: typeof globalThis.fetch }} options
 * @returns {Promise<GistTokenInfo>}
 */
export async function validateGistToken({ token, fetch: injected }) {
  const checked = checkToken(token)
  const fetchImpl = fetchOf(injected)

  const probe = await request(fetchImpl, `${GITHUB_API_ORIGIN}/gists/${PROBE_GIST_ID}`, {
    method: 'PATCH',
    headers: githubHeaders(checked, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ description: 'x' }),
  })
  if (probe.status !== 404 && !probe.ok) throw await failureOf(probe)

  const scopesHeader = probe.headers?.get?.('x-oauth-scopes')
  /** @type {'classic' | 'fine-grained'} */
  let tokenKind = 'fine-grained'
  let broaderThanNeeded = false
  if (typeof scopesHeader === 'string') {
    tokenKind = 'classic'
    const scopes = scopesHeader.split(',').map((scope) => scope.trim()).filter((scope) => scope !== '')
    if (!scopes.includes('gist')) throw fail('forbidden', { status: probe.status })
    broaderThanNeeded = scopes.some((scope) => scope !== 'gist')
  }
  const expiresAt = expiryOf(probe.headers?.get?.('github-authentication-token-expiration'))

  const user = await request(fetchImpl, `${GITHUB_API_ORIGIN}/user`, { method: 'GET', headers: githubHeaders(checked) })
  if (!user.ok) throw await failureOf(user)
  const body = await readJson(user)
  if (!isRecord(body) || typeof body.login !== 'string' || !LOGIN_PATTERN.test(body.login)) throw fail('malformed')
  return { login: body.login, expiresAt, broaderThanNeeded, tokenKind }
}

/**
 * Create a gist. **Secret by default**; public only when `public` is exactly `true` (GitHub
 * cannot later turn a secret gist public, or back).
 *
 * @param {{ token: string, files: Record<string, string>, description?: string, public?: boolean,
 *   fetch?: typeof globalThis.fetch }} options
 * @returns {Promise<GistPublished>}
 */
export async function createGist({ token, files, description, public: isPublic, fetch: injected }) {
  const checked = checkToken(token)
  const body = { description: checkDescription(description), public: isPublic === true, files: checkFiles(files, false) }
  const fetchImpl = fetchOf(injected)
  const response = await request(fetchImpl, `${GITHUB_API_ORIGIN}/gists`, {
    method: 'POST',
    headers: githubHeaders(checked, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await failureOf(response)
  return publishedOf(await readJson(response), null)
}

/**
 * Update a gist in place — the same id, a new revision. A file set to `null` is removed (a
 * renamed project's old file). No `public` flag is sent.
 *
 * @param {{ token: string, id: string, files: Record<string, string | null>, description?: string,
 *   fetch?: typeof globalThis.fetch }} options
 * @returns {Promise<GistPublished>}
 */
export async function updateGist({ token, id, files, description, fetch: injected }) {
  const checked = checkToken(token)
  const gistId = checkId(id)
  /** @type {{ description?: string, files: Record<string, { content: string } | null> }} */
  const body = { files: checkFiles(files, true) }
  if (description !== undefined) body.description = checkDescription(description)
  const fetchImpl = fetchOf(injected)
  const response = await request(fetchImpl, `${GITHUB_API_ORIGIN}/gists/${gistId}`, {
    method: 'PATCH',
    headers: githubHeaders(checked, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await failureOf(response)
  return publishedOf(await readJson(response), gistId)
}

/**
 * Delete a gist (**Stop sharing**). Resolves on 204. A 404 rejects as `not-found`; the caller
 * may treat that as already stopped.
 *
 * @param {{ token: string, id: string, fetch?: typeof globalThis.fetch }} options
 * @returns {Promise<void>}
 */
export async function deleteGist({ token, id, fetch: injected }) {
  const checked = checkToken(token)
  const gistId = checkId(id)
  const fetchImpl = fetchOf(injected)
  const response = await request(fetchImpl, `${GITHUB_API_ORIGIN}/gists/${gistId}`, {
    method: 'DELETE',
    headers: githubHeaders(checked),
  })
  if (!response.ok) throw await failureOf(response)
}

/**
 * The project file's name by the fixed rule: the single `*.ndjson`, else `project.ndjson`.
 *
 * @param {Record<string, unknown>} files
 * @returns {string}
 */
function chooseProjectFile(files) {
  const names = Object.keys(files)
  if (names.length === 0) throw fail('empty')
  const projects = names.filter((name) => name.endsWith('.ndjson'))
  if (projects.length === 1) return projects[0]
  if (projects.length === 0) throw fail('no-project-file')
  if (projects.includes(GIST_PROJECT_FILE)) return GIST_PROJECT_FILE
  throw fail('ambiguous')
}

/**
 * UTF-8 length of `text` above `max`, without encoding it when the answer is obvious.
 *
 * @param {string} text
 * @param {number} max
 * @returns {boolean}
 */
function overBytes(text, max) {
  if (text.length > max) return true
  if (text.length * 3 <= max) return false
  return new TextEncoder().encode(text).length > max
}

/**
 * The body's bytes, refusing (and cancelling) as soon as they pass `max`.
 *
 * @param {any} response
 * @param {number} max
 * @returns {Promise<Uint8Array>}
 */
async function cappedBytes(response, max) {
  const declared = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(declared) && declared > max) throw fail('too-large')
  const reader = response.body?.getReader?.()
  if (reader) {
    /** @type {Uint8Array[]} */
    const chunks = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > max) {
        void reader.cancel().catch(() => {})
        throw fail('too-large')
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > max) throw fail('too-large')
  return bytes
}

/**
 * Read a gist's project file, **unauthenticated** (no token, no account; 60 requests an hour
 * per IP). Returns the text unparsed — Stage 2 loads it through **Open…**'s path.
 *
 * @param {{ id: string, fetch?: typeof globalThis.fetch }} options
 * @returns {Promise<GistRead>}
 */
export async function readGist({ id, fetch: injected }) {
  const gistId = checkId(id)
  const fetchImpl = fetchOf(injected)
  const response = await request(fetchImpl, `${GITHUB_API_ORIGIN}/gists/${gistId}`, {
    method: 'GET',
    headers: githubHeaders(null),
  })
  if (!response.ok) throw await failureOf(response, { read: true })
  const body = await readJson(response)
  if (!isRecord(body) || body.id !== gistId || !isRecord(body.files)) throw fail('malformed')

  const fileName = chooseProjectFile(body.files)
  const file = body.files[fileName]
  if (!isRecord(file)) throw fail('malformed')
  if (typeof file.size === 'number' && file.size > MAX_GIST_PROJECT_BYTES) throw fail('too-large')

  /** @type {string} */
  let text
  if (file.truncated === true) {
    // Over about 1 MB the API inlines only part of the file; the rest is on the raw host.
    if (!isGistRawUrl(file.raw_url)) throw fail('untrusted-host')
    const raw = await request(fetchImpl, file.raw_url, { method: 'GET' })
    if (!raw.ok) throw await failureOf(raw, { read: true })
    if (typeof raw.url === 'string' && raw.url !== '' && !isGistRawUrl(raw.url)) throw fail('untrusted-host')
    const bytes = await cappedBytes(raw, MAX_GIST_PROJECT_BYTES)
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw fail('malformed')
    }
  } else {
    if (typeof file.content !== 'string') throw fail('malformed')
    if (overBytes(file.content, MAX_GIST_PROJECT_BYTES)) throw fail('too-large')
    text = file.content
  }

  const revision = Array.isArray(body.history) ? body.history[0]?.version : undefined
  return {
    id: gistId,
    description: typeof body.description === 'string' ? Array.from(body.description).slice(0, MAX_DESCRIPTION_CHARS).join('') : '',
    text,
    revision: typeof revision === 'string' && REVISION_PATTERN.test(revision) ? revision : null,
    updatedAt: typeof body.updated_at === 'string' ? body.updated_at : null,
    fileName,
  }
}
