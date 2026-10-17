// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { addConnectSrc, connectHostFromDsn, sentryBuildOptions } from './sentry-build.mjs'

describe('connectHostFromDsn', () => {
  it('returns the exact https origin of a US, EU and legacy DSN', () => {
    expect(connectHostFromDsn('https://abc@o1.ingest.us.sentry.io/2')).toBe('https://o1.ingest.us.sentry.io')
    expect(connectHostFromDsn('https://abc@o1.ingest.de.sentry.io/2')).toBe('https://o1.ingest.de.sentry.io')
    expect(connectHostFromDsn('https://abc@o1.ingest.sentry.io/2')).toBe('https://o1.ingest.sentry.io')
  })

  it('returns null for empty, malformed, non-https or wildcard input', () => {
    for (const bad of [undefined, null, '', '  ', 'not a url', 'http://abc@o1.ingest.sentry.io/2', 'https://*@*.sentry.io/2', 'ftp://a@b/1'])
      expect(connectHostFromDsn(bad)).toBeNull()
  })
})

describe('addConnectSrc', () => {
  const html = `<meta content="default-src 'self'; connect-src 'self' https://api.anthropic.com https://api.github.com; img-src 'self'">`

  it('appends exactly one host to connect-src and nothing else', () => {
    const out = addConnectSrc(html, 'https://o1.ingest.us.sentry.io')
    expect(out).toContain("connect-src 'self' https://api.anthropic.com https://api.github.com https://o1.ingest.us.sentry.io;")
    expect(out.replace(' https://o1.ingest.us.sentry.io', '')).toBe(html)
  })

  it('is a no-op without a host', () => {
    expect(addConnectSrc(html, null)).toBe(html)
  })

  it('throws if the policy has no connect-src to extend', () => {
    expect(() => addConnectSrc('<html></html>', 'https://o1.ingest.us.sentry.io')).toThrow(/connect-src/)
  })
})

describe('sentryBuildOptions', () => {
  it('is inert without a token: no maps', () => {
    expect(sentryBuildOptions({})).toEqual({ sourcemap: false })
    expect(sentryBuildOptions({ SENTRY_AUTH_TOKEN: '' })).toEqual({ sourcemap: false })
    expect(sentryBuildOptions({ VITE_SENTRY_DSN: 'https://abc@o1.ingest.us.sentry.io/2' })).toEqual({ sourcemap: false })
  })

  it('with a token: hidden maps and nothing else (the upload is the workflow\'s curl step, TODO/build-009)', () => {
    const options = sentryBuildOptions({ SENTRY_AUTH_TOKEN: 'fake-token-for-test', SENTRY_ORG: 'org', SENTRY_PROJECT: 'proj' })
    expect(options).toEqual({ sourcemap: 'hidden' })
    expect(JSON.stringify(options)).not.toContain('fake-token-for-test')
  })
})
