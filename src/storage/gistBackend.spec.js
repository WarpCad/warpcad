// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — this spec drives a hand-written fake of `fetch`/`Response` (as `hostedBackend.spec.js`
// does). The module under test is fully typed and checked by `npm run typecheck`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_DECOMPRESSED_BYTES } from '../core/shareLink.js'
import {
  GIST_RAW_HOST,
  GistError,
  PROBE_GIST_ID,
  createGist,
  deleteGist,
  readGist,
  updateGist,
  validateGistToken,
} from './gistBackend.js'
import { GITHUB_API_ORIGIN, HostedError, isTransient } from './hostedBackend.js'

/**
 * `TODO/io-017` Stage 1 — the gist client, against a **completely faked** GitHub. The behaviour
 * here is the measured behaviour in `docs/decisions/gist-storage.md` (real calls, 2026-10-28).
 * No test reaches the network, and the sentinel token must never appear anywhere but the
 * `Authorization` header of a request to `https://api.github.com`.
 */

const TOKEN = 'ghp_FAKEsentinelTOKEN0123456789abcdefABCD'
const ID = '0123456789abcdef0123456789abcdef'
const OTHER_ID = 'fedcba9876543210fedcba9876543210'
const REV1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const REV2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const PROJECT = '{"kind":"state","version":2}\n{"kind":"feature","type":"box"}\n'
const RAW_URL = `https://gist.githubusercontent.com/octo/${ID}/raw/${REV1}/phone-stand.ndjson`

/**
 * @param {object} [init]
 * @param {number} [init.status]
 * @param {any} [init.body]
 * @param {Record<string, string>} [init.headers]
 * @param {Uint8Array} [init.bytes] Raw body bytes (for `raw_url` answers).
 */
function response({ status = 200, body = {}, headers = {}, bytes } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const raw = bytes ?? new TextEncoder().encode(text)
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => lower[String(name).toLowerCase()] ?? null },
    async text() {
      return new TextDecoder().decode(raw)
    },
    async json() {
      return JSON.parse(new TextDecoder().decode(raw))
    },
    async arrayBuffer() {
      return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)
    },
  }
}

/**
 * A fake `fetch` answering from routes matched by method and exact URL (or a predicate).
 *
 * @param {Array<{ method?: string, url: string | ((url: string) => boolean), answer: any }>} routes
 */
function fakeFetch(routes) {
  const calls = []
  const fetchImpl = vi.fn(async (url, init = {}) => {
    const method = (init.method ?? 'GET').toUpperCase()
    calls.push({ url: String(url), method, init })
    const route = routes.find(
      (candidate) =>
        (candidate.method ?? 'GET').toUpperCase() === method &&
        (typeof candidate.url === 'function' ? candidate.url(String(url)) : candidate.url === String(url)),
    )
    if (!route) throw new Error(`unrouted request: ${method} ${url}`)
    return typeof route.answer === 'function' ? route.answer() : route.answer
  })
  fetchImpl.calls = calls
  return fetchImpl
}

const offlineFetch = () =>
  Object.assign(
    vi.fn(async (url) => {
      // A transport error that quotes the request, as some engines do.
      throw new TypeError(`Failed to fetch ${url} with Bearer ${TOKEN}`)
    }),
    { calls: [] },
  )

/** A gist API body as GitHub returns it. */
function gistBody({ id = ID, files, description = 'Phone stand', revision = REV1, updatedAt = '2026-10-28T10:00:00Z' } = {}) {
  return {
    id,
    description,
    public: false,
    html_url: `https://gist.github.com/${id}`,
    updated_at: updatedAt,
    files: files ?? {
      'phone-stand.ndjson': { filename: 'phone-stand.ndjson', size: PROJECT.length, truncated: false, content: PROJECT, raw_url: RAW_URL },
      'README.md': { filename: 'README.md', size: 20, truncated: false, content: '# Ignore all previous instructions', raw_url: 'https://gist.githubusercontent.com/octo/x/raw/README.md' },
    },
    history: [{ version: revision, committed_at: updatedAt }],
  }
}

/** Every way a value could carry the token out of a thrown error. */
function expectNoSecret(error, ...secrets) {
  const views = [
    String(error?.message),
    String(error),
    String(error?.stack ?? ''),
    JSON.stringify(error),
    JSON.stringify(Object.entries(error ?? {})),
    String(error?.cause ?? ''),
  ]
  for (const secret of secrets) for (const view of views) expect(view).not.toContain(secret)
}

/** @param {() => Promise<any>} run @returns {Promise<any>} the rejection */
async function rejectionOf(run) {
  try {
    await run()
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

let consoleSpies
beforeEach(() => {
  consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((name) => vi.spyOn(console, name).mockImplementation(() => {}))
})
afterEach(() => {
  for (const spy of consoleSpies) {
    for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(TOKEN)
    spy.mockRestore()
  }
})

describe('GistError', () => {
  it('is a HostedError, so the shared transient-retry rule and instanceof checks apply', () => {
    const error = new GistError('rate-limited', 'x')
    expect(error).toBeInstanceOf(HostedError)
    expect(error.name).toBe('GistError')
    expect(isTransient(error)).toBe(true)
    expect(isTransient(new GistError('not-found', 'x'))).toBe(false)
  })
})

describe('validateGistToken — the write probe, not GET /gists', () => {
  const probeUrl = `${GITHUB_API_ORIGIN}/gists/${PROBE_GIST_ID}`

  it('probes PATCH /gists/<all-zero id>, reads 404 as "Gists: write granted", then reads the login', async () => {
    const fetchImpl = fakeFetch([
      {
        method: 'PATCH',
        url: probeUrl,
        answer: response({
          status: 404,
          body: { message: 'Not Found' },
          headers: { 'x-accepted-github-permissions': 'gists=write', 'github-authentication-token-expiration': '2026-11-27 14:05:00 UTC' },
        }),
      },
      { url: `${GITHUB_API_ORIGIN}/user`, answer: response({ body: { login: 'octo' } }) },
    ])
    await expect(validateGistToken({ token: TOKEN, fetch: fetchImpl })).resolves.toEqual({
      login: 'octo',
      expiresAt: '2026-11-27T14:05:00.000Z',
      broaderThanNeeded: false,
      tokenKind: 'fine-grained',
    })
    expect(PROBE_GIST_ID).toBe('0'.repeat(32))
    const [probe, user] = fetchImpl.calls
    expect(probe.method).toBe('PATCH')
    expect(JSON.parse(probe.init.body)).toEqual({ description: 'x' })
    expect(probe.init.headers).toMatchObject({
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    })
    expect(user.method).toBe('GET')
    expect(fetchImpl.calls.some((call) => call.url.includes('per_page'))).toBe(false)
    expect(fetchImpl.calls.every((call) => !call.url.includes(TOKEN))).toBe(true)
  })

  it('accepts a classic gist-only token without the "broader" warning', async () => {
    const fetchImpl = fakeFetch([
      { method: 'PATCH', url: probeUrl, answer: response({ status: 404, headers: { 'X-OAuth-Scopes': 'gist' } }) },
      { url: `${GITHUB_API_ORIGIN}/user`, answer: response({ body: { login: 'octo' } }) },
    ])
    const result = await validateGistToken({ token: TOKEN, fetch: fetchImpl })
    expect(result).toMatchObject({ login: 'octo', broaderThanNeeded: false, tokenKind: 'classic', expiresAt: null })
  })

  it('flags a classic token with more than the gist scope, without carrying the header value', async () => {
    const fetchImpl = fakeFetch([
      { method: 'PATCH', url: probeUrl, answer: response({ status: 404, headers: { 'X-OAuth-Scopes': 'gist, repo, admin:org_hook, workflow' } }) },
      { url: `${GITHUB_API_ORIGIN}/user`, answer: response({ body: { login: 'octo' } }) },
    ])
    const result = await validateGistToken({ token: TOKEN, fetch: fetchImpl })
    expect(result.broaderThanNeeded).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/repo|workflow|admin/)
  })

  it('refuses a classic token whose scopes do not include gist, even when the probe 404s', async () => {
    for (const scopes of ['repo', '', 'gists, user']) {
      const fetchImpl = fakeFetch([
        { method: 'PATCH', url: probeUrl, answer: response({ status: 404, headers: { 'X-OAuth-Scopes': scopes } }) },
        { url: `${GITHUB_API_ORIGIN}/user`, answer: response({ body: { login: 'octo' } }) },
      ])
      const error = await rejectionOf(() => validateGistToken({ token: TOKEN, fetch: fetchImpl }))
      expect(error).toBeInstanceOf(GistError)
      expect(error.kind).toBe('forbidden')
    }
  })

  it('reads 403 on the probe as "token lacks the Gists permission"', async () => {
    const fetchImpl = fakeFetch([{ method: 'PATCH', url: probeUrl, answer: response({ status: 403, body: { message: 'Resource not accessible by personal access token' } }) }])
    const error = await rejectionOf(() => validateGistToken({ token: TOKEN, fetch: fetchImpl }))
    expect(error.kind).toBe('forbidden')
    expect(error.message).toMatch(/lacks the Gists permission/)
    expect(error.message).not.toMatch(/Resource not accessible/)
    expect(fetchImpl.calls).toHaveLength(1)
  })

  it('reads 401 as rejected or expired', async () => {
    const fetchImpl = fakeFetch([{ method: 'PATCH', url: probeUrl, answer: response({ status: 401, body: { message: 'Bad credentials' } }) }])
    const error = await rejectionOf(() => validateGistToken({ token: TOKEN, fetch: fetchImpl }))
    expect(error.kind).toBe('unauthorized')
    expect(error.message).not.toMatch(/Bad credentials/)
  })

  it('reads a 403 with no requests left as rate-limited, not as a missing permission', async () => {
    const fetchImpl = fakeFetch([{ method: 'PATCH', url: probeUrl, answer: response({ status: 403, headers: { 'x-ratelimit-remaining': '0' } }) }])
    expect((await rejectionOf(() => validateGistToken({ token: TOKEN, fetch: fetchImpl }))).kind).toBe('rate-limited')
  })

  it('fails when the login cannot be read', async () => {
    const unauthorized = fakeFetch([
      { method: 'PATCH', url: probeUrl, answer: response({ status: 404 }) },
      { url: `${GITHUB_API_ORIGIN}/user`, answer: response({ status: 401 }) },
    ])
    expect((await rejectionOf(() => validateGistToken({ token: TOKEN, fetch: unauthorized }))).kind).toBe('unauthorized')
    const garbage = fakeFetch([
      { method: 'PATCH', url: probeUrl, answer: response({ status: 404 }) },
      { url: `${GITHUB_API_ORIGIN}/user`, answer: response({ body: { login: '<script>' } }) },
    ])
    expect((await rejectionOf(() => validateGistToken({ token: TOKEN, fetch: garbage }))).kind).toBe('malformed')
  })

  it('returns no expiry for a missing or unreadable expiry header', async () => {
    for (const headers of [{}, { 'github-authentication-token-expiration': 'whenever' }]) {
      const fetchImpl = fakeFetch([
        { method: 'PATCH', url: probeUrl, answer: response({ status: 404, headers }) },
        { url: `${GITHUB_API_ORIGIN}/user`, answer: response({ body: { login: 'octo' } }) },
      ])
      expect((await validateGistToken({ token: TOKEN, fetch: fetchImpl })).expiresAt).toBeNull()
    }
  })

  it('refuses a malformed token before any request (empty, whitespace, CR/LF header injection)', async () => {
    for (const token of ['', '   ', `${TOKEN}\r\nX-Evil: 1`, 'two words', undefined, 42]) {
      const fetchImpl = fakeFetch([])
      const error = await rejectionOf(() => validateGistToken({ token, fetch: fetchImpl }))
      expect(error.kind).toBe('invalid')
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })
})

describe('createGist', () => {
  const files = { 'phone-stand.ndjson': PROJECT, 'README.md': '# Phone stand\n' }
  const created = (id = ID) =>
    response({
      status: 201,
      body: gistBody({
        id,
        files: {
          'phone-stand.ndjson': { raw_url: `https://gist.githubusercontent.com/octo/${id}/raw/${REV1}/phone-stand.ndjson` },
          'README.md': { raw_url: `https://gist.githubusercontent.com/octo/${id}/raw/${REV1}/README.md` },
        },
      }),
    })

  it('POSTs a secret gist by default and returns the id, revision and url', async () => {
    const fetchImpl = fakeFetch([{ method: 'POST', url: `${GITHUB_API_ORIGIN}/gists`, answer: created() }])
    const result = await createGist({ token: TOKEN, files, description: 'Phone stand', fetch: fetchImpl })
    expect(result).toEqual({
      id: ID,
      revision: REV1,
      url: `https://gist.github.com/${ID}`,
      rawUrls: {
        'phone-stand.ndjson': `https://gist.githubusercontent.com/octo/${ID}/raw/${REV1}/phone-stand.ndjson`,
        'README.md': `https://gist.githubusercontent.com/octo/${ID}/raw/${REV1}/README.md`,
      },
    })
    const [call] = fetchImpl.calls
    expect(JSON.parse(call.init.body)).toEqual({
      description: 'Phone stand',
      public: false,
      files: { 'phone-stand.ndjson': { content: PROJECT }, 'README.md': { content: '# Phone stand\n' } },
    })
    expect(call.init.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(call.init.headers['Content-Type']).toBe('application/json')
  })

  it('makes a public gist only when public is exactly true', async () => {
    for (const [flag, expected] of [[true, true], ['yes', false], [1, false], [undefined, false], [false, false]]) {
      const fetchImpl = fakeFetch([{ method: 'POST', url: `${GITHUB_API_ORIGIN}/gists`, answer: created() }])
      await createGist({ token: TOKEN, files, description: '', public: flag, fetch: fetchImpl })
      expect(JSON.parse(fetchImpl.calls[0].init.body).public).toBe(expected)
    }
  })

  it('does not trust the html_url or an id that is not a gist id', async () => {
    const lying = response({ status: 201, body: { ...gistBody(), html_url: 'https://evil.example/' } })
    const fetchImpl = fakeFetch([{ method: 'POST', url: `${GITHUB_API_ORIGIN}/gists`, answer: lying }])
    expect((await createGist({ token: TOKEN, files, description: '', fetch: fetchImpl })).url).toBe(`https://gist.github.com/${ID}`)

    const badId = fakeFetch([{ method: 'POST', url: `${GITHUB_API_ORIGIN}/gists`, answer: response({ status: 201, body: gistBody({ id: '../x' }) }) }])
    expect((await rejectionOf(() => createGist({ token: TOKEN, files, description: '', fetch: badId }))).kind).toBe('malformed')

    const noRevision = fakeFetch([{ method: 'POST', url: `${GITHUB_API_ORIGIN}/gists`, answer: response({ status: 201, body: { ...gistBody(), history: [] } }) }])
    expect((await rejectionOf(() => createGist({ token: TOKEN, files, description: '', fetch: noRevision }))).kind).toBe('malformed')
  })

  it('refuses bad files before any request', async () => {
    for (const bad of [{}, null, { 'a/b.ndjson': PROJECT }, { '../x.ndjson': PROJECT }, { 'a.ndjson': '' }, { 'a.ndjson': 3 }, { '': PROJECT }, { 'a\nb.ndjson': PROJECT }]) {
      const fetchImpl = fakeFetch([])
      expect((await rejectionOf(() => createGist({ token: TOKEN, files: bad, description: '', fetch: fetchImpl }))).kind).toBe('invalid')
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it.each([
    [401, {}, 'unauthorized'],
    [403, {}, 'forbidden'],
    [403, { 'x-ratelimit-remaining': '0' }, 'rate-limited'],
    [429, {}, 'rate-limited'],
    [422, {}, 'invalid'],
    [500, {}, 'server'],
    [502, {}, 'server'],
  ])('maps a %i to %s', async (status, headers, kind) => {
    const fetchImpl = fakeFetch([{ method: 'POST', url: `${GITHUB_API_ORIGIN}/gists`, answer: response({ status, headers, body: { message: `nope ${TOKEN}` } }) }])
    const error = await rejectionOf(() => createGist({ token: TOKEN, files, description: '', fetch: fetchImpl }))
    expect(error).toBeInstanceOf(GistError)
    expect(error.kind).toBe(kind)
    expectNoSecret(error, TOKEN, 'nope')
  })
})

describe('updateGist', () => {
  it('PATCHes the same id and returns the new revision', async () => {
    const fetchImpl = fakeFetch([
      { method: 'PATCH', url: `${GITHUB_API_ORIGIN}/gists/${ID}`, answer: response({ body: gistBody({ revision: REV2 }) }) },
    ])
    const result = await updateGist({ token: TOKEN, id: ID, files: { 'phone-stand.ndjson': PROJECT, 'old-name.ndjson': null }, description: 'Phone stand', fetch: fetchImpl })
    expect(result).toMatchObject({ id: ID, revision: REV2, url: `https://gist.github.com/${ID}` })
    expect(JSON.parse(fetchImpl.calls[0].init.body)).toEqual({
      description: 'Phone stand',
      files: { 'phone-stand.ndjson': { content: PROJECT }, 'old-name.ndjson': null },
    })
  })

  it('never sends a public flag on update (GitHub cannot convert a secret gist)', async () => {
    const fetchImpl = fakeFetch([{ method: 'PATCH', url: `${GITHUB_API_ORIGIN}/gists/${ID}`, answer: response({ body: gistBody() }) }])
    await updateGist({ token: TOKEN, id: ID, files: { 'a.ndjson': PROJECT }, description: '', fetch: fetchImpl })
    expect(JSON.parse(fetchImpl.calls[0].init.body)).not.toHaveProperty('public')
  })

  it('refuses an id that is not a gist id before building a URL', async () => {
    for (const id of ['../../user/repos', `${ID}/star`, `${ID}?x`, '', ID.toUpperCase()]) {
      const fetchImpl = fakeFetch([])
      const error = await rejectionOf(() => updateGist({ token: TOKEN, id, files: { 'a.ndjson': PROJECT }, description: '', fetch: fetchImpl }))
      expect(error.kind).toBe('invalid')
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('maps a 404 to not-found (the gist was deleted)', async () => {
    const fetchImpl = fakeFetch([{ method: 'PATCH', url: `${GITHUB_API_ORIGIN}/gists/${ID}`, answer: response({ status: 404 }) }])
    expect((await rejectionOf(() => updateGist({ token: TOKEN, id: ID, files: { 'a.ndjson': PROJECT }, description: '', fetch: fetchImpl }))).kind).toBe('not-found')
  })

  it('reports a response for a different gist as malformed', async () => {
    const fetchImpl = fakeFetch([{ method: 'PATCH', url: `${GITHUB_API_ORIGIN}/gists/${ID}`, answer: response({ body: gistBody({ id: OTHER_ID }) }) }])
    expect((await rejectionOf(() => updateGist({ token: TOKEN, id: ID, files: { 'a.ndjson': PROJECT }, description: '', fetch: fetchImpl }))).kind).toBe('malformed')
  })
})

describe('deleteGist', () => {
  it('DELETEs and resolves on 204', async () => {
    const fetchImpl = fakeFetch([{ method: 'DELETE', url: `${GITHUB_API_ORIGIN}/gists/${ID}`, answer: response({ status: 204, body: '' }) }])
    await expect(deleteGist({ token: TOKEN, id: ID, fetch: fetchImpl })).resolves.toBeUndefined()
    expect(fetchImpl.calls[0].init.headers.Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('maps 404 to not-found and refuses a bad id before any request', async () => {
    const gone = fakeFetch([{ method: 'DELETE', url: `${GITHUB_API_ORIGIN}/gists/${ID}`, answer: response({ status: 404 }) }])
    expect((await rejectionOf(() => deleteGist({ token: TOKEN, id: ID, fetch: gone }))).kind).toBe('not-found')
    const none = fakeFetch([])
    expect((await rejectionOf(() => deleteGist({ token: TOKEN, id: '..', fetch: none }))).kind).toBe('invalid')
    expect(none).not.toHaveBeenCalled()
  })
})

describe('readGist — no token, one fixed file rule, capped', () => {
  const gistUrl = `${GITHUB_API_ORIGIN}/gists/${ID}`

  it('reads unauthenticated and returns the single .ndjson file, ignoring the README', async () => {
    const fetchImpl = fakeFetch([{ url: gistUrl, answer: response({ body: gistBody() }) }])
    const result = await readGist({ id: ID, fetch: fetchImpl })
    expect(result).toEqual({
      id: ID,
      description: 'Phone stand',
      text: PROJECT,
      revision: REV1,
      updatedAt: '2026-10-28T10:00:00Z',
      fileName: 'phone-stand.ndjson',
    })
    const [call] = fetchImpl.calls
    expect(call.method).toBe('GET')
    expect(call.init.headers).not.toHaveProperty('Authorization')
    expect(JSON.stringify(call.init)).not.toMatch(/Bearer/)
    expect(call.init.credentials).toBe('omit')
    expect(JSON.stringify(result)).not.toContain('Ignore all previous instructions')
  })

  it('takes project.ndjson when there are several .ndjson files', async () => {
    const files = {
      'a.ndjson': { size: 3, truncated: false, content: 'AAA' },
      'project.ndjson': { size: PROJECT.length, truncated: false, content: PROJECT },
      'README.md': { size: 1, truncated: false, content: '#' },
    }
    const fetchImpl = fakeFetch([{ url: gistUrl, answer: response({ body: gistBody({ files }) }) }])
    expect(await readGist({ id: ID, fetch: fetchImpl })).toMatchObject({ text: PROJECT, fileName: 'project.ndjson' })
  })

  it.each([
    ['an empty gist', {}, 'empty'],
    ['a gist with only a README', { 'README.md': { size: 1, truncated: false, content: '#' } }, 'no-project-file'],
    ['a gist with no .ndjson file', { 'notes.txt': { size: 1, truncated: false, content: 'x' }, 'project.json': { size: 2, truncated: false, content: '{}' } }, 'no-project-file'],
    ['two .ndjson files and no project.ndjson', { 'a.ndjson': { size: 1, truncated: false, content: 'a' }, 'b.ndjson': { size: 1, truncated: false, content: 'b' } }, 'ambiguous'],
  ])('refuses %s with its own kind', async (_label, files, kind) => {
    const fetchImpl = fakeFetch([{ url: gistUrl, answer: response({ body: gistBody({ files }) }) }])
    const error = await rejectionOf(() => readGist({ id: ID, fetch: fetchImpl }))
    expect(error).toBeInstanceOf(GistError)
    expect(error.kind).toBe(kind)
  })

  it('follows raw_url for a truncated file, unauthenticated, only on gist.githubusercontent.com', async () => {
    const big = PROJECT + 'x'.repeat(1_500_000)
    const files = { 'big.ndjson': { size: big.length, truncated: true, content: big.slice(0, 900_000), raw_url: RAW_URL } }
    const fetchImpl = fakeFetch([
      { url: gistUrl, answer: response({ body: gistBody({ files }) }) },
      { url: RAW_URL, answer: response({ body: big }) },
    ])
    const result = await readGist({ id: ID, fetch: fetchImpl })
    expect(result.text).toBe(big)
    expect(GIST_RAW_HOST).toBe('gist.githubusercontent.com')
    const rawCall = fetchImpl.calls[1]
    expect(rawCall.url).toBe(RAW_URL)
    expect(JSON.stringify(rawCall.init)).not.toMatch(/Bearer|Authorization/)
    expect(rawCall.init.credentials).toBe('omit')
  })

  it.each([
    'http://gist.githubusercontent.com/octo/x/raw/a.ndjson',
    'https://evil.example/octo/x/raw/a.ndjson',
    'https://gist.githubusercontent.com.evil.example/a.ndjson',
    'https://gist.githubusercontent.com@evil.example/a.ndjson',
    'https://user:pass@gist.githubusercontent.com/a.ndjson',
    'https://gist.githubusercontent.com:8443/a.ndjson',
    'javascript:alert(1)',
    '/relative/raw',
    undefined,
  ])('refuses to follow a raw_url of %j', async (rawUrl) => {
    const files = { 'big.ndjson': { size: 2_000_000, truncated: true, content: 'x', raw_url: rawUrl } }
    const fetchImpl = fakeFetch([{ url: gistUrl, answer: response({ body: gistBody({ files }) }) }])
    const error = await rejectionOf(() => readGist({ id: ID, fetch: fetchImpl }))
    expect(error.kind).toBe('untrusted-host')
    expect(fetchImpl.calls).toHaveLength(1)
  })

  it("refuses a file over io-016's decompressed cap by its reported size, before fetching it", async () => {
    const files = { 'big.ndjson': { size: MAX_DECOMPRESSED_BYTES + 1, truncated: true, content: 'x', raw_url: RAW_URL } }
    const fetchImpl = fakeFetch([{ url: gistUrl, answer: response({ body: gistBody({ files }) }) }])
    expect((await rejectionOf(() => readGist({ id: ID, fetch: fetchImpl }))).kind).toBe('too-large')
    expect(fetchImpl.calls).toHaveLength(1)
  })

  it('checks the cap again on the bytes actually received, whatever size was reported', async () => {
    const huge = 'y'.repeat(MAX_DECOMPRESSED_BYTES + 1)
    const lyingRaw = { 'big.ndjson': { size: 10, truncated: true, content: 'x', raw_url: RAW_URL } }
    const rawFetch = fakeFetch([
      { url: gistUrl, answer: response({ body: gistBody({ files: lyingRaw }) }) },
      { url: RAW_URL, answer: response({ body: huge }) },
    ])
    expect((await rejectionOf(() => readGist({ id: ID, fetch: rawFetch }))).kind).toBe('too-large')

    const lyingInline = { 'big.ndjson': { size: 10, truncated: false, content: huge } }
    const inlineFetch = fakeFetch([{ url: gistUrl, answer: response({ body: gistBody({ files: lyingInline }) }) }])
    expect((await rejectionOf(() => readGist({ id: ID, fetch: inlineFetch }))).kind).toBe('too-large')
  })

  it('counts the cap in bytes, not characters', async () => {
    const multiByte = '€'.repeat(Math.floor(MAX_DECOMPRESSED_BYTES / 3) + 1) // 3 bytes each, fewer chars than the cap
    const files = { 'a.ndjson': { size: 10, truncated: false, content: multiByte } }
    const fetchImpl = fakeFetch([{ url: gistUrl, answer: response({ body: gistBody({ files }) }) }])
    expect((await rejectionOf(() => readGist({ id: ID, fetch: fetchImpl }))).kind).toBe('too-large')
  })

  it('refuses raw bytes that are not UTF-8', async () => {
    const files = { 'big.ndjson': { size: 4, truncated: true, content: '', raw_url: RAW_URL } }
    const fetchImpl = fakeFetch([
      { url: gistUrl, answer: response({ body: gistBody({ files }) }) },
      { url: RAW_URL, answer: response({ bytes: new Uint8Array([0xff, 0xfe, 0xfd, 0x80]) }) },
    ])
    expect((await rejectionOf(() => readGist({ id: ID, fetch: fetchImpl }))).kind).toBe('malformed')
  })

  it.each([
    [404, {}, 'not-found'],
    [403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '9999999999' }, 'rate-limited'],
    [429, {}, 'rate-limited'],
    [500, {}, 'server'],
    [503, {}, 'server'],
  ])('maps a %i read to %s, never quoting the server', async (status, headers, kind) => {
    const fetchImpl = fakeFetch([{ url: gistUrl, answer: response({ status, headers, body: { message: 'API rate limit exceeded for 203.0.113.9' } }) }])
    const error = await rejectionOf(() => readGist({ id: ID, fetch: fetchImpl }))
    expect(error.kind).toBe(kind)
    expect(error.message).not.toMatch(/203\.0\.113|API rate limit exceeded/)
    expectNoSecret(error, ID)
  })

  it('maps a failed raw fetch through the same rules', async () => {
    const files = { 'big.ndjson': { size: 2_000_000, truncated: true, content: 'x', raw_url: RAW_URL } }
    const fetchImpl = fakeFetch([
      { url: gistUrl, answer: response({ body: gistBody({ files }) }) },
      { url: RAW_URL, answer: response({ status: 404 }) },
    ])
    expect((await rejectionOf(() => readGist({ id: ID, fetch: fetchImpl }))).kind).toBe('not-found')
  })

  it('maps a transport failure to offline', async () => {
    const error = await rejectionOf(() => readGist({ id: ID, fetch: offlineFetch() }))
    expect(error.kind).toBe('offline')
    expectNoSecret(error, ID, 'Failed to fetch')
  })

  it('refuses unreadable JSON, a body for another gist, and a non-object file entry as malformed', async () => {
    for (const answer of [
      response({ body: 'not json' }),
      response({ body: gistBody({ id: OTHER_ID }) }),
      response({ body: { ...gistBody(), files: [] } }),
      response({ body: gistBody({ files: { 'a.ndjson': 'string' } }) }),
      response({ body: gistBody({ files: { 'a.ndjson': { size: 1, truncated: false } } }) }),
    ]) {
      const fetchImpl = fakeFetch([{ url: gistUrl, answer }])
      expect((await rejectionOf(() => readGist({ id: ID, fetch: fetchImpl }))).kind).toBe('malformed')
    }
  })

  it('returns an empty description and a null revision when GitHub omits them', async () => {
    const body = { ...gistBody(), description: null, history: undefined }
    const fetchImpl = fakeFetch([{ url: gistUrl, answer: response({ body }) }])
    expect(await readGist({ id: ID, fetch: fetchImpl })).toMatchObject({ description: '', revision: null })
  })

  it('refuses a bad id before any request', async () => {
    for (const id of ['../user', `${ID}#x`, ` ${ID}`, null]) {
      const fetchImpl = fakeFetch([])
      expect((await rejectionOf(() => readGist({ id, fetch: fetchImpl }))).kind).toBe('invalid')
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })
})

describe('the token never leaves the Authorization header — every failure path', () => {
  /** Every authenticated operation, each against each failing answer. */
  const operations = {
    validate: (fetchImpl) => validateGistToken({ token: TOKEN, fetch: fetchImpl }),
    create: (fetchImpl) => createGist({ token: TOKEN, files: { 'a.ndjson': PROJECT }, description: '', fetch: fetchImpl }),
    update: (fetchImpl) => updateGist({ token: TOKEN, id: ID, files: { 'a.ndjson': PROJECT }, description: '', fetch: fetchImpl }),
    remove: (fetchImpl) => deleteGist({ token: TOKEN, id: ID, fetch: fetchImpl }),
  }
  const quoting = { message: `Bad credentials for ${TOKEN}`, token: TOKEN, documentation_url: `https://docs.github.com/?t=${TOKEN}` }
  const failures = {
    401: () => response({ status: 401, body: quoting }),
    403: () => response({ status: 403, body: quoting }),
    'rate-limit': () => response({ status: 403, body: quoting, headers: { 'x-ratelimit-remaining': '0' } }),
    404: () => response({ status: 404, body: quoting }),
    409: () => response({ status: 409, body: quoting }),
    422: () => response({ status: 422, body: quoting }),
    500: () => response({ status: 500, body: quoting }),
    'unreadable-success': () => response({ status: 200, body: `{"broken ${TOKEN}` }),
    'success-quoting-token': () => response({ status: 201, body: { id: TOKEN, files: { [TOKEN]: {} }, history: [{ version: TOKEN }] } }),
  }

  for (const [name, run] of Object.entries(operations)) {
    for (const [label, answer] of Object.entries(failures)) {
      it(`${name}: ${label}`, async () => {
        // For validate, a 404 on the probe is success; route /user to the failure too.
        const fetchImpl = fakeFetch([{ method: 'PATCH', url: () => true, answer }, { method: 'POST', url: () => true, answer }, { method: 'DELETE', url: () => true, answer }, { method: 'GET', url: () => true, answer }])
        let error = null
        try {
          await run(fetchImpl)
        } catch (caught) {
          error = caught
        }
        if (error !== null) {
          expect(error).toBeInstanceOf(GistError)
          expectNoSecret(error, TOKEN, 'Bad credentials')
        }
        for (const call of fetchImpl.calls) {
          expect(call.url).not.toContain(TOKEN)
          expect(call.url.startsWith(`${GITHUB_API_ORIGIN}/`)).toBe(true)
          const { Authorization, ...rest } = call.init.headers ?? {}
          expect(Authorization).toBe(`Bearer ${TOKEN}`)
          expect(JSON.stringify(rest)).not.toContain(TOKEN)
          expect(String(call.init.body ?? '')).not.toContain(TOKEN)
        }
      })
    }

    it(`${name}: offline, with a transport error that quotes the token`, async () => {
      const error = await rejectionOf(() => run(offlineFetch()))
      expect(error).toBeInstanceOf(GistError)
      expect(error.kind).toBe('offline')
      expectNoSecret(error, TOKEN, 'Failed to fetch')
    })
  }

  it('success results carry no token either', async () => {
    const fetchImpl = fakeFetch([
      { method: 'PATCH', url: `${GITHUB_API_ORIGIN}/gists/${PROBE_GIST_ID}`, answer: response({ status: 404 }) },
      { url: `${GITHUB_API_ORIGIN}/user`, answer: response({ body: { login: 'octo' } }) },
      { method: 'POST', url: `${GITHUB_API_ORIGIN}/gists`, answer: response({ status: 201, body: gistBody() }) },
    ])
    expect(JSON.stringify(await validateGistToken({ token: TOKEN, fetch: fetchImpl }))).not.toContain(TOKEN)
    expect(JSON.stringify(await createGist({ token: TOKEN, files: { 'a.ndjson': PROJECT }, description: '', fetch: fetchImpl }))).not.toContain(TOKEN)
  })

  it('error messages never carry the gist id either (it is a bearer capability)', async () => {
    for (const status of [401, 403, 404, 409, 422, 500]) {
      const fetchImpl = fakeFetch([{ method: 'PATCH', url: () => true, answer: response({ status, body: { message: ID } }) }])
      const error = await rejectionOf(() => updateGist({ token: TOKEN, id: ID, files: { 'a.ndjson': PROJECT }, description: '', fetch: fetchImpl }))
      expectNoSecret(error, ID)
    }
  })
})
