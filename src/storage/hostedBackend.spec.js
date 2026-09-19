// @ts-nocheck — this spec drives a hand-written fake of `fetch`/`Response`. Typing the fake
// against the full DOM `Response` interface would be more code than the fake; the module under
// test is fully typed and checked by `npm run typecheck`.
import { describe, expect, it, vi } from 'vitest'

import {
  GITHUB_API_ORIGIN,
  HostedError,
  createHostedClient,
  decodeBase64,
  encodeBase64,
} from './hostedBackend.js'

/**
 * `TODO/io-002` — the hosted git backend's client, against a **completely faked**
 * host (`CLAUDE.md`: "always mock at the boundary… a unit test must never need a
 * real GPU context or a real network"). Nothing here may reach the network, and
 * the sentinel token below must never appear in a URL, a message, or a
 * serialised error — that is asserted, not assumed.
 */

/** A token shaped like a real fine-grained PAT, distinctive enough to grep an error for. */
const TOKEN = 'github_pat_SENTINELsentinel_0123456789'

const CONNECTION = { token: TOKEN, owner: 'octo', repo: 'parts', path: 'warpcad-project.ndjson' }

/**
 * @param {object} [init]
 * @param {number} [init.status]
 * @param {any} [init.body]
 * @param {Record<string, string>} [init.headers]
 */
function response({ status = 200, body = {}, headers = {} } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => lower[String(name).toLowerCase()] ?? null },
    async text() {
      return text
    },
    async json() {
      return JSON.parse(text)
    },
  }
}

/**
 * A fake `fetch` that answers from a queue of handlers keyed by URL substring.
 *
 * @param {Array<{ match: string, method?: string, answer: any }>} routes
 */
function fakeFetch(routes) {
  const calls = []
  const fetchImpl = vi.fn(async (url, init = {}) => {
    calls.push({ url: String(url), init })
    const method = (init.method ?? 'GET').toUpperCase()
    const route = routes.find(
      (candidate) =>
        String(url).includes(candidate.match) && (candidate.method ?? method).toUpperCase() === method,
    )
    if (!route) throw new Error(`unrouted request: ${method} ${url}`)
    if (typeof route.answer === 'function') return route.answer()
    return route.answer
  })
  fetchImpl.calls = calls
  return fetchImpl
}

/** The Contents API answers with base64 broken into 60-char lines, like the real one. */
function contentsBody(text, sha = 'sha-remote') {
  const wrapped = encodeBase64(text).replace(/(.{60})/g, '$1\n')
  return { type: 'file', encoding: 'base64', content: wrapped, sha, size: text.length }
}

describe('base64 for the Contents API', () => {
  it('round-trips a large multi-byte payload that naive btoa cannot encode', () => {
    // A real action log: multi-megabyte, and full of non-Latin-1 text (a part named in
    // Japanese, a µ in a dimension, an emoji in a note).
    const unit = '{"op":"primitive.cuboid","name":"ネジ穴 µ25 🔩","params":{"size":[10,10,10]}}\n'
    const text = unit.repeat(20000)
    expect(text.length).toBeGreaterThan(1_000_000)

    // The naive encoder this module exists to avoid: `String.fromCharCode(...bytes)`
    // blows the argument limit on a payload this size *and* `btoa` refuses non-Latin-1.
    expect(() => btoa(text)).toThrow()

    const encoded = encodeBase64(text)
    expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/)
    expect(decodeBase64(encoded)).toBe(text)
  })

  it('round-trips the empty string and tolerates the newlines GitHub wraps content in', () => {
    expect(decodeBase64(encodeBase64(''))).toBe('')
    const wrapped = encodeBase64('hello ✓ world').replace(/(.{4})/g, '$1\n')
    expect(decodeBase64(wrapped)).toBe('hello ✓ world')
  })
})

describe('origin allowlist', () => {
  it('refuses to build a client for any origin but the git host, before a request exists', () => {
    const fetchImpl = fakeFetch([])
    expect(() => createHostedClient({ fetch: fetchImpl, apiOrigin: 'https://evil.example.com' })).toThrow(
      /origin/i,
    )
    expect(() => createHostedClient({ fetch: fetchImpl, apiOrigin: 'http://api.github.com' })).toThrow()
    // Nothing was attempted: the refusal happens before any request is built.
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('defaults to the git host and sends the token only there, only as a header', async () => {
    const fetchImpl = fakeFetch([{ match: '/contents/', answer: response({ body: contentsBody('a\n') }) }])
    const client = createHostedClient({ fetch: fetchImpl })
    expect(client.apiOrigin).toBe(GITHUB_API_ORIGIN)

    await client.read(CONNECTION)
    const [call] = fetchImpl.calls
    expect(call.url.startsWith(`${GITHUB_API_ORIGIN}/repos/octo/parts/contents/`)).toBe(true)
    expect(call.url).not.toContain(TOKEN)
    expect(call.init.headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(JSON.stringify(call.init.body ?? '')).not.toContain(TOKEN)
  })

  it('refuses a connection whose fields could escape the path or inject a header', async () => {
    const client = createHostedClient({ fetch: fakeFetch([]) })
    const bad = [
      { ...CONNECTION, owner: 'octo/evil' },
      { ...CONNECTION, repo: '..' },
      { ...CONNECTION, path: '../../etc/passwd' },
      { ...CONNECTION, path: '/absolute.ndjson' },
      { ...CONNECTION, token: 'abc\r\nX-Injected: 1' },
      { ...CONNECTION, owner: '' },
    ]
    for (const connection of bad) {
      await expect(client.read(connection)).rejects.toBeInstanceOf(HostedError)
    }
  })
})

describe('read', () => {
  it('returns the file text and its blob sha', async () => {
    const fetchImpl = fakeFetch([
      { match: '/contents/', answer: response({ body: contentsBody('{"op":"x"}\n', 'abc123') }) },
    ])
    const client = createHostedClient({ fetch: fetchImpl })
    await expect(client.read(CONNECTION)).resolves.toEqual({
      exists: true,
      sha: 'abc123',
      text: '{"op":"x"}\n',
    })
  })

  it('treats a missing file in a reachable repo as "no project yet", not an error', async () => {
    const fetchImpl = fakeFetch([
      { match: '/contents/', answer: response({ status: 404, body: { message: 'Not Found' } }) },
      { match: '/repos/octo/parts', answer: response({ body: { full_name: 'octo/parts' } }) },
    ])
    const client = createHostedClient({ fetch: fetchImpl })
    await expect(client.read(CONNECTION)).resolves.toEqual({ exists: false, sha: null, text: null })
  })

  it('reports a repository that is missing or invisible to the token as not-found', async () => {
    const fetchImpl = fakeFetch([
      { match: '/contents/', answer: response({ status: 404, body: { message: 'Not Found' } }) },
      { match: '/repos/octo/parts', answer: response({ status: 404, body: { message: 'Not Found' } }) },
    ])
    const client = createHostedClient({ fetch: fetchImpl })
    const error = await client.read(CONNECTION).catch((caught) => caught)
    expect(error).toBeInstanceOf(HostedError)
    expect(error.kind).toBe('not-found')
    expect(error.message).toMatch(/not found/i)
  })

  it('falls back to the blob endpoint for a file too large for the contents endpoint', async () => {
    const big = 'ネジ\n'.repeat(400000)
    const fetchImpl = fakeFetch([
      {
        match: '/contents/',
        answer: response({ body: { type: 'file', encoding: 'none', content: '', sha: 'big1', size: 2e6 } }),
      },
      {
        match: '/git/blobs/big1',
        answer: response({ body: { encoding: 'base64', content: encodeBase64(big), sha: 'big1' } }),
      },
    ])
    const client = createHostedClient({ fetch: fetchImpl })
    // Silent truncation here would be the worst possible outcome: the next Save would
    // commit the truncated log over the real one.
    await expect(client.read(CONNECTION)).resolves.toEqual({ exists: true, sha: 'big1', text: big })
  })
})

describe('write', () => {
  it('commits with the last-known sha and returns the new one', async () => {
    const fetchImpl = fakeFetch([
      {
        match: '/contents/',
        method: 'PUT',
        answer: response({ body: { content: { sha: 'sha-new' }, commit: { sha: 'commit-1' } } }),
      },
    ])
    const client = createHostedClient({ fetch: fetchImpl })
    const result = await client.write(CONNECTION, {
      text: 'line\n',
      sha: 'sha-old',
      message: 'WarpCad: save',
    })
    expect(result).toEqual({ sha: 'sha-new' })

    const body = JSON.parse(fetchImpl.calls[0].init.body)
    expect(body.sha).toBe('sha-old')
    expect(body.message).toBe('WarpCad: save')
    expect(decodeBase64(body.content)).toBe('line\n')
    expect(body.branch).toBeUndefined() // the repository's default branch
  })

  it('omits sha entirely when creating the file for the first time', async () => {
    const fetchImpl = fakeFetch([
      { match: '/contents/', method: 'PUT', answer: response({ status: 201, body: { content: { sha: 's1' } } }) },
    ])
    const client = createHostedClient({ fetch: fetchImpl })
    await client.write(CONNECTION, { text: 'a\n', sha: null, message: 'WarpCad: save' })
    expect('sha' in JSON.parse(fetchImpl.calls[0].init.body)).toBe(false)
  })

  it('REFUSES a stale sha rather than forcing the write (409, and 422 for a missing sha)', async () => {
    for (const status of [409, 422]) {
      const fetchImpl = fakeFetch([
        {
          match: '/contents/',
          method: 'PUT',
          answer: response({ status, body: { message: 'is at 9ab3 but expected 1cd4' } }),
        },
      ])
      const client = createHostedClient({ fetch: fetchImpl })
      const error = await client
        .write(CONNECTION, { text: 'mine\n', sha: 'stale', message: 'WarpCad: save' })
        .catch((caught) => caught)
      expect(error).toBeInstanceOf(HostedError)
      expect(error.kind).toBe('conflict')
      // Exactly one request: no retry, no second forced attempt.
      expect(fetchImpl.calls).toHaveLength(1)
    }
  })

  it('leaves nothing partial behind when the network fails mid-write', async () => {
    const fetchImpl = fakeFetch([
      {
        match: '/contents/',
        method: 'PUT',
        answer: () => {
          throw new TypeError('Failed to fetch')
        },
      },
    ])
    const client = createHostedClient({ fetch: fetchImpl })
    const error = await client
      .write(CONNECTION, { text: 'mine\n', sha: 's1', message: 'WarpCad: save' })
      .catch((caught) => caught)
    expect(error).toBeInstanceOf(HostedError)
    expect(error.kind).toBe('offline')
    // The write is a single atomic PUT (git commits a whole blob or nothing), and it
    // is not retried here — the scheduler owns retry policy.
    expect(fetchImpl.calls).toHaveLength(1)
  })
})

describe('error normalisation', () => {
  /**
   * @param {{ status: number, body?: any, headers?: Record<string, string> }} answer
   */
  async function writeFailure(answer) {
    const fetchImpl = fakeFetch([{ match: '/contents/', method: 'PUT', answer: response(answer) }])
    const client = createHostedClient({ fetch: fetchImpl })
    return await client
      .write(CONNECTION, { text: 'a\n', sha: 's', message: 'WarpCad: save' })
      .catch((caught) => caught)
  }

  it('distinguishes a rejected token (401) from a missing scope and a rate limit (both 403)', async () => {
    const unauthorized = await writeFailure({ status: 401, body: { message: 'Bad credentials' } })
    expect(unauthorized.kind).toBe('unauthorized')
    expect(unauthorized.message).toMatch(/rejected this token/i)

    const scope = await writeFailure({
      status: 403,
      body: { message: 'Resource not accessible by personal access token' },
      headers: { 'x-ratelimit-remaining': '4999' },
    })
    expect(scope.kind).toBe('forbidden')
    expect(scope.message).toMatch(/permission/i)

    const limited = await writeFailure({
      status: 403,
      body: { message: 'API rate limit exceeded' },
      headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 180) },
    })
    expect(limited.kind).toBe('rate-limited')
    expect(limited.message).toMatch(/rate limited/i)
    expect(limited.retryAfterMs).toBeGreaterThan(60_000)

    const tooMany = await writeFailure({ status: 429, headers: { 'retry-after': '90' } })
    expect(tooMany.kind).toBe('rate-limited')
    expect(tooMany.retryAfterMs).toBe(90_000)
  })

  it('reports a server fault and an unreadable answer as their own kinds, never as success', async () => {
    expect((await writeFailure({ status: 502, body: 'bad gateway' })).kind).toBe('server')
    expect((await writeFailure({ status: 200, body: 'not json at all' })).kind).toBe('malformed')
  })

  it('never puts the token in a message, a URL, or a serialised error', async () => {
    const failures = [
      await writeFailure({ status: 401, body: { message: `Bad credentials for ${TOKEN}` } }),
      await writeFailure({ status: 403, body: { message: 'rate limit' }, headers: { 'x-ratelimit-remaining': '0' } }),
      await writeFailure({ status: 404, body: { message: 'Not Found' } }),
      await writeFailure({ status: 409, body: { message: 'conflict' } }),
      await writeFailure({ status: 500, body: { message: 'boom' } }),
      await writeFailure({ status: 200, body: 'garbage' }),
    ]
    for (const error of failures) {
      expect(error).toBeInstanceOf(HostedError)
      // The message, the detail, the stack and anything a caller might log or store.
      const serialised = `${error.message}|${error.stack ?? ''}|${JSON.stringify({
        ...error,
        message: error.message,
      })}`
      expect(serialised).not.toContain(TOKEN)
      expect(serialised).not.toContain('SENTINEL')
    }
  })
})
