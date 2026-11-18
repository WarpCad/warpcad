// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { resolveRequest } from './serve-static.mjs'

describe('resolveRequest', () => {
  it('maps a path and a folder to files under the root', () => {
    expect(resolveRequest('/srv/sb', '/iframe.html?id=x')).toBe('/srv/sb/iframe.html')
    expect(resolveRequest('/srv/sb', '/')).toBe('/srv/sb/index.html')
  })
  it('keeps a dot-dot path inside the root (the URL parser collapses it)', () => {
    expect(resolveRequest('/srv/sb', '/../secret')).toBe('/srv/sb/secret')
    expect(resolveRequest('/srv/sb', '/%2e%2e/secret')).toBe('/srv/sb/secret')
  })
  it('refuses a path that only leaves the root once an encoded slash is decoded', () => {
    expect(resolveRequest('/srv/sb', '/..%2f..%2fsecret')).toBeNull()
    expect(resolveRequest('/srv/sb', '/a/..%2f..%2fsecret')).toBeNull()
  })
})
