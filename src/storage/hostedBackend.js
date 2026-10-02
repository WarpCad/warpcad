// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The hosted git backend's client (`TODO/io-002`): read and write one project
 * file in a user-connected repository, over the GitHub Contents API.
 *
 * **Hand-rolled `fetch`, deliberately** — `docs/decisions/persistence-export.md`
 * sub-decision 3 measured `octokit` at 43,769 B gzip (16.7% of the app bundle) to
 * call three endpoints, and the one semantic this task actually needs — refuse a
 * stale overwrite — is a property of the API (`PUT` with the last-known blob
 * `sha` → **409**), not of any client. What hand-rolling costs is written out
 * here rather than hidden: status normalisation and base64.
 *
 * Framework-free: no Vue, no DOM beyond `fetch`/`TextEncoder`, no storage. The
 * scheduler (`autoPush.js`) owns *when* to call this; the store (`stores/hosted.js`)
 * owns what it means to the user.
 *
 * ## The credential rules this module enforces, not merely follows
 *
 * 1. **One origin, allowlisted at construction.** A client for any origin but
 *    `https://api.github.com` throws before a request object exists, so a
 *    mis-set config can never send a token somewhere else.
 * 2. **The token goes in an `Authorization` header and nowhere else** — never a
 *    query string (which lands in server logs and `Referer`), never a path.
 * 3. **No server text is ever echoed into an error.** GitHub's own error body can
 *    quote the credential it rejected; every message here is this module's own
 *    fixed wording, and the body is read for *classification only*. That is what
 *    keeps a token out of the chip, the console, and any log the user pastes into
 *    a bug report.
 * 4. **Connection fields are validated before a URL is built** — an owner/repo/path
 *    that could escape the path, or a token with a CR/LF in it (header injection),
 *    is refused.
 *
 * ## Endpoints
 *
 * | Need | Endpoint |
 * |---|---|
 * | Read the file + its blob sha | `GET /repos/{owner}/{repo}/contents/{path}` |
 * | Tell "no file yet" from "no repo" on a 404 | `GET /repos/{owner}/{repo}` |
 * | Write, refusing a stale overwrite | `PUT /repos/{owner}/{repo}/contents/{path}` with `sha` |
 * | A file too big for the contents endpoint | `GET /repos/{owner}/{repo}/git/blobs/{sha}` |
 *
 * The fourth is not in the decision record's list of three and is here for a
 * specific reason: the Contents API returns `"encoding": "none"` with an **empty
 * content field** above 1 MB. Reading that as an empty project and saving it back
 * would commit a truncated log over a real one — silent data loss, which is the
 * exact failure mode this task exists to prevent. Ten lines to follow the blob.
 *
 * **Branch**: the repository's **default branch**, always — no `branch` field is
 * sent. `data-002` left branch selection "Still open"; the default branch plus a
 * fixed path keeps the phone Connect dialog to three fields, and adding a branch
 * field later is additive (see `docs/save-load.md`).
 *
 * @module storage/hostedBackend
 */

/** The only origin a token is ever sent to. */
export const GITHUB_API_ORIGIN = 'https://api.github.com'

/** The project file's default path in the repository. */
export const DEFAULT_HOSTED_PATH = 'warpcad-project.ndjson'

/** Commit messages (`docs/decisions/interaction-model-qa.md` §11). */
export const EXPLICIT_COMMIT_MESSAGE = 'WarpCad: save'

/**
 * @param {Date | number} at
 * @returns {string} The auto-push commit message for a burst that ended at `at`.
 */
export function autoPushCommitMessage(at) {
  return `WarpCad: auto-push ${new Date(at).toISOString()}`
}

/**
 * @typedef {'unauthorized' | 'forbidden' | 'rate-limited' | 'not-found' | 'conflict'
 *   | 'offline' | 'server' | 'malformed' | 'invalid'} HostedFailureKind
 */

/**
 * A hosted-storage failure, normalised. `message` is always this module's own
 * wording and is safe to show the user as-is — it never contains the token and
 * never quotes the host's response body.
 */
export class HostedError extends Error {
  /**
   * @param {HostedFailureKind} kind
   * @param {string} message
   * @param {{ status?: number, retryAfterMs?: number }} [details]
   */
  constructor(kind, message, { status, retryAfterMs } = {}) {
    super(message)
    this.name = 'HostedError'
    /** @type {HostedFailureKind} */
    this.kind = kind
    /** @type {number | undefined} */
    this.status = status
    /** @type {number | undefined} */
    this.retryAfterMs = retryAfterMs
  }
}

/** Kinds a retry could plausibly fix (the scheduler's backoff path). */
export function isTransient(/** @type {HostedError} */ error) {
  return error.kind === 'offline' || error.kind === 'server' || error.kind === 'rate-limited'
}

/* ------------------------------------------------------------------ base64 */

/** `btoa` takes a binary string; build it in chunks so a multi-MB log cannot blow the stack. */
const CHUNK = 0x8000

/**
 * UTF-8 safe base64, for the Contents API (which is base64-only).
 *
 * Not `btoa(String.fromCharCode(...bytes))`: spreading a multi-megabyte array
 * exceeds the argument limit, and `btoa` of the raw string throws on anything
 * outside Latin-1 — a part named in Japanese is enough.
 *
 * @param {string} text
 * @returns {string}
 */
export function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode.apply(null, /** @type {any} */ (bytes.subarray(index, index + CHUNK)))
  }
  return btoa(binary)
}

/**
 * The inverse, tolerating the 60-column line breaks GitHub wraps content in.
 *
 * @param {string} encoded
 * @returns {string}
 */
export function decodeBase64(encoded) {
  const binary = atob(encoded.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new TextDecoder().decode(bytes)
}

/* -------------------------------------------------------------- validation */

const SEGMENT = /^[A-Za-z0-9._-]+$/

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function checkSegment(value, label) {
  if (typeof value !== 'string' || value.length === 0 || !SEGMENT.test(value) || value === '.' || value === '..') {
    throw new HostedError('invalid', `"${label}" must look like a GitHub ${label} name`)
  }
  return value
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function checkPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 255) {
    throw new HostedError('invalid', 'The file path is empty or too long')
  }
  if (value.startsWith('/') || value.endsWith('/') || value.includes('//') || /(^|\/)\.\.(\/|$)/.test(value)) {
    throw new HostedError('invalid', 'The file path must be a plain path inside the repository')
  }
  if (/[\x00-\x1f\x7f]/.test(value)) {
    throw new HostedError('invalid', 'The file path contains characters a repository cannot hold')
  }
  return value
}

/**
 * A credential with a CR/LF in it would split the request header. Refuse it at
 * the boundary rather than trusting `fetch` to.
 *
 * @param {unknown} value
 * @returns {string}
 */
function checkToken(value) {
  if (typeof value !== 'string' || value.trim().length === 0 || /[^\x21-\x7e]/.test(value)) {
    throw new HostedError('invalid', 'That does not look like an access token')
  }
  return value
}

/**
 * @typedef {object} HostedConnection
 * @property {string} token
 * @property {string} owner
 * @property {string} repo
 * @property {string} path
 */

/**
 * Validate the fields of a candidate connection, throwing a `HostedError` of kind
 * `invalid` with a message safe to show under the Connect form's own field.
 *
 * Exported because the check belongs in two places, on purpose: the client
 * enforces it (nothing malformed can ever reach a URL or a header), and the
 * Connect dialog wants the same answer **synchronously, without a network
 * round-trip**, to reject `owner/repo` typed into the owner box.
 *
 * @param {Partial<HostedConnection>} fields
 * @returns {HostedConnection}
 */
export function validateConnection(fields) {
  const source = fields ?? /** @type {any} */ ({})
  return {
    token: checkToken(source.token),
    owner: checkSegment(source.owner, 'owner'),
    repo: checkSegment(source.repo, 'repo'),
    path: checkPath(source.path),
  }
}

/* ------------------------------------------------------------------ client */

/**
 * @typedef {object} HostedClient
 * @property {string} apiOrigin
 * @property {(connection: HostedConnection) => Promise<{ exists: boolean, sha: string | null, text: string | null }>} read
 * @property {(connection: HostedConnection, write: { text: string, sha: string | null, message: string }) => Promise<{ sha: string }>} write
 */

/**
 * @param {object} [options]
 * @param {typeof globalThis.fetch} [options.fetch] The boundary every test mocks.
 * @param {string} [options.apiOrigin]
 * @param {string[]} [options.allowedOrigins]
 * @returns {HostedClient}
 */
export function createHostedClient({
  fetch: fetchImpl = globalThis.fetch?.bind(globalThis),
  apiOrigin = GITHUB_API_ORIGIN,
  allowedOrigins = [GITHUB_API_ORIGIN],
} = {}) {
  if (!allowedOrigins.includes(apiOrigin)) {
    // Thrown at construction, before any request object exists: a misconfigured
    // origin can never be the thing that leaks a credential.
    throw new Error(
      `hosted storage refuses the origin ${apiOrigin}: a token is only ever sent to ${allowedOrigins.join(', ')}`,
    )
  }
  if (typeof fetchImpl !== 'function') throw new Error('hosted storage needs a fetch implementation')

  const checkConnection = validateConnection

  /**
   * @param {string} token
   * @param {object} [extra]
   */
  function headers(token, extra = {}) {
    return {
      // The one place the credential appears. Never a query string: those land in
      // server logs and `Referer` headers.
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...extra,
    }
  }

  /**
   * @param {any} response
   * @returns {number | undefined}
   */
  function retryAfterMs(response) {
    const after = Number(response.headers?.get?.('retry-after'))
    if (Number.isFinite(after) && after > 0) return after * 1000
    const reset = Number(response.headers?.get?.('x-ratelimit-reset'))
    if (Number.isFinite(reset) && reset > 0) return Math.max(0, reset * 1000 - Date.now())
    return undefined
  }

  /**
   * Turn a non-OK response into a `HostedError`. The body is read for
   * **classification only** — never for the message (see the module note).
   *
   * @param {any} response
   * @returns {Promise<HostedError>}
   */
  async function failureOf(response) {
    let hint = ''
    try {
      hint = (await response.text()).slice(0, 400).toLowerCase()
    } catch {
      /* an unreadable body classifies as whatever the status says */
    }
    const status = response.status
    if (status === 401) {
      return new HostedError('unauthorized', 'GitHub rejected this token', { status })
    }
    if (status === 429 || (status === 403 && (response.headers?.get?.('x-ratelimit-remaining') === '0' || hint.includes('rate limit')))) {
      const wait = retryAfterMs(response)
      const minutes = wait === undefined ? null : Math.max(1, Math.round(wait / 60000))
      return new HostedError(
        'rate-limited',
        minutes === null ? 'Rate limited — try again shortly' : `Rate limited — try again in ${minutes} minute${minutes === 1 ? '' : 's'}`,
        { status, retryAfterMs: wait },
      )
    }
    if (status === 403) {
      return new HostedError(
        'forbidden',
        'This token does not have permission to write to that repository (it needs Contents: read and write)',
        { status },
      )
    }
    if (status === 404) {
      return new HostedError('not-found', 'Repository not found, or the token has no access to it', { status })
    }
    if (status === 409 || status === 422) {
      return new HostedError('conflict', 'The repository copy changed since you last loaded or saved it', { status })
    }
    if (status >= 500) {
      return new HostedError('server', 'GitHub is having trouble right now — nothing was written', { status })
    }
    return new HostedError('malformed', `GitHub answered unexpectedly (status ${status})`, { status })
  }

  /**
   * @param {string} url
   * @param {object} init
   * @returns {Promise<any>}
   */
  async function request(url, init) {
    try {
      return await fetchImpl(url, init)
    } catch {
      // A thrown `fetch` is a transport failure: DNS, offline, CORS, an aborted
      // connection. The cause is never echoed — it can quote the request.
      throw new HostedError('offline', 'No network — nothing was written')
    }
  }

  /**
   * @param {any} response
   * @returns {Promise<any>}
   */
  async function readJson(response) {
    try {
      return await response.json()
    } catch {
      throw new HostedError('malformed', "GitHub's answer could not be read")
    }
  }

  /** @param {HostedConnection} connection */
  function contentsUrl({ owner, repo, path }) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/')
    return `${apiOrigin}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`
  }

  return {
    apiOrigin,

    async read(connection) {
      const checked = checkConnection(connection)
      const response = await request(contentsUrl(checked), {
        method: 'GET',
        headers: headers(checked.token),
        // The Contents API caches aggressively behind a CDN; a stale 200 here would
        // hand back an old sha and turn every save into a spurious conflict.
        cache: 'no-store',
      })

      if (response.status === 404) {
        // 404 is both "no such repo" and "no such file". Distinguish them: a repo we
        // can see with no project file yet is the ordinary first-connection state,
        // not an error (`interaction-model-qa.md` §11).
        const repo = await request(
          `${apiOrigin}/repos/${encodeURIComponent(checked.owner)}/${encodeURIComponent(checked.repo)}`,
          { method: 'GET', headers: headers(checked.token), cache: 'no-store' },
        )
        if (repo.ok) return { exists: false, sha: null, text: null }
        throw await failureOf(repo)
      }
      if (!response.ok) throw await failureOf(response)

      const body = await readJson(response)
      if (body === null || typeof body !== 'object' || Array.isArray(body) || typeof body.sha !== 'string') {
        throw new HostedError('malformed', 'That path is not a file in the repository')
      }
      if (body.encoding === 'base64' && typeof body.content === 'string' && body.content.length > 0) {
        return { exists: true, sha: body.sha, text: decodeBase64(body.content) }
      }
      if (body.encoding === 'base64' && body.content === '' && (body.size ?? 0) === 0) {
        return { exists: true, sha: body.sha, text: '' }
      }
      // Over 1 MB the Contents API answers with `encoding: "none"` and no content.
      // Follow the blob rather than reading that as an empty project.
      const blobResponse = await request(
        `${apiOrigin}/repos/${encodeURIComponent(checked.owner)}/${encodeURIComponent(checked.repo)}/git/blobs/${encodeURIComponent(body.sha)}`,
        { method: 'GET', headers: headers(checked.token), cache: 'no-store' },
      )
      if (!blobResponse.ok) throw await failureOf(blobResponse)
      const blob = await readJson(blobResponse)
      if (blob?.encoding !== 'base64' || typeof blob.content !== 'string') {
        throw new HostedError('malformed', 'That file is too large for WarpCad to read from GitHub')
      }
      return { exists: true, sha: body.sha, text: decodeBase64(blob.content) }
    },

    async write(connection, { text, sha, message }) {
      const checked = checkConnection(connection)
      if (typeof text !== 'string') throw new HostedError('invalid', 'There is nothing to write')
      const response = await request(contentsUrl(checked), {
        method: 'PUT',
        headers: headers(checked.token, { 'Content-Type': 'application/json' }),
        // No `branch`: the repository's default branch. See the module note.
        body: JSON.stringify({
          message,
          content: encodeBase64(text),
          // Omitted entirely when creating the file. Present and stale → 409, which
          // is the whole conflict mechanism: the API refuses, this client never forces.
          ...(sha === null || sha === undefined ? {} : { sha }),
        }),
      })
      if (!response.ok) throw await failureOf(response)
      const body = await readJson(response)
      const next = body?.content?.sha
      if (typeof next !== 'string') {
        throw new HostedError('malformed', "GitHub's answer could not be read")
      }
      return { sha: next }
    },
  }
}
