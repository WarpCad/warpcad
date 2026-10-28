// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { GIST_ROUTE, gistLink, isGistId, isGistLink, parseGistHash } from './gistLink.js'
import { SHARE_HOST, isShareLink } from './shareLink.js'

/**
 * `TODO/io-017` Stage 1 — the short link. `gistLink.js` is the only place that builds or parses
 * `#/gist/<id>`, as `shareLink.js` is for `#/share/v1/…`. The id is a bearer capability for a
 * secret gist, so anything that is not exactly a GitHub gist id is refused, never guessed at.
 */

const ID32 = '0123456789abcdef0123456789abcdef'
const ID20 = 'aa5a315d61ae9438b18d'

describe('isGistId', () => {
  it('accepts lowercase hex of 20 to 32 characters, the two shapes GitHub issues', () => {
    expect(isGistId(ID32)).toBe(true)
    expect(isGistId(ID20)).toBe(true)
    expect(isGistId('a'.repeat(25))).toBe(true)
  })

  it.each([
    ['too short', 'a'.repeat(19)],
    ['too long', 'a'.repeat(33)],
    ['not hex', 'g'.repeat(32)],
    ['uppercase', ID32.toUpperCase()],
    ['mixed case', 'ABCDEF' + ID32.slice(6)],
    ['path traversal', '../../../etc/passwd'],
    ['traversal inside hex', `${ID20}/../x`],
    ['leading whitespace', ` ${ID32}`],
    ['trailing newline', `${ID32}\n`],
    ['inner space', `${ID20} ${ID20}`],
    ['query', `${ID32}?x=1`],
    ['extra segment', `${ID32}/raw`],
    ['percent-encoded', `${ID20}%2F`],
    ['empty', ''],
  ])('refuses %s', (_label, id) => {
    expect(isGistId(id)).toBe(false)
  })

  it('refuses non-strings', () => {
    for (const value of [undefined, null, 123, {}, [], ['a'.repeat(32)]]) expect(isGistId(value)).toBe(false)
  })
})

describe('gistLink', () => {
  it("builds the short link on io-016's canonical host, never location.origin", () => {
    expect(gistLink(ID32)).toBe(`${SHARE_HOST}/#/gist/${ID32}`)
    expect(gistLink(ID32)).toBe(`https://app.warpcad.com/#/gist/${ID32}`)
    expect(GIST_ROUTE).toBe('#/gist/')
  })

  it('takes a host override for tests', () => {
    expect(gistLink(ID20, { host: 'http://localhost:5173' })).toBe(`http://localhost:5173/#/gist/${ID20}`)
  })

  it('refuses to build a link from anything that is not a gist id — and does not echo it', () => {
    for (const bad of ['../x', `${ID32}/raw`, '', 'A'.repeat(32), `${ID32}?a`]) {
      expect(() => gistLink(bad)).toThrow()
    }
    try {
      gistLink('../secret-path-sentinel')
    } catch (error) {
      expect(String(/** @type {Error} */ (error).message)).not.toContain('secret-path-sentinel')
    }
  })
})

describe('parseGistHash', () => {
  it('round-trips gistLink, for a hash, a relative /#/ path and the full link', () => {
    for (const id of [ID32, ID20]) {
      const link = gistLink(id)
      expect(parseGistHash(link)).toBe(id)
      expect(parseGistHash(`#/gist/${id}`)).toBe(id)
      expect(parseGistHash(`/#/gist/${id}`)).toBe(id)
    }
  })

  it('tolerates one trailing slash and nothing else', () => {
    expect(parseGistHash(`#/gist/${ID32}/`)).toBe(ID32)
    expect(parseGistHash(`#/gist/${ID32}//`)).toBeNull()
  })

  it.each([
    ['bad id', '#/gist/not-a-gist-id'],
    ['short id', `#/gist/${'a'.repeat(19)}`],
    ['uppercase id', `#/gist/${ID32.toUpperCase()}`],
    ['traversal', '#/gist/../../share/v1/abc'],
    ['encoded traversal', `#/gist/${ID20}%2F..%2F`],
    ['extra segment', `#/gist/${ID32}/raw`],
    ['query after', `#/gist/${ID32}?x=1`],
    ['leading whitespace', ` #/gist/${ID32}`],
    ['trailing whitespace', `#/gist/${ID32} `],
    ['no id', '#/gist/'],
    ['missing slash', `#gist/${ID32}`],
    ['wrong case route', `#/Gist/${ID32}`],
    ['not a route', ID32],
  ])('refuses %s', (_label, text) => {
    expect(parseGistHash(text)).toBeNull()
  })

  it('refuses a full link on the wrong host, with a path, or with a query', () => {
    expect(parseGistHash(`https://evil.example/#/gist/${ID32}`)).toBeNull()
    expect(parseGistHash(`http://app.warpcad.com/#/gist/${ID32}`)).toBeNull()
    expect(parseGistHash(`https://app.warpcad.com.evil.example/#/gist/${ID32}`)).toBeNull()
    expect(parseGistHash(`https://app.warpcad.com/other/#/gist/${ID32}`)).toBeNull()
    expect(parseGistHash(`https://app.warpcad.com/?x=1#/gist/${ID32}`)).toBeNull()
    expect(parseGistHash(`https://user@app.warpcad.com/#/gist/${ID32}`)).toBeNull()
    expect(parseGistHash(`http://localhost:5173/#/gist/${ID32}`, { host: 'http://localhost:5173' })).toBe(ID32)
  })

  it('refuses non-strings without throwing', () => {
    for (const value of [undefined, null, 1, {}]) expect(parseGistHash(/** @type {any} */ (value))).toBeNull()
  })
})

describe('#/gist/, #/share/v1/ and #/help/ are never confused', () => {
  const gist = `#/gist/${ID32}`
  const share = '#/share/v1/pVNNb9swDP0rBM8CBLRDDx0KFFgPG3YYsGMhULSskNEHDEmOA6P'
  const help = '#/help/getting-started'

  it('a share link and a help link are not gist links', () => {
    expect(parseGistHash(share)).toBeNull()
    expect(parseGistHash(`${SHARE_HOST}/${share}`)).toBeNull()
    expect(parseGistHash(help)).toBeNull()
    expect(isGistLink(share)).toBe(false)
    expect(isGistLink(help)).toBe(false)
  })

  it('a gist link is not a share link', () => {
    expect(isShareLink(gist)).toBe(false)
    expect(isShareLink(gistLink(ID32))).toBe(false)
  })

  it('a gist route nested inside another route is not a gist link', () => {
    expect(parseGistHash(`#/help/x#/gist/${ID32}`)).toBeNull()
    expect(parseGistHash(`#/share/v1/#/gist/${ID32}`)).toBeNull()
  })
})

describe('isGistLink', () => {
  it('recognises the route even when the id is bad, so boot can show "this link looks incomplete"', () => {
    expect(isGistLink(`#/gist/${ID32}`)).toBe(true)
    expect(isGistLink('#/gist/')).toBe(true)
    expect(isGistLink('#/gist/zzz')).toBe(true)
    expect(isGistLink(`${SHARE_HOST}/#/gist/${ID20}`)).toBe(true)
    expect(isGistLink('#/gists')).toBe(false)
    expect(isGistLink('')).toBe(false)
    expect(isGistLink(/** @type {any} */ (null))).toBe(false)
  })
})
