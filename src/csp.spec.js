// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — reads source files with node:fs; `src/` is typed for the browser (no @types/node).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `TODO/ai-004`, decision 8: the Content-Security-Policy is a `<meta http-equiv>` tag (GitHub
 * Pages cannot set headers). This pins its *shape*; `e2e/csp.e2e.js` proves the running app
 * violates none of it in each engine.
 */

const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
const meta = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/)

/** @param {string} policy */
function directives(policy) {
  return Object.fromEntries(
    policy
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...values]) => [name, values]),
  )
}

describe('index.html Content-Security-Policy', () => {
  it('is present as a meta tag', () => {
    expect(meta).not.toBeNull()
  })

  const policy = directives(meta?.[1] ?? '')

  it('limits connect-src to self, the Anthropic API, the GitHub API and the gist raw host — nothing else', () => {
    expect([...policy['connect-src']].sort()).toEqual(
      ["'self'", 'https://api.anthropic.com', 'https://api.github.com', 'https://gist.githubusercontent.com'].sort(),
    )
  })

  it('allows exactly the gist raw host for a truncated gist file (TODO/io-017), never a broad source', () => {
    // `docs/decisions/gist-storage.md`: a project file over about 1 MB comes back `truncated`,
    // and its full text is only on `gist.githubusercontent.com`.
    const connect = policy['connect-src']
    expect(connect).toContain('https://gist.githubusercontent.com')
    expect(connect).toContain('https://api.github.com')
    expect(connect).not.toContain('https:')
    expect(connect).not.toContain('*')
    expect(connect.filter((source) => source.includes('*'))).toEqual([])
    expect(connect.filter((source) => /githubusercontent/.test(source))).toEqual(['https://gist.githubusercontent.com'])
  })

  it('allows scripts from self only: no inline, no eval, no remote', () => {
    expect(policy['script-src']).toEqual(["'self'"])
  })

  it('has default-src self, no plugins, and a pinned base-uri', () => {
    expect(policy['default-src']).toEqual(["'self'"])
    expect(policy['object-src']).toEqual(["'none'"])
    expect(policy['base-uri']).toEqual(["'self'"])
  })

  it('blocks remote images (the exfiltration beacon) but keeps blob: and data: for textures and previews', () => {
    expect(policy['img-src']).toEqual(["'self'", 'blob:', 'data:'])
  })

  it('allows workers from self and blob: (evaluation, export and image workers)', () => {
    expect(policy['worker-src']).toEqual(["'self'", 'blob:'])
  })

  it('names no wildcard host anywhere', () => {
    expect(meta?.[1] ?? '').not.toMatch(/(^|\s)\*(\s|;|$)|https?:\/\/\*/)
  })
})
