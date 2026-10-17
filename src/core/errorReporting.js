// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The one place the Sentry SDK is called (`TODO/build-004`, `docs/decisions/error-reporting.md`).
 *
 * Inert without `VITE_SENTRY_DSN`. The privacy rules live in {@link scrubEvent} and
 * {@link scrubBreadcrumb} only, not at call sites: no request bodies, no extras, no key-shaped
 * strings (the Anthropic key and GitHub token in `src/storage/tokenStorage.js`), no URL hash
 * fragments (`#/gist/<id>`), no replay, no tracing.
 *
 * @module core/errorReporting
 */
import * as Sentry from '@sentry/vue'

/** Key shapes the app stores: Anthropic `sk-ant-…`, GitHub `ghp_…` and `github_pat_…` tokens. */
const KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]{8,}|\bgh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/
/** A URL carrying a fragment, a relative `/#/route`, or a bare `#/route` hash fragment. */
const FRAGMENT_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s#"']*#[^\s"']+|(?:^|[\s"'(\/])#\/[\w-]|\/#[\w-]/i
/** Request headers that can carry credentials. */
const SECRET_HEADERS = new Set(['x-api-key', 'authorization', 'cookie', 'set-cookie', 'proxy-authorization'])
/** Integrations that record the screen or time the frame path; never enabled. */
const BLOCKED_INTEGRATIONS = new Set(['Console', 'BrowserTracing', 'Replay', 'ReplayCanvas', 'Feedback', 'BrowserProfiling'])
/** `Sentry.init`'s `dataCollection`: nothing optional is collected. */
export const DATA_COLLECTION = Object.freeze({
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
})
/** Bounds the walk over an event so a pathological object cannot stall the error path. */
const MAX_DEPTH = 12
const MAX_STRINGS = 5000

/**
 * @param {string} text
 * @returns {string} `text` without any `#fragment` of a URL.
 */
function stripFragment(text) {
  return text.replace(/(#[^\s"']*)/g, '')
}

/**
 * Every string value inside `value`, depth- and count-bounded, cycle-safe.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
function stringsIn(value) {
  /** @type {string[]} */
  const found = []
  const seen = new WeakSet()
  /** @param {unknown} node @param {number} depth */
  const walk = (node, depth) => {
    if (found.length >= MAX_STRINGS || depth > MAX_DEPTH) return
    if (typeof node === 'string') found.push(node)
    else if (node !== null && typeof node === 'object') {
      if (seen.has(node)) return
      seen.add(node)
      for (const child of Object.values(node)) walk(child, depth + 1)
    }
  }
  walk(value, 0)
  return found
}

/**
 * Whether `text` contains a stored-key shape.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function containsSecret(text) {
  return KEY_PATTERN.test(text)
}

/**
 * Whether anything inside `value` is a key or a URL fragment. Strings are tested one by one and
 * also joined, so a key split across two adjacent fields is still caught; a false positive only
 * drops one event, which is the safe direction.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function leaksPrivateText(value) {
  const strings = stringsIn(value)
  if (strings.some((text) => KEY_PATTERN.test(text) || FRAGMENT_PATTERN.test(text))) return true
  return KEY_PATTERN.test(strings.join(''))
}

/**
 * @param {Record<string, any>} headers
 * @returns {Record<string, any>} Headers without credential carriers; the referrer loses its fragment.
 */
function cleanHeaders(headers) {
  /** @type {Record<string, any>} */
  const out = {}
  for (const [name, value] of Object.entries(headers)) {
    if (SECRET_HEADERS.has(name.toLowerCase())) continue
    out[name] = typeof value === 'string' && /^referer$/i.test(name) ? stripFragment(value) : value
  }
  return out
}

/**
 * The scrubber for one breadcrumb (`beforeBreadcrumb`). Returns null to drop it.
 *
 * @param {Record<string, any> | null | undefined} breadcrumb
 * @returns {Record<string, any> | null}
 */
export function scrubBreadcrumb(breadcrumb) {
  if (breadcrumb === null || typeof breadcrumb !== 'object') return null
  if (leaksPrivateText(breadcrumb)) return null
  if (breadcrumb.data === null || typeof breadcrumb.data !== 'object') return breadcrumb
  const data = { ...breadcrumb.data }
  for (const field of ['body', 'request_body', 'response_body', 'headers', 'request_headers', 'response_headers']) delete data[field]
  return { ...breadcrumb, data }
}

/**
 * The scrubber for every outgoing event (`beforeSend`) — the single place privacy is decided.
 * Returns a cleaned copy, or null to drop the event. Never mutates its input.
 *
 * @param {Record<string, any> | null | undefined} event
 * @returns {Record<string, any> | null}
 */
export function scrubEvent(event) {
  if (event === null || event === undefined || typeof event !== 'object') return null
  const out = { ...event }
  delete out.extra
  if (out.request !== null && typeof out.request === 'object') {
    const request = { ...out.request }
    delete request.data
    delete request.cookies
    if (typeof request.url === 'string') request.url = stripFragment(request.url)
    if (request.headers !== null && typeof request.headers === 'object') request.headers = cleanHeaders(request.headers)
    out.request = request
  }
  if (Array.isArray(out.breadcrumbs)) {
    out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb).filter((crumb) => crumb !== null)
  }
  return leaksPrivateText(out) ? null : out
}

/**
 * Starts error reporting for `app`. Does nothing, and sends nothing, without a DSN.
 *
 * @param {object} options
 * @param {import('vue').App | object} options.app The Vue app, before it is mounted.
 * @param {Record<string, any>} [options.env] `import.meta.env`; injected in tests.
 * @returns {boolean} Whether the SDK was started.
 */
export function initErrorReporting({ app, env = import.meta.env }) {
  const dsn = typeof env.VITE_SENTRY_DSN === 'string' ? env.VITE_SENTRY_DSN.trim() : ''
  if (dsn === '') return false
  try {
    Sentry.init({
      app: /** @type {any} */ (app),
      dsn,
      release: env.VITE_SENTRY_RELEASE || undefined,
      environment: env.MODE,
      // Sentry 11 replaced `sendDefaultPii` (gone from the SDK) with `dataCollection`, whose
      // defaults collect user info, cookies, headers, bodies and query strings. Everything off.
      dataCollection: /** @type {any} */ (DATA_COLLECTION),
      attachProps: false,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      maxBreadcrumbs: 20,
      integrations: (/** @type {{ name: string }[]} */ defaults) => [
        ...defaults.filter((integration) => integration.name !== 'Breadcrumbs' && !BLOCKED_INTEGRATIONS.has(integration.name)),
        Sentry.breadcrumbsIntegration({ dom: false, history: false, fetch: true, xhr: true, sentry: true }),
      ],
      beforeSend: /** @type {any} */ (scrubEvent),
      beforeBreadcrumb: /** @type {any} */ (scrubBreadcrumb),
    })
    return true
  } catch {
    // Reporting must never be the reason the app fails to boot.
    return false
  }
}
