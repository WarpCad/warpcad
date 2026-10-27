// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/vue', () => ({
  init: vi.fn(),
  breadcrumbsIntegration: vi.fn((options) => ({ name: 'Breadcrumbs', options })),
}))

import * as Sentry from '@sentry/vue'
import { containsSecret, initErrorReporting, scrubBreadcrumb, scrubEvent } from './errorReporting.js'

// Shapes only, never a real credential.
const ANTHROPIC_KEY = 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA'
const GITHUB_TOKEN = 'ghp_' + 'B'.repeat(36)

beforeEach(() => {
  vi.mocked(Sentry.init).mockClear()
})

describe('initErrorReporting', () => {
  it('does not call Sentry.init without a DSN', () => {
    expect(initErrorReporting({ app: {}, env: {} })).toBe(false)
    expect(initErrorReporting({ app: {}, env: { VITE_SENTRY_DSN: '' } })).toBe(false)
    expect(initErrorReporting({ app: {}, env: { VITE_SENTRY_DSN: '   ' } })).toBe(false)
    expect(Sentry.init).not.toHaveBeenCalled()
  })

  it('initialises with privacy settings stated explicitly when a DSN is set', () => {
    const app = {}
    const env = { VITE_SENTRY_DSN: 'https://abc@o1.ingest.us.sentry.io/2', VITE_SENTRY_RELEASE: 'deadbeef', MODE: 'production' }
    expect(initErrorReporting({ app, env })).toBe(true)
    expect(Sentry.init).toHaveBeenCalledTimes(1)
    const options = /** @type {any} */ (vi.mocked(Sentry.init).mock.calls[0][0])
    expect(options.dsn).toBe(env.VITE_SENTRY_DSN)
    expect(options.app).toBe(app)
    expect(options.release).toBe('deadbeef')
    expect(options.environment).toBe('production')
    expect(options.sendDefaultPii).toBeUndefined() // gone in Sentry 11; dataCollection replaces it
    expect(options.dataCollection).toMatchObject({ userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false })
    expect(options.attachProps).toBe(false)
    expect(options.tracesSampleRate).toBe(0)
    expect(options.replaysSessionSampleRate).toBe(0)
    expect(options.replaysOnErrorSampleRate).toBe(0)
    expect(options.beforeSend).toBe(scrubEvent)
    expect(options.beforeBreadcrumb).toBe(scrubBreadcrumb)
  })

  it('removes tracing, replay and feedback integrations and replaces breadcrumbs with a narrow set', () => {
    initErrorReporting({ app: {}, env: { VITE_SENTRY_DSN: 'https://abc@o1.ingest.us.sentry.io/2' } })
    const { integrations } = /** @type {any} */ (vi.mocked(Sentry.init).mock.calls[0][0])
    const defaults = ['Breadcrumbs', 'Console', 'BrowserTracing', 'Replay', 'ReplayCanvas', 'Feedback', 'GlobalHandlers', 'Vue'].map((/** @type {string} */ name) => ({ name }))
    const names = integrations(defaults).map((/** @type {{ name: string }} */ integration) => integration.name)
    expect(names).toEqual(expect.arrayContaining(['GlobalHandlers', 'Vue', 'Breadcrumbs']))
    for (const gone of ['Console', 'BrowserTracing', 'Replay', 'ReplayCanvas', 'Feedback']) expect(names).not.toContain(gone)
    expect(names.filter((/** @type {string} */ name) => name === 'Breadcrumbs')).toHaveLength(1)
    expect(Sentry.breadcrumbsIntegration).toHaveBeenLastCalledWith(
      expect.objectContaining({ dom: false, history: false }),
    )
  })

  it('never throws if the SDK does', () => {
    vi.mocked(Sentry.init).mockImplementationOnce(() => {
      throw new Error('sdk exploded')
    })
    expect(initErrorReporting({ app: {}, env: { VITE_SENTRY_DSN: 'https://abc@o1.ingest.us.sentry.io/2' } })).toBe(false)
  })
})

describe('containsSecret', () => {
  it('recognises the stored key shapes', () => {
    expect(containsSecret(`error with ${ANTHROPIC_KEY} inside`)).toBe(true)
    expect(containsSecret(GITHUB_TOKEN)).toBe(true)
    expect(containsSecret('github_pat_' + 'C'.repeat(30))).toBe(true)
  })

  it('does not flag ordinary text', () => {
    expect(containsSecret('TypeError: x is undefined')).toBe(false)
    expect(containsSecret('sk-ant-')).toBe(false)
    expect(containsSecret('')).toBe(false)
  })
})

describe('scrubEvent', () => {
  it('passes an empty event through unharmed', () => {
    expect(scrubEvent({})).toEqual({})
  })

  it('returns null for a missing event', () => {
    expect(scrubEvent(null)).toBeNull()
    expect(scrubEvent(undefined)).toBeNull()
  })

  it('keeps an event with no breadcrumbs and no request', () => {
    const event = { message: 'boom', exception: { values: [{ type: 'Error', value: 'boom' }] } }
    expect(scrubEvent(event)).toEqual(event)
  })

  it('removes request.data, cookies, extra and secret-bearing headers', () => {
    const event = {
      message: 'boom',
      extra: { document: 'secret geometry' },
      request: {
        url: 'https://app.warpcad.com/',
        data: '{"messages":[]}',
        cookies: { a: 'b' },
        headers: { 'x-api-key': 'whatever', Authorization: 'Bearer x', Cookie: 'c=d', 'User-Agent': 'UA' },
      },
    }
    const out = /** @type {any} */ (scrubEvent(event))
    expect(out.extra).toBeUndefined()
    expect(out.request.data).toBeUndefined()
    expect(out.request.cookies).toBeUndefined()
    expect(out.request.headers).toEqual({ 'User-Agent': 'UA' })
    expect(out.request.url).toBe('https://app.warpcad.com/')
  })

  it('keeps the event but strips the fragment from request.url and the referrer', () => {
    const out = /** @type {any} */ (scrubEvent({
      message: 'boom',
      request: { url: 'https://app.warpcad.com/#/help/getting-started', headers: { Referer: 'https://app.warpcad.com/#/gist/abc123' } },
    }))
    expect(out).not.toBeNull()
    expect(out.request.url).toBe('https://app.warpcad.com/')
    expect(out.request.headers.Referer).toBe('https://app.warpcad.com/')
  })

  it('drops an event that contains a key anywhere', () => {
    expect(scrubEvent({ message: `failed with ${ANTHROPIC_KEY}` })).toBeNull()
    expect(scrubEvent({ exception: { values: [{ value: `bad ${GITHUB_TOKEN}` }] } })).toBeNull()
    expect(scrubEvent({ contexts: { deep: { er: { still: [ANTHROPIC_KEY] } } } })).toBeNull()
  })

  it('drops an event with a key-shaped string split across two fields', () => {
    expect(scrubEvent({ message: 'sk-ant-', transaction: 'api03-AAAAAAAAAAAAAAAA' })).toBeNull()
    expect(scrubEvent({ exception: { values: [{ type: 'ghp_', value: 'B'.repeat(36) }] } })).toBeNull()
  })

  it('never lets a share link, which is a whole project, through in a URL, breadcrumb or message', () => {
    const link = 'https://app.warpcad.com/#/share/v1/pVNNb9swDP0rBM8CBLRDDx0KFFgPG3YYsGMhULSskNEHDEmOA6P_vRSdNEm7ARuWg2lL5CN55OODS3rl'
    const out = /** @type {any} */ (scrubEvent({ message: 'boom', request: { url: link, headers: { Referer: link } } }))
    expect(out.request.url).toBe('https://app.warpcad.com/')
    expect(out.request.headers.Referer).toBe('https://app.warpcad.com/')
    expect(scrubEvent({ message: `failed to open ${link}` })).toBeNull()
    expect(scrubEvent({ message: 'route #/share/v1/pVNNb9swDP0 failed' })).toBeNull()
    expect(scrubBreadcrumb({ category: 'navigation', data: { to: link } })).toBeNull()
  })

  it('drops an event with a URL fragment outside request.url', () => {
    expect(scrubEvent({ message: 'at https://app.warpcad.com/#/gist/abc123 failed' })).toBeNull()
    expect(scrubEvent({ message: 'route #/gist/abc123 failed' })).toBeNull()
  })

  it('filters breadcrumbs: drops secret or fragment ones, strips bodies, keeps the rest', () => {
    const out = /** @type {any} */ (scrubEvent({
      message: 'boom',
      breadcrumbs: [
        { category: 'fetch', data: { url: 'https://api.anthropic.com/v1/messages', method: 'POST', status_code: 200, request_body: '{"x":1}', headers: { 'x-api-key': 'k' } } },
        { category: 'navigation', data: { from: '/#/gist/abc', to: '/#/gist/def' } },
        { category: 'console', message: `key ${ANTHROPIC_KEY}` },
        { category: 'ui.click', message: 'button.primary' },
      ],
    }))
    expect(out.breadcrumbs.map((/** @type {{ category: string }} */ crumb) => crumb.category)).toEqual(['fetch', 'ui.click'])
    expect(out.breadcrumbs[0].data).toEqual({ url: 'https://api.anthropic.com/v1/messages', method: 'POST', status_code: 200 })
  })

  it('tolerates an event that is empty after scrubbing, circular data and non-object breadcrumbs', () => {
    /** @type {Record<string, any>} */
    const circular = { a: 1 }
    circular.self = circular
    expect(() => scrubEvent({ contexts: { circular }, breadcrumbs: [null, 'x', {}] })).not.toThrow()
  })

  it('does not mutate its input', () => {
    const event = { extra: { a: 1 }, request: { data: 'x', url: 'https://a.test/#/h' } }
    scrubEvent(event)
    expect(event.extra).toEqual({ a: 1 })
    expect(event.request.data).toBe('x')
    expect(event.request.url).toBe('https://a.test/#/h')
  })
})

describe('scrubBreadcrumb', () => {
  it('drops a breadcrumb carrying a key or a fragment', () => {
    expect(scrubBreadcrumb({ message: ANTHROPIC_KEY })).toBeNull()
    expect(scrubBreadcrumb({ category: 'navigation', data: { to: 'https://x.test/#/gist/abc' } })).toBeNull()
  })

  it('removes request/response bodies and secret headers from network breadcrumbs', () => {
    const out = /** @type {any} */ (scrubBreadcrumb({ category: 'xhr', data: { url: 'https://api.github.com/gists', body: 'b', request_body: 'r', response_body: 's', headers: { a: 'b' }, status_code: 201 } }))
    expect(out.data).toEqual({ url: 'https://api.github.com/gists', status_code: 201 })
  })

  it('passes an empty or data-less breadcrumb through', () => {
    expect(scrubBreadcrumb({})).toEqual({})
    expect(scrubBreadcrumb({ message: 'ok' })).toEqual({ message: 'ok' })
    expect(scrubBreadcrumb(null)).toBeNull()
  })
})
