// SPDX-License-Identifier: AGPL-3.0-or-later
import { randomBytes } from 'node:crypto'

/**
 * A **fake GitHub gist API** for Playwright (`TODO/io-017`): `https://api.github.com/{gists,user}`
 * and `https://gist.githubusercontent.com/*`, answered from memory by route interception. No real
 * network and no real token ever: the tokens a spec types are sentinels, and the fake accepts any
 * token that is in its `tokens` map, answering as the account named there.
 *
 * What it does, to the shape `docs/decisions/gist-storage.md` measured on the real API:
 *
 * - **Gists with revisions**: `POST /gists` (secret unless `public: true`), `PATCH /gists/<id>`
 *   (files merged, `null` removes one, a new revision each time), `DELETE` (204, then 404),
 *   `GET /gists/<id>` with **no token** (`history[0].version` is the revision).
 * - **The write probe**: `PATCH /gists/<32 zeros>` answers 404 with
 *   `x-accepted-github-permissions: gists=write` for a token that can write gists, and a classic
 *   token's `x-oauth-scopes`; 401 for a token it does not know.
 * - **`GET /user`**: the token's login.
 * - **Modes**: `rate-limited` (an unauthenticated read gets 403 with `x-ratelimit-remaining: 0`),
 *   and per-gist deletion. `truncateOver` (bytes) serves a bigger file `truncated: true` with only
 *   the start inline, the whole of it at its `raw_url` on `gist.githubusercontent.com`.
 * - **A repository**, for the one check that both GitHub credentials live side by side
 *   (`repo`): `GET /repos/<owner>/<repo>` is 200 and its contents 404 (no file yet).
 *
 * Everything that reaches it is recorded (`requests`, with the `Authorization` header) so a spec can
 * assert the token went nowhere else, and anything with another external origin is `escaped`.
 *
 * @module e2e/support/fakeGistApi
 */

const API = 'https://api.github.com'
const RAW_HOST = 'https://gist.githubusercontent.com'
const PROBE_ID = '0'.repeat(32)

/** @param {number} bytes */
const hex = (bytes) => randomBytes(bytes).toString('hex')

/**
 * @typedef {object} FakeGist
 * @property {string} id
 * @property {boolean} public
 * @property {string} description
 * @property {string} owner
 * @property {Record<string, string>} files
 * @property {string[]} revisions Newest first.
 * @property {string} updatedAt
 */

/**
 * @typedef {object} FakeToken
 * @property {string} login
 * @property {'fine-grained' | 'classic'} kind
 * @property {string} [scopes] A classic token's `x-oauth-scopes`.
 * @property {string} [expiry] `github-authentication-token-expiration`, e.g. `2026-11-27 14:05:00 UTC`.
 */

/**
 * A new, empty fake. Mutate its fields to make the host misbehave.
 *
 * @param {{ tokens?: Record<string, FakeToken>, repo?: { owner: string, repo: string } | null }} [options]
 */
export function fakeGitHub(options = {}) {
  return {
    /** @type {Map<string, FakeGist>} */
    gists: new Map(),
    /** @type {Record<string, FakeToken>} */
    tokens: options.tokens ?? {},
    /** @type {{ owner: string, repo: string } | null} */
    repo: options.repo ?? null,
    /** `ok`, or `rate-limited` for every unauthenticated gist read. */
    mode: /** @type {'ok' | 'rate-limited'} */ ('ok'),
    /** Files larger than this many bytes are served truncated, the rest at `raw_url`. */
    truncateOver: Number.POSITIVE_INFINITY,
    /** @type {Array<{ method: string, url: string, auth: string | undefined, body: any }>} */
    requests: [],
    /** @type {string[]} */
    escaped: [],
  }
}

/** @typedef {ReturnType<typeof fakeGitHub>} FakeGitHub */

/**
 * The gist's JSON, the way the API answers it.
 *
 * @param {FakeGitHub} fake
 * @param {FakeGist} gist
 */
function gistJson(fake, gist) {
  /** @type {Record<string, object>} */
  const files = {}
  for (const [name, content] of Object.entries(gist.files)) {
    const size = Buffer.byteLength(content, 'utf8')
    const truncated = size > fake.truncateOver
    files[name] = {
      filename: name,
      size,
      truncated,
      content: truncated ? content.slice(0, Math.floor(fake.truncateOver / 2)) : content,
      raw_url: `${RAW_HOST}/${gist.owner}/${gist.id}/raw/${gist.revisions[0]}/${name}`,
    }
  }
  return {
    id: gist.id,
    description: gist.description,
    public: gist.public,
    owner: { login: gist.owner },
    files,
    history: gist.revisions.map((version) => ({ version })),
    updated_at: gist.updatedAt,
  }
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers':
    'x-oauth-scopes, x-accepted-github-permissions, github-authentication-token-expiration, x-ratelimit-remaining, x-ratelimit-limit',
}

/**
 * @param {import('@playwright/test').Route} route
 * @param {number} status
 * @param {unknown} body
 * @param {Record<string, string>} [headers]
 */
function json(route, status, body, headers = {}) {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    headers: { ...CORS, ...headers },
    body: body === undefined ? '' : JSON.stringify(body),
  })
}

/**
 * Answer every request to the gist API, the raw host and (when set) the fake repository from
 * `fake`. Call on a page or on a whole context before navigating.
 *
 * @param {import('@playwright/test').Page | import('@playwright/test').BrowserContext} target
 * @param {FakeGitHub} fake
 */
export async function routeFakeGitHub(target, fake) {
  await target.route(`${API}/**`, async (route) => {
    const request = route.request()
    const method = request.method()
    if (method === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          ...CORS,
          'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE',
          'access-control-allow-headers': 'Authorization, Content-Type, Accept, X-GitHub-Api-Version',
        },
      })
      return
    }
    const url = new URL(request.url())
    const auth = request.headers().authorization
    /** @type {any} */
    let body = null
    try {
      body = request.postData() ? JSON.parse(/** @type {string} */ (request.postData())) : null
    } catch {
      body = null
    }
    fake.requests.push({ method, url: request.url(), auth, body })
    const token = auth?.replace(/^(Bearer|token) /i, '') ?? ''
    const account = token !== '' ? fake.tokens[token] : undefined
    const path = url.pathname

    if (auth !== undefined && account === undefined) {
      await json(route, 401, { message: 'Bad credentials' })
      return
    }

    if (path === '/user' && method === 'GET') {
      if (!account) return json(route, 401, { message: 'Requires authentication' })
      return json(route, 200, { login: account.login })
    }

    /** @type {Record<string, string>} */
    const tokenHeaders = account
      ? {
          ...(account.kind === 'classic' ? { 'x-oauth-scopes': account.scopes ?? 'gist' } : {}),
          ...(account.expiry ? { 'github-authentication-token-expiration': account.expiry } : {}),
        }
      : {}

    if (path === `/gists/${PROBE_ID}` && method === 'PATCH') {
      if (!account) return json(route, 401, { message: 'Requires authentication' })
      return json(route, 404, { message: 'Not Found' }, { ...tokenHeaders, 'x-accepted-github-permissions': 'gists=write' })
    }

    if (path === '/gists' && method === 'POST') {
      if (!account) return json(route, 401, { message: 'Requires authentication' })
      /** @type {Record<string, string>} */
      const files = {}
      for (const [name, file] of Object.entries(body?.files ?? {})) files[name] = /** @type {any} */ (file).content
      /** @type {FakeGist} */
      const gist = {
        id: hex(16),
        public: body?.public === true,
        description: body?.description ?? '',
        owner: account.login,
        files,
        revisions: [hex(20)],
        updatedAt: new Date().toISOString(),
      }
      fake.gists.set(gist.id, gist)
      return json(route, 201, gistJson(fake, gist), tokenHeaders)
    }

    const match = /^\/gists\/([0-9a-f]{20,32})$/.exec(path)
    if (match) {
      const gist = fake.gists.get(match[1])
      if (method === 'GET') {
        if (fake.mode === 'rate-limited' && !account) {
          return json(route, 403, { message: 'API rate limit exceeded for 127.0.0.1.' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-limit': '60' })
        }
        if (!gist) return json(route, 404, { message: 'Not Found' })
        return json(route, 200, gistJson(fake, gist), { 'x-ratelimit-limit': '60' })
      }
      if (!account) return json(route, 401, { message: 'Requires authentication' })
      if (!gist) return json(route, 404, { message: 'Not Found' })
      if (gist.owner !== account.login) return json(route, 404, { message: 'Not Found' })
      if (method === 'PATCH') {
        for (const [name, file] of Object.entries(body?.files ?? {})) {
          if (file === null) delete gist.files[name]
          else gist.files[name] = /** @type {any} */ (file).content
        }
        if (typeof body?.description === 'string') gist.description = body.description
        gist.revisions.unshift(hex(20))
        gist.updatedAt = new Date().toISOString()
        return json(route, 200, gistJson(fake, gist), tokenHeaders)
      }
      if (method === 'DELETE') {
        fake.gists.delete(gist.id)
        return route.fulfill({ status: 204, headers: CORS, body: '' })
      }
    }

    if (fake.repo !== null) {
      const repoPath = `/repos/${fake.repo.owner}/${fake.repo.repo}`
      if (path === repoPath && method === 'GET') return json(route, 200, { full_name: `${fake.repo.owner}/${fake.repo.repo}` })
      if (path.startsWith(`${repoPath}/contents/`) && method === 'GET') return json(route, 404, { message: 'Not Found' })
    }

    return json(route, 404, { message: 'Not Found' })
  })

  await target.route(`${RAW_HOST}/**`, async (route) => {
    const request = route.request()
    fake.requests.push({ method: request.method(), url: request.url(), auth: request.headers().authorization, body: null })
    // /<owner>/<id>/raw[/<revision>]/<file>
    const parts = new URL(request.url()).pathname.split('/').filter(Boolean)
    const gist = fake.gists.get(parts[1] ?? '')
    const name = parts.at(-1) ?? ''
    if (!gist || parts[2] !== 'raw' || !(name in gist.files)) {
      await route.fulfill({ status: 404, headers: CORS, body: '404: Not Found' })
      return
    }
    await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', headers: CORS, body: gist.files[name] })
  })
}

/**
 * Record anything that tried to leave for an external origin the fake does not answer.
 *
 * @param {import('@playwright/test').Page} page
 * @param {FakeGitHub} fake
 */
export function watchEscapes(page, fake) {
  page.on('request', (request) => {
    const url = request.url()
    if (url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:') || url.startsWith('data:') || url.startsWith('blob:')) return
    if (url.startsWith(`${API}/`) || url.startsWith(`${RAW_HOST}/`)) return
    fake.escaped.push(url)
  })
}

/**
 * The project file a fake gist holds (the single `*.ndjson`), or `null`.
 *
 * @param {FakeGist | undefined} gist
 */
export function projectFileOf(gist) {
  if (!gist) return null
  const name = Object.keys(gist.files).find((file) => file.endsWith('.ndjson'))
  return name === undefined ? null : { name, text: gist.files[name] }
}
